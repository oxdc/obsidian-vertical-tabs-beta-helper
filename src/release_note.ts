import { App, Modal, MarkdownRenderer, Component, Setting } from "obsidian";
import { BuildData } from "./services/response";

export class ReleaseNoteModal extends Modal {
	private build: BuildData;

	constructor(app: App, build: BuildData) {
		super(app);
		this.build = build;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `What's new in ${this.build.tag}` });
		const releaseNote = this.build.release_note;
		if (!releaseNote) {
			contentEl.createEl("p", { text: "No release notes available." });
			return;
		}
		const containerEl = contentEl.createDiv({
			cls: "vt-beta-release-note markdown-preview-view",
		});
		const parent = contentEl as unknown as Component;
		MarkdownRenderer.render(this.app, releaseNote, containerEl, "", parent);
		new Setting(contentEl).addButton((button) => {
			button.setButtonText("Close").onClick(() => this.close());
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
