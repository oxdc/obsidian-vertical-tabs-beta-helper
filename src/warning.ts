import { App, Modal, Setting } from "obsidian";

const CONFIRMATION_PHRASE = "I understand the security risks";

interface SecurityWarningConfirmationModalProps {
	onConfirm: () => void;
	onCancel: () => void;
}

export class SecurityWarningConfirmationModal extends Modal {
	private readonly onConfirm: () => void;
	private readonly onCancel: () => void;
	private isConfirmed = false;

	constructor(app: App, props: SecurityWarningConfirmationModalProps) {
		super(app);
		this.onConfirm = props.onConfirm;
		this.onCancel = props.onCancel;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Security Warning" });
		const warningDiv = contentEl.createDiv({
			cls: "vt-beta-security-warning",
		});
		warningDiv.createEl("p", {
			text: `You are about to disable security warnings. Only proceed if you understand the
			       implications and accept the risk.`,
		});

		const confirmationDiv = contentEl.createDiv({
			cls: "vt-beta-confirmation-input",
		});
		confirmationDiv.createEl("p", {
			text: "To confirm, please type the following phrase exactly:",
		});
		confirmationDiv.createEl("p", {
			cls: "vt-beta-confirmation-phrase",
			text: CONFIRMATION_PHRASE,
		});

		let inputEl: HTMLInputElement;
		new Setting(confirmationDiv)
			.setClass("vt-beta-confirmation-input")
			.setName("Confirmation")
			.addText((text) => {
				inputEl = text.inputEl;
				text.setPlaceholder("Type the phrase above...").onChange(() =>
					this.updateButtonState(inputEl, confirmButton)
				);
			});

		const buttonDiv = contentEl.createDiv({
			cls: "vt-beta-security-warning-modal-button-container",
		});

		const cancelButton = buttonDiv.createEl("button", { text: "Cancel" });
		cancelButton.onclick = () => {
			this.onCancel();
			this.close();
		};

		const confirmButton = buttonDiv.createEl("button", {
			text: "Disable Security Warnings",
			cls: "mod-warning",
		});
		confirmButton.disabled = true;
		confirmButton.onclick = () => {
			if (inputEl.value === CONFIRMATION_PHRASE) {
				this.isConfirmed = true;
				this.onConfirm();
				this.close();
			}
		};

		setTimeout(() => inputEl?.focus(), 100);
	}

	private updateButtonState(
		inputEl: HTMLInputElement,
		confirmButton: HTMLButtonElement
	) {
		const isValid = inputEl.value === CONFIRMATION_PHRASE;
		confirmButton.disabled = !isValid;
	}

	onClose() {
		if (!this.isConfirmed) this.onCancel();
		const { contentEl } = this;
		contentEl.empty();
	}
}
