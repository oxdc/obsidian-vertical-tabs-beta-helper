import { Notice, Plugin } from "obsidian";
import {
	VTBetaHelperSettings,
	VTBetaHelperSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { validateToken, normalizeToken } from "./services/auth";

export default class VTBetaHelper extends Plugin {
	settings: VTBetaHelperSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new VTBetaHelperSettingTab(this.app, this));
		this.registerObsidianProtocolHandler(
			"vtbetahelper",
			this.setupHandler.bind(this)
		);
	}

	onunload() {}

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

	async setupHandler(params: Record<string, string>): Promise<void> {
		const setting = params["setting"]?.toLowerCase();
		if (setting !== "setup") return;
		const accessToken = params["accessToken"];
		if (typeof accessToken === "string" && accessToken.trim()) {
			const { isValid, errorMessage } = await validateToken(accessToken);
			if (isValid) {
				this.settings.token = normalizeToken(accessToken);
				await this.saveSettings();
			} else {
				new Notice(errorMessage, 10000);
			}
		}
		this.app.setting.open();
		this.app.setting.openTabById(this.manifest.id);
	}

	async requestSecurityContext() {
		return !this.settings.hideSecurityInfo;
	}
}
