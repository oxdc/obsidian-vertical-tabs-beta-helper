import { App, normalizePath, DataAdapter } from "obsidian";
import { DownloadBuildSuccess, isDownloadBuildSuccess } from "./response";
import { ApiService, ApiException, ApiError } from "./api";
import { errorToString as e, randomString, RetryConfig, retryWithBackoff } from "../common/utils";
import { unzip } from "unzipit";
import { runPostinstallationTasks, runPreinstallationTasks } from "./migration";
import { installLog, installLogError } from "./installLog";

const VERTICAL_TABS_ID = "vertical-tabs";
const RETRY_DELAY = 1000;
const RETRYABLE_ERRORS = [ApiError.ServerError, ApiError.UnknownError];

export class InstallException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InstallException";
	}
}

async function downloadBuild(apiService: ApiService, tag: string, manual = false): Promise<DownloadBuildSuccess> {
	const retryConfig: RetryConfig = {
		maxRetries: 5,
		initialDelay: RETRY_DELAY,
		shouldRetry: (error, attempt) => {
			if (error instanceof ApiException) {
				if (error.error === ApiError.BuildNotReady) {
					const delay = (error.context?.retry_after as number) * 1000 || RETRY_DELAY;
					const decision = { retry: !manual, delay };
					if (decision.retry) installLog(`Build not ready, retrying in ${delay}ms (attempt ${attempt + 1})...`);
					return decision;
				}
				if (!RETRYABLE_ERRORS.includes(error.error)) return { retry: false };
			}
			installLog(`Download failed (${e(error)}), retrying (attempt ${attempt + 1})...`);
			return { retry: true };
		},
	};

	installLog(`Downloading build ${tag}...`);
	try {
		const result = await retryWithBackoff(async () => {
			const result = await apiService.downloadBuild(tag);
			if (!isDownloadBuildSuccess(result)) throw new InstallException("Invalid server response.");
			return result;
		}, retryConfig);
		const bytes = result.response.arrayBuffer.byteLength;
		installLog(`Download complete (${bytes} bytes).`);
		return result;
	} catch (error) {
		if (error instanceof ApiException || error instanceof InstallException) throw error;
		throw new InstallException(`Failed to download: ${e(error)}`);
	}
}

async function verify(binaryData: ArrayBuffer, sha256: string): Promise<void> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", binaryData);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	if (hashHex !== sha256) throw new InstallException("File integrity check failed. The download may be corrupted.");
}

async function cleanup(fs: DataAdapter, tempDir: string): Promise<void> {
	try {
		if (await fs.exists(tempDir)) await fs.rmdir(tempDir, true);
	} catch {
		// Ignore
	}
}

async function verifyAndInstall(app: App, result: DownloadBuildSuccess): Promise<void> {
	const fs = app.vault.adapter;
	const root = app.plugins.getPluginFolder();
	const backupName = `${VERTICAL_TABS_ID}.backup.${Date.now()}`;
	const tempDir = normalizePath(`${root}/${randomString(10)}`);
	const targetDir = normalizePath(`${root}/${VERTICAL_TABS_ID}`);
	const backupDir = normalizePath(`${root}/${backupName}`);

	try {
		// Step 1: Verify the integrity of the build
		const binaryData = result.response.arrayBuffer;
		installLog("Verifying SHA-256 checksum...");
		await verify(binaryData, result.sha256);
		installLog("Checksum OK.");

		// Step 2: Open the ZIP archive
		installLog("Opening ZIP archive...");
		const { entries } = await unzip(binaryData);
		const zipEntries = Object.keys(entries);
		if (zipEntries.length === 0) throw new InstallException("The downloaded file is empty or corrupted.");
		installLog(`ZIP contains ${zipEntries.length} entries.`);

		// Step 3: Extract the build to the temporary directory
		installLog(`Extracting to ${tempDir}...`);
		await fs.mkdir(tempDir);
		let fileCount = 0;
		for (const [relativePath, zipEntry] of Object.entries(entries)) {
			const path = normalizePath(`${tempDir}/${relativePath}`);
			if (zipEntry.isDirectory) continue;
			const content = await zipEntry.arrayBuffer();
			await fs.writeBinary(path, content);
			fileCount++;
		}
		installLog(`Extracted ${fileCount} file(s).`);

		// Step 4: Copy the existing settings file to the temporary directory
		const settingFile = normalizePath(`${targetDir}/data.json`);
		const hasSettingFile = await fs.exists(settingFile);
		const tempSettingFile = normalizePath(`${tempDir}/data.json`);
		if (hasSettingFile) {
			installLog("Preserving existing data.json...");
			await fs.copy(settingFile, tempSettingFile);
		}

		// Step 5: Backup the existing plugin
		const hasBackup = await fs.exists(targetDir);
		if (hasBackup) {
			installLog(`Backing up current plugin to ${backupName}...`);
			await fs.rename(targetDir, backupDir);
		}

		// Step 6: Install the new plugin
		installLog(`Installing into ${targetDir}...`);
		try {
			await fs.rename(tempDir, targetDir);
			if (hasBackup) await cleanup(fs, backupDir);
		} catch (error) {
			if (hasBackup) {
				installLog("Install failed, rolling back from backup...");
				await fs.rename(backupDir, targetDir);
			}
			throw new InstallException(`Installation failed: ${e(error)}`);
		}
		installLog("Files installed on disk.");
	} catch (error) {
		installLog("Cleaning up temporary files...");
		await cleanup(fs, tempDir);
		if (error instanceof InstallException) throw error;
		throw new InstallException(e(error));
	}
}

async function unloadPlugin(app: App): Promise<void> {
	try {
		if (app.plugins.getPlugin(VERTICAL_TABS_ID)) {
			installLog("Disabling Vertical Tabs...");
			await app.plugins.disablePlugin(VERTICAL_TABS_ID);
			installLog("Vertical Tabs disabled.");
		} else {
			installLog("Vertical Tabs is not loaded; skip disable.");
		}
	} catch (error) {
		throw new InstallException(`Failed to unload the plugin: ${e(error)}`);
	}
}

async function loadPlugin(app: App): Promise<void> {
	const root = app.plugins.getPluginFolder();
	const targetDir = normalizePath(`${root}/${VERTICAL_TABS_ID}`);
	if (!(await app.vault.adapter.exists(targetDir))) {
		installLog(`Plugin directory not found at ${targetDir}; skip load.`);
		return;
	}
	try {
		installLog("Loading manifest and enabling Vertical Tabs...");
		await app.plugins.loadManifest(targetDir);
		await app.plugins.enablePluginAndSave(VERTICAL_TABS_ID);
		const plugin = app.plugins.getPlugin(VERTICAL_TABS_ID);
		const version = plugin?.manifest.version ?? "unknown";
		installLog(`Vertical Tabs enabled (version ${version}).`);
	} catch (error) {
		throw new InstallException(`Failed to load the plugin: ${e(error)}`);
	}
}

export async function install(
	app: App,
	current: string | null,
	tag: string,
	token: string,
	manual = false
): Promise<void> {
	const from = current ?? "(none)";
	installLog(`Begin install → ${tag} (from ${from}, ${manual ? "manual" : "auto"})`);
	const apiService = new ApiService(token);
	try {
		const result = await downloadBuild(apiService, tag, manual);
		await unloadPlugin(app);
		try {
			if (current) {
				installLog(`Running pre-installation tasks (${current} → ${tag})...`);
				await runPreinstallationTasks(app, current, tag);
				installLog("Pre-installation tasks finished.");
			} else {
				installLog("Skipping pre-installation tasks (no prior version).");
			}
			await verifyAndInstall(app, result);
			if (current) {
				installLog(`Running post-installation tasks (${current} → ${tag})...`);
				await runPostinstallationTasks(app, current, tag);
				installLog("Post-installation tasks finished.");
			} else {
				installLog("Skipping post-installation tasks (no prior version).");
			}
		} finally {
			installLog("Reloading Vertical Tabs...");
			await loadPlugin(app);
		}
		installLog(`Install completed successfully → ${tag}`);
	} catch (error) {
		installLogError("Install failed", error);
		throw error;
	}
}
