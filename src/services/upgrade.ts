import { App, normalizePath, DataAdapter } from "obsidian";
import { DownloadBuildSuccess, isDownloadBuildSuccess } from "./response";
import { ApiService, ApiException, ApiError } from "./api";
import {
	errorToString as e,
	makeError,
	randomString,
	sleep,
} from "../common/utils";
import * as JSZip from "jszip";

const VERTICAL_TABS_ID = "vertical-tabs";
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
const RETRYABLE_ERRORS = [ApiError.ServerError, ApiError.UnknownError];

export class UpgradeException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UpgradeException";
	}
}

// prettier-ignore
async function downloadBuild(apiService: ApiService, tag: string): Promise<DownloadBuildSuccess> {
	let lastError: Error | null = null;
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const result = await apiService.downloadBuild(tag);
			if (isDownloadBuildSuccess(result)) return result;
		} catch (error) {
			if (error instanceof ApiException) {
				// Build not ready - use server's retry_after hint
				if (error.error === ApiError.BuildNotReady) {
					lastError = error;
					if (attempt < MAX_RETRIES) {
						const retryAfter = (error.context.retry_after as number) || INITIAL_RETRY_DELAY;
						await sleep(retryAfter);
						continue; // Retry
					}
				}
				// Don't retry on logical errors (auth, not found)
				else if (RETRYABLE_ERRORS.includes(error.error)) {
					throw new UpgradeException(`Failed to download build '${tag}': ${e(error)}`);
				}
			}
			lastError = makeError(error);
			// Exponential backoff for network/server errors
			if (attempt < MAX_RETRIES) {
				const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
				await sleep(delay);
			}
		}
	}
	throw new UpgradeException(
		`Failed to download build '${tag}' after ${MAX_RETRIES + 1} attempts: ${e(lastError)}`
	);
}

async function verify(binaryData: ArrayBuffer, sha256: string): Promise<void> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", binaryData);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	if (hashHex !== sha256) {
		throw new UpgradeException(
			`Binary verification failed. Expected: ${sha256}, got: ${hashHex}`
		);
	}
}

async function cleanup(fs: DataAdapter, tempDir: string): Promise<void> {
	try {
		if (await fs.exists(tempDir)) await fs.rmdir(tempDir, true);
	} catch {
		// Ignore
	}
}

async function verifyAndUpgrade(
	app: App,
	result: DownloadBuildSuccess
): Promise<void> {
	const fs = app.vault.adapter;
	const root = app.plugins.getPluginFolder();
	const backupName = `${VERTICAL_TABS_ID}.backup.${Date.now()}`;
	const tempDir = normalizePath(`${root}/${randomString(10)}`);
	const targetDir = normalizePath(`${root}/${VERTICAL_TABS_ID}`);
	const backupDir = normalizePath(`${root}/${backupName}`);

	try {
		// Step 1: Verify the integrity of the build
		const binaryData = result.response.arrayBuffer;
		await verify(binaryData, result.sha256);

		// Step 2: Open the ZIP archive
		const zip = new JSZip();
		await zip.loadAsync(binaryData);
		if (Object.keys(zip.files).length === 0) {
			throw new UpgradeException("Malformed ZIP archive");
		}

		// Step 3: Extract the build to the temporary directory
		await fs.mkdir(tempDir);
		for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
			const path = normalizePath(`${tempDir}/${relativePath}`);
			if (zipEntry.dir) continue; // Skip directories
			const content = await zipEntry.async("arraybuffer");
			await fs.writeBinary(path, content);
		}

		// Step 4: Backup the existing plugin
		const hasBackup = await fs.exists(targetDir);
		if (hasBackup) await fs.copy(targetDir, backupDir);

		// Step 5: Install the new plugin
		try {
			await fs.rename(tempDir, targetDir);
			if (hasBackup) await cleanup(fs, backupDir);
		} catch (error) {
			if (hasBackup) await fs.rename(backupDir, targetDir); // Rollback
			throw new UpgradeException(`Install failed: ${e(error)}`);
		}
	} catch (error) {
		await cleanup(fs, tempDir);
		if (error instanceof UpgradeException) throw error;
		throw new UpgradeException(`Upgrade failed: ${e(error)}`);
	}
}

export async function reloadPlugin(app: App): Promise<void> {
	if (!app.plugins.plugins[VERTICAL_TABS_ID]) return;
	try {
		await app.plugins.disablePlugin(VERTICAL_TABS_ID);
		await app.plugins.enablePlugin(VERTICAL_TABS_ID);
	} catch (error) {
		throw new UpgradeException(`Failed to reload plugin: ${e(error)}`);
	}
}

export async function upgrade(
	app: App,
	tag: string,
	token: string
): Promise<void> {
	const apiService = new ApiService(token);
	const result = await downloadBuild(apiService, tag);
	await verifyAndUpgrade(app, result);
	await reloadPlugin(app);
}
