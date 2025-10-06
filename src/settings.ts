import VTBetaHelper from "./main";
import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	TextComponent,
} from "obsidian";
import { SecurityWarningConfirmationModal } from "./warning";
import { validateToken } from "./services/auth";

export interface VTBetaHelperSettings {
	token: string;
	autoUpdate: boolean;
	showUpdateNotification: boolean;
	showReleaseNotes: boolean;
	hideSecurityInfo: boolean;
}

export const DEFAULT_SETTINGS: VTBetaHelperSettings = {
	token: "",
	autoUpdate: true,
	showUpdateNotification: true,
	showReleaseNotes: true,
	hideSecurityInfo: false,
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

	private displayTokenInput(parentEl: HTMLElement, filled = false) {
		let token = "";
		let textEl: TextComponent | null;
		let inputEl: HTMLInputElement | null;

		const removeToken = async () => {
			this.plugin.settings.token = "";
			await this.plugin.saveSettings();
			this.display();
		};

		const setToken = async () => {
			textEl?.setDisabled(true);
			const { isValid, errorMessage } = await validateToken(token);
			textEl?.setDisabled(false);
			if (isValid) {
				this.plugin.settings.token = token;
				await this.plugin.saveSettings();
				this.display();
			} else {
				if (inputEl) {
					inputEl.setCustomValidity(errorMessage);
					inputEl.reportValidity();
				} else {
					new Notice(errorMessage);
				}
			}
		};

		new Setting(parentEl)
			.setName("Access token")
			.setClass("vt-beta-token")
			.addText((text) => {
				text.setPlaceholder("Enter your access token")
					.setValue(this.plugin.settings.token)
					.onChange((value) => {
						token = value;
						if (inputEl) inputEl.setCustomValidity("");
					})
					.setDisabled(filled);
				textEl = text;
				inputEl = text.inputEl;
			})
			.addButton((button) => {
				button
					.setButtonText(filled ? "Remove" : "Continue")
					.onClick(async () => (filled ? removeToken() : setToken()));
				if (filled) button.setWarning();
			});
	}

	private displayWelcomeScreen(parentEl: HTMLElement) {
		const containerEl = parentEl.createDiv({ cls: "vt-beta-welcome" });
		const headerEl = containerEl.createDiv({ cls: "vt-beta-header" });
		headerEl.innerHTML = `
        <h1>Welcome to Vertical Tabs <span class="vt-beta-tag">Beta</span></h1>
        <p>
          This plugin will help you install and manage the beta versions of Vertical Tabs.
          To get started, please paste your access token below.
        </p>
      `;
		this.displayTokenInput(containerEl, false);
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
          carefully before subscribing. Please keep your access token private. Vertical Tabs Beta
          is for personal use only. Please DO NOT share, sell, or distribute it to anyone.
        </p>
      `;
	}

	private displayOptions(parentEl: HTMLElement) {
		new Setting(parentEl)
			.setName("Auto update")
			.setDesc("Whether to automatically check and update Vertical Tabs.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUpdate)
					.onChange(async (value) => {
						this.plugin.settings.autoUpdate = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (!this.plugin.settings.autoUpdate) {
			new Setting(parentEl)
				.setName("Show update notification")
				.setDesc(
					"Whether to show a notification when a new version is available."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.showUpdateNotification)
						.onChange(async (value) => {
							this.plugin.settings.showUpdateNotification = value;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(parentEl)
			.setName("Show release notes")
			.setDesc("Whether to show what's new in the latest beta version.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showReleaseNotes)
					.onChange(async (value) => {
						this.plugin.settings.showReleaseNotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(parentEl)
			.setName("Hide security warnings")
			.setDesc("Whether to hide the security warnings.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideSecurityInfo)
					.onChange(async (value) => {
						const updateAndSave = async () => {
							this.plugin.settings.hideSecurityInfo = value;
							await this.plugin.saveSettings();
							this.display();
						};

						if (value) {
							// To enable, show confirmation modal
							new SecurityWarningConfirmationModal(this.app, {
								onConfirm: () => updateAndSave(),
								onCancel: () => toggle.setValue(false),
							}).open();
						} else {
							// To disable, no confirmation needed
							await updateAndSave();
							return;
						}
					})
			);
	}

	private displaySettingsScreen(parentEl: HTMLElement) {
		const containerEl = parentEl.createDiv({ cls: "vt-beta-settings" });
		containerEl.innerHTML = `
      <h1>Vertical Tabs <span class="vt-beta-tag">Beta</span></h1>
      <p>Welcome onboard! And thank you for your support!</p>
    `;
		this.displayOptions(containerEl);
		new Setting(containerEl).setName("License").setHeading();
		this.displayTokenInput(containerEl, true);
		const footerEl = containerEl.createDiv({ cls: "vt-beta-footer" });
		footerEl.innerHTML = `
      <p>
        If you have any trouble, please contact me on
        <a href="https://ko-fi.com/oxdcq" target="_blank">Ko-fi</a>
        or report issues on
        <a href="https://github.com/oxdc/obsidian-vertical-tabs/issues/new/choose" target="_blank">GitHub</a>.
      </p>
      <p>
        To rollback to the public version of Vertical Tabs, please unsubscribe on
        <a href="https://ko-fi.com/" target="_blank">Ko-fi</a>
        , uninstall Vertical Tabs Beta and this helper, then reinstall Vertical Tabs from the
        community plugin store. Your settings may not be compatible with the public version and
        will not be preserved.
      </p>
      <p>
        Please keep your access token private. Vertical Tabs Beta is for personal use only. Please
        DO NOT share, sell, or distribute it to anyone.
      </p>
    `;
	}
}
