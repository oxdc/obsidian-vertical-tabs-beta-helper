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
}
