import VTBetaHelper from "main";
import { App, PluginSettingTab, Setting } from "obsidian";

export interface VTBetaHelperSettings {
	autoUpdate: boolean;
	token: string;
}

export const DEFAULT_SETTINGS: VTBetaHelperSettings = {
	autoUpdate: true,
	token: "",
};

export class VTBetaHelperSettingTab extends PluginSettingTab {
	plugin: VTBetaHelper;

	constructor(app: App, plugin: VTBetaHelper) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (!this.plugin.settings.token.trim()) {
			this.displayWelcomeScreen(containerEl);
		} else {
			this.displaySettingsScreen(containerEl);
		}
	}

	private displayTokenInput(parentEl: HTMLElement) {
		new Setting(parentEl)
			.setName("Access token")
			.setClass("vt-beta-token")
			.addText((text) =>
				text
					.setPlaceholder("Enter your access token")
					.setValue(this.plugin.settings.token)
					.onChange(async (value) => {
						this.plugin.settings.token = value.trim();
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button.setButtonText("Save").onClick(async () => {
					this.display();
				})
			);
	}

	private displayWelcomeScreen(parentEl: HTMLElement) {
		const containerEl = parentEl.createDiv({ cls: "vt-beta-welcome" });
		const headerEl = containerEl.createDiv({ cls: "vt-beta-header" });
		headerEl.innerHTML = `
        <h1>Welcome to Vertical Tabs Beta</h1>
        <p>
          This plugin will help you install and manage the beta versions of Vertical Tabs.
          To get started, please paste your access token below.
        </p>
      `;
		this.displayTokenInput(containerEl);
		const footerEl = containerEl.createDiv({ cls: "vt-beta-footer" });
		footerEl.innerHTML = `
        <p>
          After subscribing to the beta program, you should receive an email with your access token.
          If you didn't receive it, please check your spam folder. If you have any trouble, please
          contact me on <a href="https://ko-fi.com/oxdcq" target="_blank">Ko-fi</a>.
        </p>
        <p>
          If you haven't joined the beta program, make sure to read the
          <a href="https://oxdc.github.io/obsidian-vertical-tabs-docs/beta-program" target="_blank">
            FAQ on beta testing
          </a>
          carefully before subscribing.
        </p>
      `;
	}

	private displayAutoUpdateToggle(parentEl: HTMLElement) {
		new Setting(parentEl)
			.setName("Auto update")
			.setDesc("Whether to automatically check and update Vertical Tabs.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUpdate)
					.onChange(async (value) => {
						this.plugin.settings.autoUpdate = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private displaySettingsScreen(parentEl: HTMLElement) {
		const containerEl = parentEl.createDiv({ cls: "vt-beta-settings" });
		containerEl.innerHTML = `
      <h1>Vertical Tabs Beta Settings</h1>
      <p>Welcome onboard! Here you can configure the settings for the Vertical Tabs Beta plugin.</p>
    `;
		this.displayTokenInput(containerEl);
		this.displayAutoUpdateToggle(containerEl);
	}
}
