import { App, normalizePath, DataAdapter } from "obsidian";
import { DownloadBuildSuccess, isDownloadBuildSuccess } from "./response";
import { ApiService, ApiException, ApiError } from "./api";
import {
	errorToString as e,
	randomString,
	RetryConfig,
	retryWithBackoff,
} from "../common/utils";
import JSZip from "jszip";

const VERTICAL_TABS_ID = "vertical-tabs";
const RETRY_DELAY = 1000;
const RETRYABLE_ERRORS = [ApiError.ServerError, ApiError.UnknownError];

export class UpgradeException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UpgradeException";
	}
}

async function downloadBuild(
	apiService: ApiService,
	tag: string,
	manual = false
): Promise<DownloadBuildSuccess> {
	const retryConfig: RetryConfig = {
		maxRetries: 5,
		initialDelay: RETRY_DELAY,
		shouldRetry: (error) => {
			if (error instanceof ApiException) {
				if (error.error === ApiError.BuildNotReady) {
					const delay =
						(error.context?.retry_after as number) * 1000 ||
						RETRY_DELAY;
					return { retry: !manual, delay };
				}
				if (!RETRYABLE_ERRORS.includes(error.error)) {
					return { retry: false };
				}
			}
			return { retry: true };
		},
	};

	try {
		return await retryWithBackoff(async () => {
			const result = await apiService.downloadBuild(tag);
			if (!isDownloadBuildSuccess(result)) {
				throw new UpgradeException("Invalid server response.");
			}
			return result;
		}, retryConfig);
	} catch (error) {
		if (
			error instanceof ApiException ||
			error instanceof UpgradeException
		) {
			throw error;
		}
		throw new UpgradeException(`Failed to download: ${e(error)}`);
	}
}

async function verify(binaryData: ArrayBuffer, sha256: string): Promise<void> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", binaryData);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	if (hashHex !== sha256) {
		throw new UpgradeException(
			"File integrity check failed. The download may be corrupted."
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
			throw new UpgradeException(
				"The downloaded file is empty or corrupted."
			);
		}

		// Step 3: Extract the build to the temporary directory
		await fs.mkdir(tempDir);
		for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
			const path = normalizePath(`${tempDir}/${relativePath}`);
			if (zipEntry.dir) continue; // Skip directories
			const content = await zipEntry.async("arraybuffer");
			await fs.writeBinary(path, content);
		}

		// Step 4: Copy the existing settings file to the temporary directory
		const settingFile = normalizePath(`${targetDir}/data.json`);
		const hasSettingFile = await fs.exists(settingFile);
		const tempSettingFile = normalizePath(`${tempDir}/data.json`);
		if (hasSettingFile) await fs.copy(settingFile, tempSettingFile);

		// Step 5: Backup the existing plugin
		const hasBackup = await fs.exists(targetDir);
		if (hasBackup) await fs.rename(targetDir, backupDir);

		// Step 6: Install the new plugin
		try {
			await fs.rename(tempDir, targetDir);
			if (hasBackup) await cleanup(fs, backupDir);
		} catch (error) {
			if (hasBackup) await fs.rename(backupDir, targetDir); // Rollback
			throw new UpgradeException(`Installation failed: ${e(error)}`);
		}
	} catch (error) {
		await cleanup(fs, tempDir);
		if (error instanceof UpgradeException) throw error;
		throw new UpgradeException(e(error));
	}
}

export async function reloadPlugin(app: App): Promise<void> {
	try {
		if (app.plugins.getPlugin(VERTICAL_TABS_ID)) {
			await app.plugins.disablePlugin(VERTICAL_TABS_ID);
		}
		const root = app.plugins.getPluginFolder();
		const targetDir = normalizePath(`${root}/${VERTICAL_TABS_ID}`);
		await app.plugins.loadManifest(targetDir);
		await app.plugins.enablePluginAndSave(VERTICAL_TABS_ID);
	} catch (error) {
		throw new UpgradeException(`Failed to reload the plugin: ${e(error)}`);
	}
}

export async function upgrade(
	app: App,
	tag: string,
	token: string,
	manual = false
): Promise<void> {
	const apiService = new ApiService(token);
	const result = await downloadBuild(apiService, tag, manual);
	await verifyAndUpgrade(app, result);
	await reloadPlugin(app);
}
