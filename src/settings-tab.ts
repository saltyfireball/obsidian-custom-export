import { App, PluginSettingTab } from "obsidian";
import {
	renderExportGeneralTab,
	renderExportPdfTab,
	renderExportMarkdownTab,
} from "./settings-ui";
import type CustomExportPlugin from "./main";

type TabId = "general" | "pdf" | "markdown";

export class CustomExportSettingTab extends PluginSettingTab {
	plugin: CustomExportPlugin;
	private activeTab: TabId = "general";

	constructor(app: App, plugin: CustomExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		// Tab navigation
		const nav = containerEl.createDiv("custom-export-nav");
		nav.style.display = "flex";
		nav.style.gap = "4px";
		nav.style.marginBottom = "16px";
		nav.style.borderBottom = "1px solid var(--background-modifier-border)";
		nav.style.paddingBottom = "8px";

		const tabs: { id: TabId; label: string }[] = [
			{ id: "general", label: "General" },
			{ id: "pdf", label: "PDF" },
			{ id: "markdown", label: "Markdown" },
		];

		const contentEl = containerEl.createDiv("custom-export-content");

		const renderTab = () => {
			contentEl.empty();
			switch (this.activeTab) {
				case "general":
					renderExportGeneralTab({ app: this.app, plugin: this.plugin, contentEl });
					break;
				case "pdf":
					renderExportPdfTab({ app: this.app, plugin: this.plugin, contentEl });
					break;
				case "markdown":
					renderExportMarkdownTab({ app: this.app, plugin: this.plugin, contentEl });
					break;
			}
		};

		tabs.forEach((tab) => {
			const btn = nav.createEl("button", { text: tab.label });
			btn.style.padding = "6px 14px";
			btn.style.borderRadius = "6px 6px 0 0";
			btn.style.border = "1px solid var(--background-modifier-border)";
			btn.style.borderBottom = "none";
			btn.style.cursor = "pointer";
			btn.style.fontSize = "0.9em";

			if (tab.id === this.activeTab) {
				btn.style.background = "var(--background-primary)";
				btn.style.fontWeight = "600";
			} else {
				btn.style.background = "var(--background-secondary)";
				btn.style.color = "var(--text-muted)";
			}

			btn.addEventListener("click", () => {
				this.activeTab = tab.id;
				this.display();
			});
		});

		renderTab();
	}
}
