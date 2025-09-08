import { Plugin } from "obsidian";
import {
	VTBetaHelperSettings,
	VTBetaHelperSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";

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
			this.settings.token = accessToken.trim();
			await this.saveSettings();
		}
		this.app.setting.open();
		this.app.setting.openTabById(this.manifest.id);
	}
}
