export {};

declare module "obsidian" {
	interface SettingGroup {
    headerEl: HTMLElement;
		controlEl: HTMLElement;
		listEl: HTMLElement;
	}
}
