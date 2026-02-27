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
		nav.setCssStyles({ display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "8px" });

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
			btn.setCssStyles({ padding: "6px 14px", borderRadius: "6px 6px 0 0", border: "1px solid var(--background-modifier-border)", borderBottom: "none", cursor: "pointer", fontSize: "0.9em" });

			if (tab.id === this.activeTab) {
				btn.setCssStyles({ background: "var(--background-primary)", fontWeight: "600" });
			} else {
				btn.setCssStyles({ background: "var(--background-secondary)", color: "var(--text-muted)" });
			}

			btn.addEventListener("click", () => {
				this.activeTab = tab.id;
				this.display();
			});
		});

		renderTab();
	}
}
