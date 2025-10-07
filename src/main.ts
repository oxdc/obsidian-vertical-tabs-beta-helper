import { Notice, Plugin } from "obsidian";
import {
	VTBetaHelperSettings,
	VTBetaHelperSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { validateToken, normalizeToken } from "./services/auth";
import { upgrade } from "./services/upgrade";
import { listBuilds } from "./services/list";
import { errorToString as e } from "./common/utils";

const MESSAGE_INTERVAL = 10000; // 10 seconds
const VERTICAL_TABS_ID = "vertical-tabs";
const HOUR = 1000 * 60 * 60;

export default class VTBetaHelper extends Plugin {
	settings: VTBetaHelperSettings;
	private updateCheckInterval: number | null = null;

	// Public - Lifecycle Methods

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new VTBetaHelperSettingTab(this.app, this));
		this.registerObsidianProtocolHandler(
			"vtbetahelper",
			this.setupHandler.bind(this)
		);
		if (this.settings.token) this.startUpdateChecker();
	}

	onunload() {
		this.stopUpdateChecker();
	}

	// Public - Settings

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Public - Setup Handler

	async setupHandler(params: Record<string, string>): Promise<void> {
		const setting = params["setting"]?.toLowerCase();
		if (setting !== "setup") return;
		const accessToken = params["accessToken"];
		if (typeof accessToken === "string" && accessToken.trim()) {
			const { isValid, errorMessage } = await validateToken(accessToken);
			if (isValid) {
				this.settings.token = normalizeToken(accessToken);
				await this.saveSettings();
				this.startUpdateChecker();
			} else {
				new Notice(errorMessage, MESSAGE_INTERVAL);
			}
		}
		this.app.setting.open();
		this.app.setting.openTabById(this.manifest.id);
	}

	// Public - Security Context

	async requestSecurityContext() {
		return !this.settings.hideSecurityInfo;
	}

	// Public - Update Checker

	startUpdateChecker() {
		this.stopUpdateChecker();
		if (!this.settings.autoUpdate) return;
		this.updateCheckInterval = this.registerInterval(
			window.setInterval(
				() => this.checkForUpdates(),
				this.settings.updateCheckInterval * HOUR
			)
		);
	}

	stopUpdateChecker() {
		if (this.updateCheckInterval === null) return;
		window.clearInterval(this.updateCheckInterval);
		this.updateCheckInterval = null;
	}

	getCurrentVersion(): string | null {
		const plugin = this.app.plugins.plugins[VERTICAL_TABS_ID];
		return plugin?.manifest.version || null;
	}

	// Private - Update Checker

	private async checkForUpdates(): Promise<void> {
		if (!this.settings.token) return;
		try {
			const response = await listBuilds(this.settings.token, 1, 0);
			if (!response.success || response.data.length === 0) return;
			const latestBuild = response.data[0];
			const currentVersion = this.getCurrentVersion();
			if (currentVersion && latestBuild.tag !== currentVersion) {
				if (this.settings.autoUpdate) {
					await this.upgradeToVersion(latestBuild.tag);
				} else if (this.settings.showUpdateNotification) {
					new Notice(
						`Vertical Tabs ${latestBuild.tag} is now available. Check settings to update.`,
						MESSAGE_INTERVAL
					);
				}
			}
		} catch (error) {
			new Notice(
				"Failed to check for Vertical Tabs Beta updates: " + e(error),
				MESSAGE_INTERVAL
			);
		}
	}

	async upgradeToVersion(tag: string): Promise<void> {
		if (!this.settings.token) return;
		try {
			await upgrade(this.app, tag, this.settings.token);
		} catch (error) {
			new Notice(
				"Failed to upgrade Vertical Tabs Beta: " + e(error),
				MESSAGE_INTERVAL
			);
		}
	}
}
