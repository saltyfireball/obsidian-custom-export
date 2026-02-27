import { App, Setting, TextComponent } from "obsidian";
import { showSystemFolderDialog } from "./utils/system-dialogs";
import type CustomExportPlugin from "./main";

interface ExportSettingsParams {
  app: App;
  plugin: CustomExportPlugin;
  contentEl: HTMLElement;
}

export function renderExportGeneralTab({ app, plugin, contentEl }: ExportSettingsParams) {
  contentEl.createEl("h2", { text: "Export Settings" });
  contentEl.createEl("p", {
    text: "Configure how notes are exported to HTML, Markdown, and PDF.",
    cls: "setting-item-description",
  });

  const settings = plugin.settings;

  let outputFolderText: TextComponent | null = null;
  new Setting(contentEl)
    .setName("Output folder")
    .setDesc("Folder path for exports (saved per device). You can use a vault path or an absolute system path.")
    .addText((text) =>
      (outputFolderText = text)
        .setPlaceholder("Exports")
        .setValue(settings.outputFolder)
        .onChange(async (value) => {
          await plugin.setExportOutputFolder(value);
        })
    )
    .addButton((button) =>
      button.setButtonText("Browse...").onClick(async () => {
        const picked = await showSystemFolderDialog(app, settings.outputFolder);
        if (!picked) return;
        outputFolderText?.setValue(picked);
        await plugin.setExportOutputFolder(picked);
      })
    );

  new Setting(contentEl)
    .setName("Include theme CSS")
    .setDesc("Inline current Obsidian CSS so the export matches your theme.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.includeCss)
        .onChange(async (value) => {
          settings.includeCss = value;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Copy local assets")
    .setDesc("Copy images and attachments into an assets folder next to the HTML file.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.copyAssets)
        .onChange(async (value) => {
          settings.copyAssets = value;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Open after export")
    .setDesc("Open the exported file automatically after export completes.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.openAfterExport)
        .onChange(async (value) => {
          settings.openAfterExport = value;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Inline local assets")
    .setDesc("Inline local asset URLs (fonts/images) into the exported HTML (helps PDF rendering).")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.inlineLocalAssets)
        .onChange(async (value) => {
          settings.inlineLocalAssets = value;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Frontmatter export name key")
    .setDesc("Use this frontmatter key to override the export filename (without extension).")
    .addText((text) =>
      text
        .setPlaceholder("export_name")
        .setValue(settings.frontmatterExportKey)
        .onChange(async (value) => {
          settings.frontmatterExportKey = value.trim() || "export_name";
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Post-process delay (ms)")
    .setDesc("Extra wait time for plugins like DataviewJS to finish rendering.")
    .addText((text) =>
      text
        .setPlaceholder("100")
        .setValue(String(settings.postProcessDelayMs))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          settings.postProcessDelayMs = Number.isFinite(parsed) ? parsed : 100;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Debug multi-column callouts")
    .setDesc("Write a debug file listing multi-column callout child nodes.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.debugMultiColumn)
        .onChange(async (value) => {
          settings.debugMultiColumn = value;
          await plugin.saveSettings();
        })
    );
}

export function renderExportPdfTab({ app, plugin, contentEl }: ExportSettingsParams) {
  contentEl.createEl("h2", { text: "PDF Export" });
  contentEl.createEl("p", {
    text: "Configure PDF export settings. PDF export requires a configured Lambda API.",
    cls: "setting-item-description",
  });

  const settings = plugin.settings;

  // API key plaintext warning
  const warningEl = contentEl.createEl("div");
  warningEl.style.padding = "8px 12px";
  warningEl.style.marginBottom = "16px";
  warningEl.style.background = "var(--background-secondary)";
  warningEl.style.borderRadius = "6px";
  warningEl.style.borderLeft = "3px solid var(--text-warning)";
  warningEl.style.color = "var(--text-muted)";
  warningEl.style.fontSize = "0.85em";
  warningEl.textContent = "Warning: The PDF API key is stored in plaintext in this plugin's data.json file. Do not share your vault data if it contains sensitive keys.";

  new Setting(contentEl)
    .setName("PDF API URL")
    .setDesc("Lambda URL for PDF rendering.")
    .addText((text) =>
      text
        .setPlaceholder("https://xxxxx.lambda-url.us-east-1.on.aws/")
        .setValue(settings.pdfApiUrl)
        .onChange(async (value) => {
          settings.pdfApiUrl = value.trim();
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("PDF API key")
    .setDesc("Bearer token for the PDF API.")
    .addText((text) =>
      text
        .setPlaceholder("your-api-key")
        .setValue(settings.pdfApiKey)
        .onChange(async (value) => {
          settings.pdfApiKey = value.trim();
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("PDF frontmatter export name key")
    .setDesc("Optional override just for PDF exports. Leave blank to use the default key.")
    .addText((text) =>
      text
        .setPlaceholder("export_pdf_name")
        .setValue(settings.pdfFrontmatterExportKey)
        .onChange(async (value) => {
          settings.pdfFrontmatterExportKey = value.trim();
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("PDF viewport width")
    .setDesc("Viewport width (px) passed to the PDF script.")
    .addText((text) =>
      text
        .setPlaceholder("1920")
        .setValue(String(settings.pdfWidth))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          settings.pdfWidth = Number.isFinite(parsed) ? parsed : 1920;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("PDF viewport height")
    .setDesc("Viewport height (px) passed to the PDF script.")
    .addText((text) =>
      text
        .setPlaceholder("1080")
        .setValue(String(settings.pdfHeight))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          settings.pdfHeight = Number.isFinite(parsed) ? parsed : 1080;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("PDF timeout (ms)")
    .setDesc("Max time allowed by the API to render the PDF.")
    .addText((text) =>
      text
        .setPlaceholder("60000")
        .setValue(String(settings.pdfTimeoutMs))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          settings.pdfTimeoutMs = Number.isFinite(parsed) ? parsed : 60000;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("PDF waitFor selector")
    .setDesc("Optional CSS selector to wait for before rendering.")
    .addText((text) =>
      text
        .setPlaceholder(".content")
        .setValue(settings.pdfWaitForSelector)
        .onChange(async (value) => {
          settings.pdfWaitForSelector = value.trim();
          await plugin.saveSettings();
        })
    );
}

export function renderExportMarkdownTab({ app, plugin, contentEl }: ExportSettingsParams) {
  contentEl.createEl("h2", { text: "Markdown Export" });
  contentEl.createEl("p", {
    text: "Configure how notes are converted when exporting to portable Markdown.",
    cls: "setting-item-description",
  });

  const settings = plugin.settings;

  new Setting(contentEl)
    .setName("Expand embeds")
    .setDesc("Inline embedded notes when exporting markdown.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.mdExpandEmbeds)
        .onChange(async (value) => {
          settings.mdExpandEmbeds = value;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Convert callouts")
    .setDesc("Convert Obsidian callouts to standard blockquotes.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.mdConvertCallouts)
        .onChange(async (value) => {
          settings.mdConvertCallouts = value;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Convert wikilinks")
    .setDesc("Convert [[wikilinks]] to standard Markdown links.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.mdConvertWikilinks)
        .onChange(async (value) => {
          settings.mdConvertWikilinks = value;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Dataview blocks")
    .setDesc("How to handle dataview/dataviewjs blocks in exported markdown.")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("keep", "Keep")
        .addOption("remove", "Remove")
        .addOption("placeholder", "Replace with placeholder")
        .setValue(settings.mdDataviewMode)
        .onChange(async (value) => {
          settings.mdDataviewMode = value as typeof settings.mdDataviewMode;
          await plugin.saveSettings();
        })
    );

  new Setting(contentEl)
    .setName("Dataview placeholder")
    .setDesc("Used when Dataview blocks are replaced.")
    .addText((text) =>
      text
        .setPlaceholder("> Dataview output omitted")
        .setValue(settings.mdDataviewPlaceholder)
        .onChange(async (value) => {
          settings.mdDataviewPlaceholder = value;
          await plugin.saveSettings();
        })
    );
}
