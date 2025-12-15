import VTBetaHelper from "./main";
import {
	App,
	ExtraButtonComponent,
	Notice,
	PluginSettingTab,
	requireApiVersion,
	Setting,
	SettingGroup,
	TextComponent,
} from "obsidian";
import { SecurityWarningConfirmationModal } from "./warning";
import {
	normalizeToken,
	refreshSubscription,
	validateToken,
} from "./services/auth";
import { listBuilds } from "./services/list";
import moment from "moment";
import { errorToString as e } from "./common/utils";
import { ReleaseNoteModal } from "./release_note";
import { BuildsResult, cache, SubscriptionData } from "./services/cache";

const PAGE_SIZE = 5;

export interface VTBetaHelperSettings {
	token: string;
	autoUpdate: boolean;
	updateCheckInterval: number;
	showUpdateNotification: boolean;
	showReleaseNotes: boolean;
	hideSecurityInfo: boolean;
}

export const DEFAULT_SETTINGS: VTBetaHelperSettings = {
	token: "",
	autoUpdate: true,
	updateCheckInterval: 1,
	showUpdateNotification: true,
	showReleaseNotes: true,
	hideSecurityInfo: false,
};

interface HeaderProps {
	title: string;
	description: string;
}

export class VTBetaHelperSettingTab extends PluginSettingTab {
	plugin: VTBetaHelper;
	private currentPage = 0;
	private showAdvancedOptions = false;

	constructor(app: App, plugin: VTBetaHelper) {
		super(app, plugin);
		this.plugin = plugin;
		if (requireApiVersion("1.11.0")) {
			this.icon = "vertical-tabs-beta-helper";
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (!this.plugin.settings.token.trim()) {
			this.currentPage = 0;
			this.displayWelcomeScreen(containerEl);
		} else {
			this.displaySettingsScreen(containerEl);
		}
	}

	// Component helpers

	private createSettingGroup(parentEl: HTMLElement, name: string) {
		if (requireApiVersion("1.11.0")) {
			return new SettingGroup(parentEl).setHeading(name);
		} else {
			return new Setting(parentEl).setName(name).setHeading();
		}
	}

	// prettier-ignore
	private createSetting(parentEl: HTMLElement | SettingGroup, callback?: (setting: Setting) => void) {
		if (requireApiVersion("1.11.0") && parentEl instanceof SettingGroup) {
			let setting: Setting | undefined;
			parentEl.addSetting((s) => { setting = s; if(callback) callback(s); });
			if (!setting) throw new Error("Failed to create setting");
			return setting;
		} else if (parentEl instanceof HTMLElement) {
			const setting = new Setting(parentEl);
			if(callback) callback(setting);
			return setting;
		} else {
			throw new Error("Invalid parent element or unsupported API version");
		}
	}

	// Shared components

	private displayDocLinks(parentEl: HTMLElement) {
		const docEl = parentEl.createEl("p", { cls: "vt-beta-doc-links" });
		if (requireApiVersion("1.11.0")) docEl.addClass("new-design");
		docEl
			.createEl("a", {
				href: "https://vertical-tabs-docs.oxdc.dev/Beta-Versions/terms",
				text: "Terms of Service",
			})
			.setAttr("target", "_blank");
		docEl.appendText(" · ");
		docEl
			.createEl("a", {
				href: "https://vertical-tabs-docs.oxdc.dev/Beta-Versions/security",
				text: "Privacy Policy",
			})
			.setAttr("target", "_blank");
		docEl.appendText(" · ");
		docEl
			.createEl("a", {
				href: "https://vertical-tabs-docs.oxdc.dev/Beta-Versions/beta-faq",
				text: "FAQ",
			})
			.setAttr("target", "_blank");
		docEl.appendText(" · ");
		docEl
			.createEl("a", {
				href: "https://status.oxdc.dev",
				text: "Status",
			})
			.setAttr("target", "_blank");
		docEl.appendText(" · ");
		docEl
			.createEl("a", {
				href: "https://ko-fi.com/oxdcq",
				text: "Ko-fi",
			})
			.setAttr("target", "_blank");
		docEl.appendText(" · ");
		docEl
			.createEl("a", {
				href: "https://github.com/oxdc/obsidian-vertical-tabs",
				text: "GitHub",
			})
			.setAttr("target", "_blank");
	}

	private displayTokenInput(
		parentEl: HTMLElement | SettingGroup,
		filled = false
	) {
		let token = "";
		let textEl: TextComponent | null;
		let inputEl: HTMLInputElement | null;

		const removeToken = async () => {
			this.plugin.settings.token = "";
			await this.plugin.saveSettings();
			this.plugin.stopUpdateChecker();
			this.display();
		};

		const setToken = async () => {
			textEl?.setDisabled(true);
			const { isValid, errorMessage } = await validateToken(token);
			textEl?.setDisabled(false);
			if (isValid) {
				this.plugin.settings.token = token;
				await this.plugin.saveSettings();
				this.plugin.startUpdateChecker();
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

		this.createSetting(parentEl, (setting) => {
			setting
				.setName("Access token")
				.setClass("vt-beta-token")
				.addText((text) => {
					text.setPlaceholder("Enter your access token")
						.setValue(this.plugin.settings.token)
						.onChange((value) => {
							token = normalizeToken(value);
							if (inputEl) inputEl.setCustomValidity("");
						})
						.setDisabled(filled);
					textEl = text;
					inputEl = text.inputEl;
				})
				.addButton((button) => {
					button
						.setButtonText(filled ? "Remove" : "Continue")
						.onClick(async () =>
							filled ? removeToken() : setToken()
						);
					if (filled) button.setWarning();
				});
		});
	}

	private displayHeader(parentEl: HTMLElement, props: HeaderProps) {
		const headerEl = parentEl.createDiv({ cls: "vt-beta-header" });
		if (requireApiVersion("1.11.0")) headerEl.addClass("new-design");
		const headerWrapperEl = headerEl.createEl("h1");
		headerWrapperEl.appendText(props.title + " ");
		headerWrapperEl.createSpan({ cls: "vt-beta-tag", text: "Beta" });
		headerEl.createEl("p", { text: props.description });
	}

	private displayFooter(parentEl: HTMLElement, paragraphs: string[]) {
		const footerEl = parentEl.createDiv({ cls: "vt-beta-footer" });
		if (requireApiVersion("1.11.0")) footerEl.addClass("new-design");
		for (const paragraph of paragraphs) {
			footerEl.createEl("p", { text: paragraph });
		}
	}

	// Welcome screen

	private displayWelcomeScreen(parentEl: HTMLElement) {
		const containerEl = parentEl.createDiv({ cls: "vt-beta-welcome" });
		this.displayHeader(containerEl, {
			title: "Welcome to Vertical Tabs",
			description: `This plugin will help you install and manage the beta versions of
			              Vertical Tabs. To get started, please paste your access token below.`,
		});

		this.displayTokenInput(containerEl, false);
		this.displayDocLinks(containerEl);

		this.displayFooter(containerEl, [
			`After subscribing to the beta program, you should receive an email
			   with your access token. If you didn't receive it, please check your
			   spam folder. If you have any trouble, please contact me on Ko-fi.`,
			`If you haven't joined the beta program, make sure to read the Terms of
			   Service, Privacy Policy and FAQ carefully before subscribing. Please
			   keep your access token private. Vertical Tabs Beta is for personal use
			   only. Please DO NOT share, sell, or distribute it to anyone.`,
		]);
	}

	// Settings screen

	private displaySettingsScreen(parentEl: HTMLElement) {
		const containerEl = parentEl.createDiv({ cls: "vt-beta-settings" });
		this.displayHeader(containerEl, {
			title: "Vertical Tabs",
			description: "Welcome onboard! And thank you for your support!",
		});

		this.displayBuilds(containerEl);
		this.displayOptions(containerEl);
		this.displayLicense(containerEl);
		this.displayDocLinks(containerEl);

		this.displayFooter(containerEl, [
			`To rollback to the public version of Vertical Tabs, please unsubscribe
			   on Ko-fi, uninstall Vertical Tabs Beta and this helper, then reinstall
			   Vertical Tabs from the community plugin store. Your settings may not be
			   compatible with the public version and will not be preserved.`,
			`Please keep your access token private. Vertical Tabs Beta is for personal
			   use only. Please DO NOT share, sell, or distribute it to anyone.`,
		]);
	}

	// Settings screen - Builds

	private displayBuilds(parentEl: HTMLElement) {
		const group = this.createSettingGroup(parentEl, "Available builds");
		this.addCssClass(group, "vt-beta-builds-title");
		this.displayRefreshButton(group);
		this.displayAvailableBuilds(parentEl, group);
	}

	private addCssClass(group: Setting | SettingGroup, className: string) {
		if (group instanceof Setting) {
			group.settingEl.addClass(className);
		} else {
			group.headerEl.addClass(className);
			group.headerEl.addClass("new-design");
		}
	}

	private displayRefreshButton(parentEl: Setting | SettingGroup) {
		const buildButton = (button: ExtraButtonComponent) => {
			button
				.setIcon("refresh-cw")
				.setTooltip("Refresh")
				.onClick(() => {
					cache.invalidate();
					this.display();
				});
		};
		if (parentEl instanceof Setting) {
			parentEl.addExtraButton(buildButton);
		} else if (
			requireApiVersion("1.11.0") &&
			parentEl instanceof SettingGroup
		) {
			buildButton(new ExtraButtonComponent(parentEl.controlEl));
		}
	}

	private async displayAvailableBuilds(
		containerEl: HTMLElement,
		group: Setting | SettingGroup
	) {
		const parentEl = group instanceof Setting ? containerEl : group.listEl;
		const token = this.plugin.settings.token;
		const buildsEl = parentEl.createDiv({ cls: "vt-beta-builds" });
		if (!token) {
			this.displayEmptyList(buildsEl);
			return;
		}

		this.displayLoadingIndicator(buildsEl, "Loading builds...");

		try {
			const result = await cache.fetchBuilds(
				token,
				this.currentPage,
				PAGE_SIZE,
				async () => {
					const offset = this.currentPage * PAGE_SIZE;
					const response = await listBuilds(token, PAGE_SIZE, offset);
					if (!response.success || response.data.length === 0) {
						throw new Error("No builds available.");
					}
					return response;
				}
			);
			buildsEl.empty();
			this.displayBuildList(buildsEl, result);
		} catch (error) {
			buildsEl.empty();
			buildsEl.createEl("p", {
				text: "Unable to load builds: " + e(error),
			});
		}
	}

	private displayLoadingIndicator(parentEl: HTMLElement, text: string) {
		const loadingEl = parentEl.createDiv({ cls: "vt-beta-loading" });
		const loadingTextEl = loadingEl.createEl("p", { cls: "mod-loading" });
		loadingTextEl.createSpan({ cls: "vt-loading-icon" });
		loadingTextEl.appendText(text);
	}

	private displayEmptyList(parentEl: HTMLElement) {
		parentEl.createEl("p", { text: "No builds available." });
	}

	private displayBuildList(parentEl: HTMLElement, result: BuildsResult) {
		const { data: builds, has_more, total } = result;
		const currentVersion = this.plugin.getCurrentVersion();
		if (!requireApiVersion("1.11.0")) {
			parentEl.createDiv(); // dummy div for consistent visual styles
		}
		for (const build of builds) {
			const isCurrent = build.tag === currentVersion;
			const buildEl = new Setting(parentEl).setName(build.tag);
			if (build.short_summary) {
				buildEl.setDesc(build.short_summary);
			}
			buildEl.settingEl.toggleClass("mod-current", isCurrent);
			buildEl.settingEl.toggleClass("mod-latest", build.latest);
			if (build.latest) {
				buildEl.nameEl.createEl("a", { cls: "tag", text: "latest" });
			}
			if (isCurrent) {
				buildEl.nameEl.createEl("a", { cls: "tag", text: "installed" });
			}
			buildEl.addExtraButton((button) => {
				button
					.setIcon("info")
					.setTooltip("Release note")
					.setDisabled(build.release_note === null)
					.onClick(async () => {
						new ReleaseNoteModal(this.app, build).open();
					});
			});
			buildEl.addExtraButton((button) => {
				const installBtnEl = button.extraSettingsEl;
				const installBtnClick = async () => {
					button.setDisabled(true);
					button.setIcon("loader-circle");
					button.setTooltip("Installing...");
					installBtnEl.toggleClass("mod-loading", true);
					try {
						await this.plugin.installVersion(build.tag, true);
						if (!build.latest && this.plugin.settings.autoUpdate) {
							this.plugin.settings.autoUpdate = false;
							await this.plugin.saveSettings();
							this.plugin.stopUpdateChecker();
						}
						if (
							this.plugin.settings.showReleaseNotes &&
							build.release_note
						) {
							new ReleaseNoteModal(this.app, build).open();
						}
						this.display();
					} catch (error) {
						button.setIcon("download");
						button.setDisabled(false);
						button.setTooltip("Install");
						installBtnEl.toggleClass("mod-loading", false);
					}
				};
				button
					.setIcon("download")
					.setTooltip("Install")
					.setDisabled(isCurrent)
					.onClick(installBtnClick);
			});
		}

		const totalPages = Math.ceil(total / PAGE_SIZE);
		if (totalPages <= 1) return;

		const paginationEl = new Setting(parentEl)
			.setNoInfo()
			.setClass("pagination");
		paginationEl.addExtraButton((button) => {
			button
				.setIcon("chevrons-left")
				.setTooltip("First page")
				.setDisabled(this.currentPage === 0)
				.onClick(() => {
					this.currentPage = 0;
					this.display();
				});
		});
		paginationEl.addExtraButton((button) => {
			button
				.setIcon("chevron-left")
				.setTooltip("Previous page")
				.setDisabled(this.currentPage === 0)
				.onClick(() => {
					if (this.currentPage > 0) {
						this.currentPage--;
						this.display();
					}
				});
		});
		paginationEl.controlEl.createSpan({
			text: `${this.currentPage + 1} / ${totalPages}`,
		});
		paginationEl.addExtraButton((button) => {
			button
				.setIcon("chevron-right")
				.setTooltip("Next page")
				.setDisabled(!has_more)
				.onClick(() => {
					this.currentPage++;
					this.display();
				});
		});
		paginationEl.addExtraButton((button) => {
			button
				.setIcon("chevrons-right")
				.setTooltip("Last page")
				.setDisabled(!has_more)
				.onClick(() => {
					this.currentPage = totalPages - 1;
					this.display();
				});
		});
	}

	// Settings screen - Options

	private displayOptions(parentEl: HTMLElement) {
		const group = this.createSettingGroup(parentEl, "Options");
		const container = group instanceof Setting ? parentEl : group;
		this.createSetting(container, (setting) => {
			setting
				.setName("Auto update")
				.setDesc(
					"Whether to automatically check and update Vertical Tabs."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.autoUpdate)
						.onChange(async (value) => {
							this.plugin.settings.autoUpdate = value;
							await this.plugin.saveSettings();
							if (
								this.plugin.settings.autoUpdate ||
								this.plugin.settings.showUpdateNotification
							) {
								this.plugin.startUpdateChecker();
							} else {
								this.plugin.stopUpdateChecker();
							}
							this.display();
						})
				);
		});

		if (!this.plugin.settings.autoUpdate) {
			this.createSetting(container, (setting) => {
				setting
					.setName("Show update notification")
					.setDesc(
						"Whether to show a notification when a new version is available."
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.showUpdateNotification
							)
							.onChange(async (value) => {
								this.plugin.settings.showUpdateNotification =
									value;
								await this.plugin.saveSettings();
								if (value) {
									this.plugin.startUpdateChecker();
								} else {
									this.plugin.stopUpdateChecker();
								}
								this.display();
							})
					);
			});
		}

		this.createSetting(container, (setting) => {
			setting
				.setName("Show release notes")
				.setDesc(
					"Whether to show what's new in the latest beta version."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.showReleaseNotes)
						.onChange(async (value) => {
							this.plugin.settings.showReleaseNotes = value;
							await this.plugin.saveSettings();
						})
				);
		});

		this.createSetting(container, (setting) => {
			setting.setName("Show advanced options").addToggle((toggle) =>
				toggle.setValue(this.showAdvancedOptions).onChange((value) => {
					this.showAdvancedOptions = value;
					this.display();
				})
			);
		});

		if (!this.showAdvancedOptions) return;

		if (
			this.plugin.settings.autoUpdate ||
			this.plugin.settings.showUpdateNotification
		) {
			this.createSetting(container, (setting) => {
				setting
					.setName("Update check interval")
					.setDesc("Set how often to check for updates.")
					.addDropdown((dropdown) => {
						dropdown
							.addOption("1", "1 hour")
							.addOption("12", "12 hours")
							.addOption("24", "1 day")
							.addOption("48", "2 days")
							.addOption("168", "1 week")
							.setValue(
								this.plugin.settings.updateCheckInterval.toString()
							)
							.onChange(async (value) => {
								this.plugin.settings.updateCheckInterval =
									parseInt(value);
								await this.plugin.saveSettings();
								this.plugin.startUpdateChecker();
							});
					});
			});
		}

		this.createSetting(container, (setting) => {
			setting
				.setName("Hide security warnings")
				.setDesc("Disable beta version integrity check.")
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
		});
	}

	// Settings screen - License

	private displayLicense(parentEl: HTMLElement) {
		const group = this.createSettingGroup(parentEl, "License");
		const container = group instanceof Setting ? parentEl : group;
		this.displayTokenInput(container, true);
		this.displaySubscriptionStatus(container);
	}

	private async displaySubscriptionStatus(
		container: HTMLElement | SettingGroup
	) {
		const containerEl =
			container instanceof HTMLElement ? container : container.listEl;
		const subscriptionEl = containerEl.createDiv();
		const token = this.plugin.settings.token;

		this.displayLoadingIndicator(
			subscriptionEl,
			"Fetching subscription status..."
		);

		try {
			const subscription = await cache.fetchSubscription(async () => {
				const response = await refreshSubscription(token);
				if (!response || !response.success) {
					throw new Error("Unable to load subscription.");
				}
				return response.data;
			});

			subscriptionEl.empty();
			this.renderSubscriptionInfo(subscriptionEl, subscription);
		} catch (error) {
			subscriptionEl.empty();
			const statusEl = subscriptionEl.createDiv({
				cls: "vt-beta-subscription",
			});
			statusEl.toggleClass("mod-error", true);
			statusEl.setText("Unable to load subscription: " + e(error));
		}
	}

	private renderSubscriptionInfo(
		parentEl: HTMLElement,
		subscription: SubscriptionData
	) {
		const statusEl = parentEl.createDiv({ cls: "vt-beta-subscription" });
		const { email, expires_at, valid } = subscription;
		const expiryDate = moment(expires_at);
		const expiryDateText = expiryDate.format("L");

		const subscriberEl = statusEl.createDiv({
			cls: "vt-beta-subscription-detail",
		});
		subscriberEl.appendText("Issued to ");
		subscriberEl.createEl("code", { cls: "mod-info", text: email });

		const expiryEl = statusEl.createDiv({
			cls: "vt-beta-subscription-detail",
		});
		expiryEl.appendText("Valid until ");
		expiryEl.createEl("code", { cls: "mod-info", text: expiryDateText });
		if (!valid) {
			expiryEl.appendText(" ");
			expiryEl.createEl("span", {
				cls: "mod-warning",
				text: `(expired ${expiryDate.fromNow()})`,
			});
		}

		const reminderEl = statusEl.createDiv({
			cls: "vt-beta-subscription-expiration-reminder",
		});
		if (!valid) {
			const deletionDate = expiryDate.clone().add(90, "days");
			const daysUntilDeletion = deletionDate.diff(moment(), "days");
			const deletionDateText = deletionDate.format("MMM Do, YYYY");
			if (daysUntilDeletion > 0) {
				reminderEl.setText(
					`Please renew by ${deletionDateText} (${deletionDate.fromNow()}) to keep 
					 your account. If your account is deleted, resubscribing will create a
					 new account with a new token that you'll need to enter on all your devices.`
				);
			} else {
				reminderEl.setText(
					`Your account has been deleted for privacy reasons. If you resubscribe,
					 a new account will be created with a new token that you'll need to use
					 on all your devices.`
				);
			}
		} else {
			reminderEl.setText("");
		}
	}
}
