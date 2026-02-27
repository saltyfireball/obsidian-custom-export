import {
	Component,
	MarkdownRenderer,
	Notice,
	TFile,
	normalizePath,
	Modal,
	App,
	Platform,
	Setting,
	TextComponent,
	FuzzySuggestModal,
	TFolder,
	MarkdownView,
	Plugin,
	requestUrl,
} from "obsidian";
import type { ExportSettings } from "./settings";
import {
	collectCssTextFromDom,
	collectEnabledSnippets,
	inlineLocalAssetUrls,
} from "./utils/css";
import { ensureFolder } from "./utils/fs";
import { buildHtmlDocument } from "./utils/html";
import {
	copyLocalAssets,
	copyLocalAssetsToDisk,
	inlineLocalImages,
} from "./utils/assets";
import { sleep } from "./utils/time";
import { waitForDomIdle } from "./utils/dom";
import { exportMarkdown, normalizeImageEmbeds } from "./utils/markdown-export";
import { showSystemFolderDialog } from "./utils/system-dialogs";
import { isMobileApp } from "./device";

// Plugin interface for export functionality
export interface ExportPlugin extends Plugin {
	settings: ExportSettings;
	deviceInfo: { id: string };
	setExportOutputFolder: (value: string) => Promise<void>;
	saveSettings: () => Promise<void>;
}

type ExportContext = {
	file: TFile;
	markdown: string;
	isSelection: boolean;
};

async function shareExportFile(input: {
	data: Blob | ArrayBuffer | string;
	filename: string;
	mimeType: string;
	allowDownloadFallback?: boolean;
}): Promise<boolean> {
	const blob =
		input.data instanceof Blob
			? input.data
			: new Blob([input.data], { type: input.mimeType });
	const file = new File([blob], input.filename, { type: input.mimeType });
	if (
		typeof navigator === "undefined" ||
		typeof navigator.share !== "function"
	) {
		if (!input.allowDownloadFallback) return false;
	} else {
		try {
			await navigator.share({ files: [file] });
			return true;
		} catch (err) {
			console.warn("Share failed", err);
			if (!input.allowDownloadFallback) return false;
		}
	}
	const url = URL.createObjectURL(file);
	const link = document.createElement("a");
	link.href = url;
	link.download = input.filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	return true;
}

function getVaultExportFolder(raw: string): string {
	const trimmed = (raw || "Exports").trim();
	if (!trimmed) return "Exports";
	if (trimmed.startsWith("/") || /^[A-Za-z]:\\/.test(trimmed))
		return "Exports";
	return normalizePath(trimmed);
}

async function saveToVaultExport(
	app: App,
	folder: string,
	fileName: string,
	data: string | ArrayBuffer | Blob,
) {
	const targetFolder = getVaultExportFolder(folder);
	await ensureFolder(app, targetFolder);
	const targetPath = normalizePath(`${targetFolder}/${fileName}`);
	if (typeof data === "string") {
		await app.vault.adapter.write(targetPath, data);
		return targetPath;
	}
	const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
	await app.vault.adapter.writeBinary(targetPath, arrayBuffer);
	return targetPath;
}

export async function exportCurrentNoteHtml(plugin: ExportPlugin) {
	const ctx = await getExportContext(plugin.app, false);
	if (!ctx) return;
	await exportHtml(plugin, ctx);
}

export async function exportCurrentSelectionHtml(plugin: ExportPlugin) {
	const ctx = await getExportContext(plugin.app, true);
	if (!ctx) return;
	await exportHtml(plugin, ctx);
}

export async function exportCurrentNotePdf(plugin: ExportPlugin) {
	const ctx = await getExportContext(plugin.app, false);
	if (!ctx) return;
	await exportPdf(plugin, ctx);
}

export async function exportCurrentNoteMarkdown(plugin: ExportPlugin) {
	const ctx = await getExportContext(plugin.app, false);
	if (!ctx) return;
	await exportMarkdownNote(plugin, ctx);
}

export async function exportCurrentSelectionMarkdown(plugin: ExportPlugin) {
	const ctx = await getExportContext(plugin.app, true);
	if (!ctx) return;
	await exportMarkdownNote(plugin, ctx);
}

export function registerExportCommands(plugin: ExportPlugin) {
	plugin.addCommand({
		id: "export-current-note-html",
		name: "Export current note to HTML",
		callback: () => exportCurrentNoteHtml(plugin),
	});

	plugin.addCommand({
		id: "export-current-note-markdown",
		name: "Export current note to Markdown",
		callback: () => exportCurrentNoteMarkdown(plugin),
	});

	plugin.addCommand({
		id: "export-current-note-pdf",
		name: "Export current note to PDF",
		callback: () => exportCurrentNotePdf(plugin),
	});

	plugin.addCommand({
		id: "export-selection-html",
		name: "Export selection to HTML",
		callback: () => exportCurrentSelectionHtml(plugin),
	});

	plugin.addCommand({
		id: "export-selection-markdown",
		name: "Export selection to Markdown",
		callback: () => exportCurrentSelectionMarkdown(plugin),
	});
}

export function registerExportFileMenu(plugin: ExportPlugin) {
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			menu.addItem((item) => {
				item.setTitle("Export to HTML...")
					.setIcon("document")
					.onClick(() => exportCurrentNoteHtml(plugin));
			});
			menu.addItem((item) => {
				item.setTitle("Export to Markdown...")
					.setIcon("document")
					.onClick(() => exportCurrentNoteMarkdown(plugin));
			});
			menu.addItem((item) => {
				item.setTitle("Export to PDF...")
					.setIcon("document")
					.onClick(() => exportCurrentNotePdf(plugin));
			});
			menu.addItem((item) => {
				item.setTitle("Export selection to HTML...")
					.setIcon("document")
					.onClick(() => exportCurrentSelectionHtml(plugin));
			});
			menu.addItem((item) => {
				item.setTitle("Export selection to Markdown...")
					.setIcon("document")
					.onClick(() => exportCurrentSelectionMarkdown(plugin));
			});
			menu.addItem((item) => {
				item.setTitle("Export as...")
					.setIcon("document")
					.onClick(() => openExportAsModal(plugin));
			});
		}),
	);
}

async function exportHtml(plugin: ExportPlugin, ctx: ExportContext) {
	const { app } = plugin;
	const settings = plugin.settings;
	const { file, markdown } = ctx;
	const isMobile = isMobileApp(app);
	if (isMobile) {
		const proceed = await promptForMobileShare(app, "HTML");
		if (!proceed) return;
	}
	const renderEl = document.createElement("div");
	renderEl.className = "markdown-preview-view markdown-rendered";
	syncPreviewClasses(renderEl);
	const sandbox = document.createElement("div");
	sandbox.setCssStyles({ position: "fixed", left: "-10000px", top: "0", width: "1200px", opacity: "0", pointerEvents: "none" });
	sandbox.appendChild(renderEl);
	document.body.appendChild(sandbox);

	let progress: ExportProgressModal | null = null;
	try {
		if (isMobile) {
			progress = new ExportProgressModal(app, "Preparing HTML export");
			progress.open();
		}
		const frontmatterClasses = getFrontmatterClasses(app, file);
		frontmatterClasses.forEach((cls) => renderEl.classList.add(cls));
		const normalizedMarkdown = normalizeImageEmbeds(
			app,
			markdown,
			file.path,
		);
		const component = new Component();
		component.load();
		try {
			await MarkdownRenderer.render(
				app,
				normalizedMarkdown,
				renderEl,
				file.path,
				component,
			);
		} finally {
			component.unload();
		}
		await waitForDomIdle(renderEl, { timeoutMs: 3000, idleMs: 250 });
		if (settings.postProcessDelayMs > 0) {
			await sleep(settings.postProcessDelayMs);
			await waitForDomIdle(renderEl, { timeoutMs: 2000, idleMs: 250 });
		}

		applyCodeblockWrapperClasses(renderEl);
		trimMultiColumnCallouts(renderEl);

		let outputInfo: Awaited<ReturnType<typeof prepareOutputPaths>> | null =
			null;
		let assetsFolder = "";
		if (!isMobile) {
			const outputFolder =
				normalizeExternalPath(settings.outputFolder || "Exports") ||
				"Exports";
			const chosenFolderRaw = await promptForOutputFolder(
				app,
				outputFolder,
			);
			const chosenFolder = normalizeExternalPath(chosenFolderRaw);
			if (!chosenFolder) {
				new Notice("Export canceled.");
				return;
			}
			await plugin.setExportOutputFolder(chosenFolder);
			outputInfo = await prepareOutputPaths(app, chosenFolder);
			assetsFolder = outputInfo.assetsPath;
		}

		const processedContainer = document.createElement("div");
		// eslint-disable-next-line @microsoft/sdl/no-inner-html -- cloning rendered HTML for post-processing
		processedContainer.innerHTML = renderEl.innerHTML;
		if (settings.inlineLocalAssets || isMobile) {
			await inlineLocalImages(app, processedContainer, file.path);
		}
		if (!isMobile && settings.copyAssets && outputInfo) {
			await outputInfo.ensureAssetsFolder();
			if (outputInfo.isExternal) {
				await copyLocalAssetsToDisk(
					app,
					processedContainer,
					file.path,
					assetsFolder,
				);
			} else {
				await copyLocalAssets(
					app,
					processedContainer,
					file.path,
					assetsFolder,
				);
			}
		}

		// Generate banner HTML if applicable
		const bannerData = await generateBannerHtml(plugin, file);

		const snippetResult = settings.includeCss
			? await collectEnabledSnippets(app)
			: { cssText: "", snippetPaths: [] };
		const bannerCss = bannerData?.css || "";
		const cssRaw = settings.includeCss
			? `${collectCssTextFromDom()}\n${snippetResult.cssText}\n${MULTI_COLUMN_FIX_CSS}\n${bannerCss}`
			: bannerCss;
		const cssText =
			settings.inlineLocalAssets || isMobile
				? await inlineLocalAssetUrls(app, cssRaw)
				: cssRaw;
		const html = buildHtmlDocument({
			title: file.basename,
			bodyHtml: processedContainer.innerHTML,
			cssText,
			bodyClass: frontmatterClasses.join(" "),
			previewClass: frontmatterClasses.join(" "),
			previewStyle: getPreviewStyleVars(),
			sizerStyle: getPreviewSizerStyle(),
			viewContentStyle: getViewContentStyleVars(),
			readingViewStyle: getReadingViewStyleVars(),
			bannerHtml: bannerData?.html,
		});

		const baseName = getExportBaseName(
			app,
			file,
			settings,
			settings.pdfFrontmatterExportKey,
		);
		if (isMobile) {
			progress?.setStatus("Sharing export...");
			const shared = await shareExportFile({
				data: html,
				filename: `${baseName}.html`,
				mimeType: "text/html",
				allowDownloadFallback: false,
			});
			if (shared) {
				new Notice(`Shared HTML: ${baseName}.html`);
			} else {
				const savedPath = await saveToVaultExport(
					app,
					settings.outputFolder,
					`${baseName}.html`,
					html,
				);
				new Notice(`Saved HTML to vault: ${savedPath}`);
			}
			return;
		}
		if (!outputInfo) {
			new Notice("Export canceled.");
			return;
		}
		const outPath = outputInfo.join(`${baseName}.html`);
		await outputInfo.writeFile(outPath, html);
		if (settings.debugMultiColumn) {
			const debugText = buildMultiColumnDebug(renderEl);
			const debugPath = outputInfo.join(`${baseName}.mcc-debug.txt`);
			await outputInfo.writeFile(debugPath, debugText);
			new Notice(`Exported debug: ${debugPath}`);
		}
		new Notice(`Exported HTML: ${outPath}`);
		if (settings.openAfterExport) {
			await openPathInShell(app, outPath, outputInfo.isExternal);
		}
	} finally {
		progress?.close();
		sandbox.remove();
	}
}

async function exportMarkdownNote(plugin: ExportPlugin, ctx: ExportContext) {
	const { app } = plugin;
	const settings = plugin.settings;
	const { file, markdown } = ctx;
	const isMobile = isMobileApp(app);
	if (isMobile) {
		const proceed = await promptForMobileShare(app, "Markdown");
		if (!proceed) return;
		const progress = new ExportProgressModal(
			app,
			"Preparing Markdown export",
		);
		progress.open();
		const result = await exportMarkdown({
			app,
			sourcePath: file.path,
			markdown,
			settings: { ...settings, copyAssets: false },
			assetsFolder: "",
			outputInfo: {
				isExternal: false,
				assetsPath: "",
				ensureAssetsFolder: async () => {},
				writeFile: async () => {},
				join: (fileName: string) => fileName,
			},
		});
		const baseName = getExportBaseName(app, file, settings);
		progress.setStatus("Sharing export...");
		const shared = await shareExportFile({
			data: result.markdown,
			filename: `${baseName}.md`,
			mimeType: "text/markdown",
			allowDownloadFallback: false,
		});
		progress.close();
		if (shared) {
			new Notice(`Shared Markdown: ${baseName}.md`);
		} else {
			const savedPath = await saveToVaultExport(
				app,
				settings.outputFolder,
				`${baseName}.md`,
				result.markdown,
			);
			new Notice(`Saved Markdown to vault: ${savedPath}`);
		}
		return;
	}
	const outputFolder =
		normalizeExternalPath(settings.outputFolder || "Exports") || "Exports";
	const chosenFolderRaw = await promptForOutputFolder(app, outputFolder);
	const chosenFolder = normalizeExternalPath(chosenFolderRaw);
	if (!chosenFolder) {
		new Notice("Export canceled.");
		return;
	}
	await plugin.setExportOutputFolder(chosenFolder);

	const outputInfo = await prepareOutputPaths(app, chosenFolder);
	const assetsFolder = outputInfo.assetsPath;
	await outputInfo.ensureAssetsFolder();

	const result = await exportMarkdown({
		app,
		sourcePath: file.path,
		markdown,
		settings,
		assetsFolder,
		outputInfo,
	});

	const baseName = getExportBaseName(app, file, settings);
	const outPath = outputInfo.join(`${baseName}.md`);
	await outputInfo.writeFile(outPath, result.markdown);
	new Notice(`Exported Markdown: ${outPath}`);
	if (settings.openAfterExport) {
		await openPathInShell(app, outPath, outputInfo.isExternal);
	}
}

/**
 * Generate banner HTML for export if the file has banner frontmatter
 */
async function generateBannerHtml(
	plugin: ExportPlugin,
	file: TFile,
): Promise<{ html: string; css: string } | null> {
	const cache = plugin.app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;
	if (!fm) return null;

	const bannerImage: unknown = fm.banner_image || fm.backdrop || fm.banner;
	if (!bannerImage) return null;

	const bannerPlugin = plugin.app.plugins?.plugins?.["banner-images"] as Record<string, unknown> | undefined;
	const bannerApi = bannerPlugin?.["api"] as Record<string, unknown> | undefined;
	const getDefaults = bannerApi?.["getDefaults"] as (() => Record<string, unknown>) | undefined;
	const bannerDefaults = getDefaults?.() ?? {
		height: 200,
		opacity: 1,
		offset: "center",
		gradient: false,
	};

	const config = {
		image: String(bannerImage),
		height: typeof fm.banner_height === "number" ? fm.banner_height : Number(bannerDefaults.height),
		opacity: typeof fm.banner_opacity === "number" ? Math.min(1, Math.max(0, fm.banner_opacity)) : Number(bannerDefaults.opacity),
		offset: parseBannerOffset(fm.banner_offset ?? fm.banner_position, String(bannerDefaults.offset)),
		gradient: parseBannerGradient(fm.banner_gradient, Boolean(bannerDefaults.gradient)),
	};

	const imageUrl = resolveBannerImageUrl(plugin.app, config.image, file.path);

	let finalImageUrl = imageUrl;
	if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && !imageUrl.startsWith("data:")) {
		try {
			// eslint-disable-next-line no-restricted-globals -- fetching local app:// resource path, not a network request
			const response = await fetch(imageUrl);
			const blob = await response.blob();
			const reader = new FileReader();
			finalImageUrl = await new Promise<string>((resolve) => {
				reader.onloadend = () => resolve(reader.result as string);
				reader.readAsDataURL(blob);
			});
		} catch {
			finalImageUrl = imageUrl;
		}
	}

	const escapedUrl = finalImageUrl.replace(/'/g, "\\'");
	let bannerStyle = `background-image: url('${escapedUrl}'); height: ${config.height}px; background-position: center ${config.offset};`;

	if (config.gradient) {
		bannerStyle += ` opacity: 1; -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,${config.opacity}) 100%); mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,${config.opacity}) 100%);`;
	} else {
		bannerStyle += ` opacity: ${config.opacity};`;
	}

	const html = `<div class="sf-banner-container"><div class="sf-banner${config.gradient ? " sf-banner-gradient" : ""}" style="${bannerStyle}"></div></div>`;

	const css = `
/* Banner styles for export */
.sf-banner-container {
	width: 100%;
	margin: 0;
	padding: 0;
}
.sf-banner {
	width: 100%;
	height: ${config.height}px;
	background-size: cover;
	background-repeat: no-repeat;
}
`;

	return { html, css };
}

function parseBannerOffset(value: unknown, defaultValue: string): string {
	if (value === undefined || value === null) return defaultValue;
	if (typeof value === "number") {
		const clamped = Math.min(100, Math.max(0, value));
		return `${clamped}%`;
	}
	if (typeof value === "string") {
		const lower = value.toLowerCase().trim();
		if (lower === "top" || lower === "center" || lower === "bottom") return lower;
		if (lower.endsWith("%")) {
			const num = parseFloat(lower);
			if (!isNaN(num)) return `${Math.min(100, Math.max(0, num))}%`;
		}
		if (lower.endsWith("px")) return lower;
	}
	return defaultValue;
}

function parseBannerGradient(value: unknown, defaultValue: boolean): boolean {
	if (value === undefined || value === null) return defaultValue;
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const lower = value.toLowerCase().trim();
		return lower === "true" || lower === "yes" || lower === "1";
	}
	return defaultValue;
}

function resolveBannerImageUrl(app: App, imagePath: string, sourcePath: string): string {
	if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
	if (imagePath.startsWith("data:")) return imagePath;

	let cleanPath = imagePath;
	if (cleanPath.startsWith("[[") && cleanPath.endsWith("]]")) {
		cleanPath = cleanPath.slice(2, -2);
	}

	const file = app.metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
	if (file) return app.vault.getResourcePath(file);

	const directFile = app.vault.getAbstractFileByPath(cleanPath);
	if (directFile instanceof TFile) {
		return app.vault.getResourcePath(directFile);
	}

	return imagePath;
}

const MULTI_COLUMN_FIX_CSS = `
/* Export fix: remove top padding/margins inside multi-column embeds */
div[data-callout="multi-column"].callout .markdown-embed-content > .markdown-preview-view,
div[data-callout="multi-column"].callout .internal-embed .markdown-embed-content > .markdown-preview-view {
  padding-top: 0 !important;
  margin-top: 0 !important;
}
div[data-callout="multi-column"].callout .markdown-embed-content > .markdown-preview-view > .markdown-preview-sizer,
div[data-callout="multi-column"].callout .internal-embed .markdown-embed-content > .markdown-preview-view > .markdown-preview-sizer {
  padding-top: 0 !important;
  margin-top: 0 !important;
}
div[data-callout="multi-column"].callout .markdown-embed-content > .markdown-preview-view > .markdown-preview-sizer > *:first-child,
div[data-callout="multi-column"].callout .internal-embed .markdown-embed-content > .markdown-preview-view > .markdown-preview-sizer > *:first-child {
  margin-top: 0 !important;
}
div[data-callout="multi-column"].callout blockquote {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

/* PDF pagination fixes - prevent orphaned content */
li {
  page-break-inside: avoid;
  break-inside: avoid;
}
h1, h2, h3, h4, h5, h6 {
  page-break-after: avoid;
  break-after: avoid;
}
img, .callout, blockquote, pre, table {
  page-break-inside: avoid;
  break-inside: avoid;
}
`;

function trimMultiColumnCallouts(container: HTMLElement) {
	const callouts = Array.from(
		container.querySelectorAll('div.callout[data-callout="multi-column"]'),
	);
	for (const callout of callouts) {
		const content = callout.querySelector(".callout-content");
		if (!content) continue;

		const inlineParas = Array.from(content.querySelectorAll("p"));
		for (const para of inlineParas) {
			const span = para.querySelector("span.internal-embed.inline-embed");
			if (!span) continue;
			const hasEmbedContent = span.querySelector(
				".markdown-embed-content, .markdown-embed-title",
			);
			if (!hasEmbedContent) continue;
			span.classList.add("block-embed");
			(span as HTMLElement).setCssStyles({ display: "block" });
			para.replaceWith(span);
		}

		const children = Array.from(content.children);
		for (const child of children) {
			const text =
				child.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
			const hasMedia = child.querySelector(
				"img, video, audio, svg, iframe",
			);
			if (text === "" && !hasMedia) {
				child.remove();
				continue;
			}
			break;
		}
	}
}

function promptForOutputFolder(
	app: App,
	initialValue: string,
): Promise<string | null> {
	return new Promise((resolve) => {
		const normalized = normalizeExternalPath(initialValue) || initialValue;
		const modal = new OutputFolderModal(
			app,
			normalized,
			(value, canceled) => {
				resolve(canceled ? null : value);
			},
		);
		modal.open();
	});
}

function promptForMobileShare(app: App, formatLabel: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new MobileShareModal(app, formatLabel, (canceled) => {
			resolve(!canceled);
		});
		modal.open();
	});
}

function normalizeExternalPath(value: string | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (!trimmed.startsWith("/") && /^Users\//i.test(trimmed)) {
		return `/${trimmed}`;
	}
	return trimmed;
}

async function exportPdf(plugin: ExportPlugin, ctx: ExportContext) {
	const { app } = plugin;
	const settings = plugin.settings;
	const isMobile = isMobileApp(app);
	if (isMobile) {
		const proceed = await promptForMobileShare(app, "PDF");
		if (!proceed) return;
	}
	if (!settings.pdfApiUrl || !settings.pdfApiKey) {
		new Notice("Set PDF API URL and API key in settings first.");
		return;
	}
	const { file, markdown } = ctx;
	const renderEl = document.createElement("div");
	renderEl.className = "markdown-preview-view markdown-rendered";
	syncPreviewClasses(renderEl);
	const sandbox = document.createElement("div");
	sandbox.setCssStyles({ position: "fixed", left: "-10000px", top: "0", width: "1200px", opacity: "0", pointerEvents: "none" });
	sandbox.appendChild(renderEl);
	document.body.appendChild(sandbox);

	try {
		const frontmatterClasses = getFrontmatterClasses(app, file);
		frontmatterClasses.forEach((cls) => renderEl.classList.add(cls));
		const normalizedMarkdown = normalizeImageEmbeds(
			app,
			markdown,
			file.path,
		);
		const component = new Component();
		component.load();
		try {
			await MarkdownRenderer.render(
				app,
				normalizedMarkdown,
				renderEl,
				file.path,
				component,
			);
		} finally {
			component.unload();
		}
		await waitForDomIdle(renderEl, { timeoutMs: 3000, idleMs: 250 });
		if (settings.postProcessDelayMs > 0) {
			await sleep(settings.postProcessDelayMs);
			await waitForDomIdle(renderEl, { timeoutMs: 2000, idleMs: 250 });
		}
		applyCodeblockWrapperClasses(renderEl);
		trimMultiColumnCallouts(renderEl);

		let outputInfo: Awaited<ReturnType<typeof prepareOutputPaths>> | null =
			null;
		let assetsFolder = "";
		if (!isMobile) {
			const outputFolder =
				normalizeExternalPath(settings.outputFolder || "Exports") ||
				"Exports";
			const chosenFolderRaw = await promptForOutputFolder(
				app,
				outputFolder,
			);
			const chosenFolder = normalizeExternalPath(chosenFolderRaw);
			if (!chosenFolder) {
				new Notice("Export canceled.");
				return;
			}
			await plugin.setExportOutputFolder(chosenFolder);
			outputInfo = await prepareOutputPaths(app, chosenFolder);
			assetsFolder = outputInfo.assetsPath;
		}
		const processedContainer = document.createElement("div");
		// eslint-disable-next-line @microsoft/sdl/no-inner-html -- cloning rendered HTML for post-processing
		processedContainer.innerHTML = renderEl.innerHTML;
		if (settings.inlineLocalAssets || isMobile) {
			await inlineLocalImages(app, processedContainer, file.path);
		}
		if (!isMobile && settings.copyAssets && outputInfo) {
			await outputInfo.ensureAssetsFolder();
			if (outputInfo.isExternal) {
				await copyLocalAssetsToDisk(
					app,
					processedContainer,
					file.path,
					assetsFolder,
				);
			} else {
				await copyLocalAssets(
					app,
					processedContainer,
					file.path,
					assetsFolder,
				);
			}
		}

		const bannerData = await generateBannerHtml(plugin, file);

		const snippetResult = settings.includeCss
			? await collectEnabledSnippets(app)
			: { cssText: "", snippetPaths: [] };
		const bannerCss = bannerData?.css || "";
		const cssRaw = settings.includeCss
			? `${collectCssTextFromDom()}\n${snippetResult.cssText}\n${MULTI_COLUMN_FIX_CSS}\n${bannerCss}`
			: bannerCss;
		const cssText =
			settings.inlineLocalAssets || isMobile
				? await inlineLocalAssetUrls(app, cssRaw)
				: cssRaw;
		const html = buildHtmlDocument({
			title: file.basename,
			bodyHtml: processedContainer.innerHTML,
			cssText,
			bodyClass: frontmatterClasses.join(" "),
			previewClass: frontmatterClasses.join(" "),
			previewStyle: getPreviewStyleVars(),
			sizerStyle: getPreviewSizerStyle(),
			viewContentStyle: getViewContentStyleVars(),
			readingViewStyle: getReadingViewStyleVars(),
			bannerHtml: bannerData?.html,
		});

		const pdfOptions = await promptForPdfOptions(app, settings);
		if (!pdfOptions) {
			new Notice("Export canceled.");
			return;
		}

		const baseName = getExportBaseName(app, file, settings);

		const pdfPath = outputInfo
			? outputInfo.join(`${baseName}.pdf`)
			: `${baseName}.pdf`;
		const progress = new PdfProgressModal(app);
		progress.open();
		try {
			const pdfBlob = await htmlToPdfViaApi({
				apiUrl: settings.pdfApiUrl,
				apiKey: settings.pdfApiKey,
				html,
				width: pdfOptions.width,
				height: pdfOptions.height,
				filename: `${baseName}.pdf`,
				waitFor: pdfOptions.waitFor,
				timeout: pdfOptions.timeout,
				onStatus: (message) => progress.setStatus(message),
			});
			if (isMobile) {
				progress.close();
				const readyModal = new PdfReadyModal(
					app,
					async () => {
						const shared = await shareExportFile({
							data: pdfBlob,
							filename: `${baseName}.pdf`,
							mimeType: "application/pdf",
							allowDownloadFallback: false,
						});
						if (shared) {
							new Notice(`Shared PDF: ${baseName}.pdf`);
						} else {
							new Notice("Share sheet not available.");
						}
					},
					async () => {
						const savedPath = await saveToVaultExport(
							app,
							settings.outputFolder,
							`${baseName}.pdf`,
							pdfBlob,
						);
						new Notice(`Saved PDF to vault: ${savedPath}`);
					},
				);
				readyModal.open();
			} else {
				if (!outputInfo) {
					new Notice("Export canceled.");
					return;
				}
				await outputInfo.writeBinaryFile(pdfPath, pdfBlob);
				new Notice(`Exported PDF: ${pdfPath}`);
				if (settings.openAfterExport) {
					await openPathInShell(app, pdfPath, outputInfo.isExternal);
				}
			}
		} finally {
			if (!isMobile) {
				progress.close();
			}
		}
	} finally {
		sandbox.remove();
	}
}

async function prepareOutputPaths(app: App, folderPath: string) {
	const pathMod = window.require("path") as typeof import("path");
	const fsPromises = (window.require("fs") as typeof import("fs"))
		?.promises;
	if (!pathMod || !fsPromises) {
		throw new Error(
			"Node fs/path unavailable. External export requires desktop mode.",
		);
	}
	const isExternal = pathMod.isAbsolute(folderPath);
	const normalized = isExternal ? folderPath : normalizePath(folderPath);
	const assetsPath = isExternal
		? pathMod.join(normalized, "assets")
		: normalizePath(`${normalized}/assets`);

	async function ensureAssetsFolder() {
		if (isExternal) {
			await fsPromises.mkdir(assetsPath, { recursive: true });
		} else {
			await ensureFolder(app, assetsPath);
		}
	}

	async function writeFile(targetPath: string, contents: string) {
		if (isExternal) {
			const dir = pathMod.dirname(targetPath);
			await fsPromises.mkdir(dir, { recursive: true });
			await fsPromises.writeFile(targetPath, contents, "utf8");
		} else {
			await app.vault.adapter.write(targetPath, contents);
		}
	}

	async function writeBinaryFile(
		targetPath: string,
		data: ArrayBuffer | Uint8Array | Blob,
	) {
		if (isExternal) {
			const dir = pathMod.dirname(targetPath);
			await fsPromises.mkdir(dir, { recursive: true });
			const ab = data instanceof Blob ? await data.arrayBuffer() : data;
			const buffer = Buffer.from(ab as ArrayBuffer);
			await fsPromises.writeFile(targetPath, buffer);
		} else {
			const arrayBuffer =
				data instanceof Blob
					? await data.arrayBuffer()
					: data instanceof Uint8Array
						? (data.buffer as ArrayBuffer)
						: data;
			await app.vault.adapter.writeBinary(targetPath, arrayBuffer);
		}
	}

	function join(fileName: string) {
		return isExternal
			? pathMod.join(normalized, fileName)
			: normalizePath(`${normalized}/${fileName}`);
	}

	if (isExternal) {
		await fsPromises.mkdir(normalized, { recursive: true });
	} else {
		await ensureFolder(app, normalized);
	}

	return {
		isExternal,
		assetsPath,
		ensureAssetsFolder,
		writeFile,
		writeBinaryFile,
		join,
	};
}

function getExportBaseName(
	app: App,
	file: TFile,
	settings: ExportSettings,
	overrideKey?: string,
): string {
	const key = overrideKey?.trim() || settings.frontmatterExportKey?.trim();
	if (key) {
		const cache = app.metadataCache.getFileCache(file);
		const value: unknown = cache?.frontmatter?.[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return file.basename;
}

async function getExportContext(
	app: App,
	selectionOnly: boolean,
): Promise<ExportContext | null> {
	const file = app.workspace.getActiveFile();
	if (!file || file.extension !== "md") {
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- notice text is already sentence case
		new Notice("Open a markdown note to export.");
		return null;
	}
	if (!selectionOnly) {
		const markdown = await app.vault.read(file);
		return { file, markdown, isSelection: false };
	}
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	const selection = view?.editor?.getSelection() ?? "";
	if (!selection.trim()) {
		new Notice("Select text to export.");
		return null;
	}
	return { file, markdown: selection, isSelection: true };
}

async function openPathInShell(
	app: App,
	targetPath: string,
	isExternal: boolean,
) {
	try {
		const electron = window.require("electron") as Record<string, unknown> | undefined;
		const shell = electron?.["shell"] as { showItemInFolder?: (path: string) => void; openPath?: (path: string) => void } | undefined;
		if (!shell?.showItemInFolder || !shell?.openPath) return;
		const adapter = app.vault.adapter as unknown as { getFullPath?: (path: string) => string };
		const absPath = isExternal
			? targetPath
			: (adapter.getFullPath?.(targetPath) ?? targetPath);
		shell.showItemInFolder(absPath);
	} catch {
		// ignore
	}
}

async function htmlToPdfViaApi(input: {
	apiUrl: string;
	apiKey: string;
	html: string;
	width: number;
	height: number;
	filename: string;
	waitFor: string;
	timeout: number;
	onStatus?: (message: string) => void;
}): Promise<Blob> {
	interface PdfApiResponse {
		uploadUrl?: string;
		s3Key?: string;
		downloadUrl?: string;
		error?: string;
	}

	const callApi = async (body: Record<string, unknown>): Promise<PdfApiResponse> => {
		input.onStatus?.("Requesting PDF service...");
		const res = await requestUrl({
			url: input.apiUrl,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${input.apiKey}`,
			},
			body: JSON.stringify(body),
		});
		return res.json as PdfApiResponse;
	};

	const getPdfBlob = async (data: PdfApiResponse) => {
		input.onStatus?.("Downloading PDF...");
		if (data.error) throw new Error(data.error);
		if (data.downloadUrl) {
			const res = await requestUrl({ url: data.downloadUrl });
			return new Blob([res.arrayBuffer]);
		}
		throw new Error("Unexpected PDF API response.");
	};

	const { uploadUrl, s3Key } = await callApi({ action: "getUploadUrl" });
	input.onStatus?.("Uploading HTML...");
	await requestUrl({
		url: uploadUrl ?? "",
		method: "PUT",
		headers: { "Content-Type": "text/html" },
		body: input.html,
	});

	const result = await callApi({
		s3Key,
		width: input.width,
		height: input.height,
		filename: input.filename,
		waitFor: input.waitFor || undefined,
		timeout: input.timeout,
	});
	return getPdfBlob(result);
}

function promptForPdfOptions(
	app: App,
	settings: ExportSettings,
): Promise<{
	width: number;
	height: number;
	waitFor: string;
	timeout: number;
} | null> {
	return new Promise((resolve) => {
		const modal = new PdfOptionsModal(app, settings, (value, canceled) => {
			resolve(canceled ? null : value);
		});
		modal.open();
	});
}

export function openExportAsModal(plugin: ExportPlugin) {
	new ExportAsModal(plugin).open();
}

class ExportAsModal extends Modal {
	private plugin: ExportPlugin;

	constructor(plugin: ExportPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Export as..." });

		const buttonRow = contentEl.createEl("div");
		buttonRow.setCssStyles({ display: "flex", flexDirection: "column", gap: "8px" });

		const addBtn = (label: string, handler: () => void) => {
			const btn = buttonRow.createEl("button", { text: label });
			btn.addEventListener("click", () => {
				this.close();
				handler();
			});
		};

		addBtn("HTML...", () => void exportCurrentNoteHtml(this.plugin));
		addBtn("Markdown...", () => void exportCurrentNoteMarkdown(this.plugin));
		addBtn("PDF...", () => void exportCurrentNotePdf(this.plugin));

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const selection = view?.editor?.getSelection() ?? "";
		if (selection.trim()) {
			addBtn("HTML (selection)...", () =>
				void exportCurrentSelectionHtml(this.plugin),
			);
			addBtn("Markdown (selection)...", () =>
				void exportCurrentSelectionMarkdown(this.plugin),
			);
		}
	}
}

function syncPreviewClasses(target: HTMLElement) {
	const active = document.querySelector<HTMLElement>(
		".markdown-reading-view .markdown-preview-view",
	);
	if (!active) return;
	active.classList.forEach((cls) => target.classList.add(cls));
	Object.entries(active.dataset).forEach(([key, value]) => {
		target.dataset[key] = value;
	});
}

function applyCodeblockWrapperClasses(container: HTMLElement) {
	const wrappers = Array.from(
		container.querySelectorAll(".sf-codeblock-wrapper"),
	);
	wrappers.forEach((wrapper) => {
		if (wrapper.closest(".el-pre, .el-div")) return;
		const parent = wrapper.parentElement;
		if (!parent) return;
		const wrap = document.createElement("div");
		wrap.className = "el-pre";
		parent.insertBefore(wrap, wrapper);
		wrap.appendChild(wrapper);
	});
}

function getPreviewStyleVars(): string {
	const active = document.querySelector(
		".markdown-reading-view .markdown-preview-view",
	);
	if (!active) return "";
	const computed = getComputedStyle(active);
	const vars: string[] = [];
	for (let i = 0; i < computed.length; i++) {
		const name = computed.item(i);
		if (!name || !name.startsWith("--")) continue;
		const value = computed.getPropertyValue(name).trim();
		if (!value) continue;
		vars.push(`${name}: ${value};`);
	}
	return vars.join(" ");
}

function getReadingViewStyleVars(): string {
	const reading = document.querySelector<HTMLElement>(
		".markdown-reading-view",
	);
	if (!reading) return "";
	return getCssVarString(reading);
}

function getViewContentStyleVars(): string {
	const viewContent = document.querySelector<HTMLElement>(
		".view-content",
	);
	if (!viewContent) return "";
	const computed = getComputedStyle(viewContent);
	const keys = [
		"padding-left",
		"padding-right",
		"padding-top",
		"padding-bottom",
		"margin-left",
		"margin-right",
	];
	const parts: string[] = [];
	keys.forEach((key) => {
		const value = computed.getPropertyValue(key).trim();
		if (value) parts.push(`${key}: ${value};`);
	});
	const vars = getCssVarString(viewContent);
	if (vars) parts.push(vars);
	return parts.join(" ");
}

function getCssVarString(el: HTMLElement): string {
	const computed = getComputedStyle(el);
	const vars: string[] = [];
	for (let i = 0; i < computed.length; i++) {
		const name = computed.item(i);
		if (!name || !name.startsWith("--")) continue;
		const value = computed.getPropertyValue(name).trim();
		if (!value) continue;
		vars.push(`${name}: ${value};`);
	}
	return vars.join(" ");
}

function getPreviewSizerStyle(): string {
	const sizer = document.querySelector(
		".markdown-reading-view .markdown-preview-sizer",
	);
	if (!sizer) return "";
	const computed = getComputedStyle(sizer);
	const keys = [
		"padding-left",
		"padding-right",
		"margin-left",
		"margin-right",
		"max-width",
		"width",
	];
	const parts: string[] = [];
	keys.forEach((key) => {
		const value = computed.getPropertyValue(key).trim();
		if (value) parts.push(`${key}: ${value};`);
	});
	parts.push("padding-top: 0px;");
	parts.push("padding-bottom: 0px;");
	return parts.join(" ");
}

function getFrontmatterClasses(app: App, file: TFile): string[] {
	const cache = app.metadataCache.getFileCache(file);
	const raw: unknown = cache?.frontmatter?.cssclasses;
	if (!raw) return [];
	const classes: string[] = Array.isArray(raw)
		? (raw as unknown[]).map((v) => String(v))
		: typeof raw === "string"
			? raw.split(/\s+/)
			: [];
	return classes.map((value) => value.trim()).filter(Boolean);
}

class OutputFolderModal extends Modal {
	private value: string;
	private onDone: (value: string, canceled: boolean) => void;
	private canceled = true;
	private appRef: App;

	constructor(
		app: App,
		initialValue: string,
		onDone: (value: string, canceled: boolean) => void,
	) {
		super(app);
		this.appRef = app;
		this.value = initialValue;
		this.onDone = onDone;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Export folder" });

		const isMobile = Boolean(
			(this.appRef as unknown as Record<string, unknown>).isMobile || Platform.isMobile,
		);

		let input: TextComponent | null = null;
		new Setting(contentEl)
			.setName("Folder path")
			.setDesc(
				isMobile
					? "Use a vault path on mobile. Browse selects a vault folder."
					: "Vault path or absolute system path.",
			)
			.addText((text) => {
				input = text;
				text.setValue(this.value);
				text.onChange((value) => {
					this.value = value;
				});
				text.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter") {
						this.canceled = false;
						this.close();
					}
					if (evt.key === "Escape") {
						this.canceled = true;
						this.close();
					}
				});
			});

		const buttons = contentEl.createEl("div");
		buttons.className = "export-folder-actions";
		buttons.classList.toggle("is-mobile", isMobile);

		const browseBtn = buttons.createEl("button", { text: "Browse..." });
		browseBtn.addEventListener("click", () => {
			if (isMobile) {
				new FolderSuggestModal(this.appRef, (folderPath) => {
					if (folderPath) {
						this.value = folderPath;
						input?.setValue(folderPath);
					}
				}).open();
				return;
			}
			void showSystemFolderDialog(
				this.appRef,
				this.value,
			).then((picked) => {
				if (picked) {
					this.value = picked;
					input?.setValue(picked);
				}
			});
		});

		const chooseBtn = buttons.createEl("button", {
			text: "Choose vault folder...",
		});
		chooseBtn.addEventListener("click", () => {
			new FolderSuggestModal(this.appRef, (folderPath) => {
				if (folderPath) {
					this.value = folderPath;
					input?.setValue(folderPath);
				}
			}).open();
		});

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.canceled = true;
			this.close();
		});

		const okBtn = buttons.createEl("button", { text: "Export" });
		okBtn.addEventListener("click", () => {
			this.canceled = false;
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
		const trimmed = this.value.trim() || "Exports";
		this.onDone(trimmed, this.canceled);
	}
}

class MobileShareModal extends Modal {
	private formatLabel: string;
	private onDone: (canceled: boolean) => void;
	private canceled = true;

	constructor(
		app: App,
		formatLabel: string,
		onDone: (canceled: boolean) => void,
	) {
		super(app);
		this.formatLabel = formatLabel;
		this.onDone = onDone;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `Export ${this.formatLabel}` });
		contentEl.createEl("p", {
			text: "The file will be generated and shared using the system share sheet.",
		});

		const buttons = contentEl.createEl("div");
		buttons.className = "export-folder-actions is-mobile";

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.canceled = true;
			this.close();
		});

		const okBtn = buttons.createEl("button", { text: "Export & save..." });
		okBtn.addEventListener("click", () => {
			this.canceled = false;
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
		this.onDone(this.canceled);
	}
}

class ExportProgressModal extends Modal {
	private statusEl: HTMLElement | null = null;
	private message: string;

	constructor(app: App, message: string) {
		super(app);
		this.message = message;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: this.message });
		const spinner = contentEl.createEl("div");
		spinner.className = "obsidian-exporter-spinner";
		spinner.setCssStyles({ width: "24px", height: "24px", border: "3px solid var(--background-modifier-border)", borderTopColor: "var(--text-accent)", borderRadius: "50%", animation: "obsidian-exporter-spin 1s linear infinite", margin: "8px 0" });
		this.statusEl = contentEl.createEl("div", {
			text: "Preparing export...",
		});
	}

	setStatus(message: string) {
		if (this.statusEl) this.statusEl.textContent = message;
	}
}

class PdfReadyModal extends Modal {
	private onShare: () => Promise<void> | void;
	private onSave: () => Promise<void> | void;

	constructor(
		app: App,
		onShare: () => Promise<void> | void,
		onSave: () => Promise<void> | void,
	) {
		super(app);
		this.onShare = onShare;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "PDF ready" });
		contentEl.createEl("p", {
			text: "Choose how to save or share the PDF.",
		});

		const buttons = contentEl.createEl("div");
		buttons.className = "export-folder-actions is-mobile";

		const shareBtn = buttons.createEl("button", { text: "Share PDF..." });
		shareBtn.addEventListener("click", () => {
			void Promise.resolve(this.onShare()).then(() => this.close());
		});

		const saveBtn = buttons.createEl("button", { text: "Save to vault" });
		saveBtn.addEventListener("click", () => {
			void Promise.resolve(this.onSave()).then(() => this.close());
		});

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}
}

class PdfOptionsModal extends Modal {
	private settings: ExportSettings;
	private onDone: (
		value: {
			width: number;
			height: number;
			waitFor: string;
			timeout: number;
		},
		canceled: boolean,
	) => void;
	private canceled = true;
	private widthValue: number;
	private heightValue: number;
	private waitForValue: string;
	private timeoutValue: number;

	constructor(
		app: App,
		settings: ExportSettings,
		onDone: (
			value: {
				width: number;
				height: number;
				waitFor: string;
				timeout: number;
			},
			canceled: boolean,
		) => void,
	) {
		super(app);
		this.settings = settings;
		this.onDone = onDone;
		this.widthValue = settings.pdfWidth;
		this.heightValue = settings.pdfHeight;
		this.waitForValue = settings.pdfWaitForSelector;
		this.timeoutValue = settings.pdfTimeoutMs;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "PDF export options" });

		const widthInput = contentEl.createEl("input", { type: "number" });
		widthInput.placeholder = "Width (px)";
		widthInput.value = String(this.widthValue);
		widthInput.setCssStyles({ width: "100%" });
		widthInput.addEventListener("input", () => {
			const parsed = Number.parseInt(widthInput.value, 10);
			this.widthValue = Number.isFinite(parsed)
				? parsed
				: this.settings.pdfWidth;
		});

		const heightInput = contentEl.createEl("input", { type: "number" });
		heightInput.placeholder = "Height (px)";
		heightInput.value = String(this.heightValue);
		heightInput.setCssStyles({ width: "100%", marginTop: "8px" });
		heightInput.addEventListener("input", () => {
			const parsed = Number.parseInt(heightInput.value, 10);
			this.heightValue = Number.isFinite(parsed)
				? parsed
				: this.settings.pdfHeight;
		});

		const waitForInput = contentEl.createEl("input", { type: "text" });
		waitForInput.placeholder = "waitFor selector (optional)"; // eslint-disable-line obsidianmd/ui/sentence-case -- technical label with camelCase parameter name
		waitForInput.value = this.waitForValue;
		waitForInput.setCssStyles({ width: "100%", marginTop: "8px" });
		waitForInput.addEventListener("input", () => {
			this.waitForValue = waitForInput.value.trim();
		});

		const timeoutInput = contentEl.createEl("input", { type: "number" });
		timeoutInput.placeholder = "timeout (ms)"; // eslint-disable-line obsidianmd/ui/sentence-case -- technical label with unit abbreviation
		timeoutInput.value = String(this.timeoutValue);
		timeoutInput.setCssStyles({ width: "100%", marginTop: "8px" });
		timeoutInput.addEventListener("input", () => {
			const parsed = Number.parseInt(timeoutInput.value, 10);
			this.timeoutValue = Number.isFinite(parsed)
				? parsed
				: this.settings.pdfTimeoutMs;
		});

		const buttons = contentEl.createEl("div");
		buttons.setCssStyles({ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" });

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.canceled = true;
			this.close();
		});

		const okBtn = buttons.createEl("button", { text: "Continue" });
		okBtn.addEventListener("click", () => {
			this.canceled = false;
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
		this.onDone(
			{
				width: this.widthValue,
				height: this.heightValue,
				waitFor: this.waitForValue,
				timeout: this.timeoutValue,
			},
			this.canceled,
		);
	}
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private onPick: (path: string) => void;
	constructor(app: App, onPick: (path: string) => void) {
		super(app);
		this.onPick = onPick;
	}
	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		this.app.vault.getAllLoadedFiles().forEach((file) => {
			if (file instanceof TFolder) folders.push(file);
		});
		return folders;
	}
	getItemText(item: TFolder): string {
		return item.path;
	}
	onChooseItem(item: TFolder): void {
		this.onPick(item.path);
	}
}

class PdfProgressModal extends Modal {
	private static spinnerStyleInjected = false;
	private statusEl?: HTMLElement;
	constructor(app: App) {
		super(app);
		if (!PdfProgressModal.spinnerStyleInjected) {
			// eslint-disable-next-line obsidianmd/no-forbidden-elements -- injecting keyframe animation required for spinner
			const style = document.createElement("style");
			style.textContent = `@keyframes obsidian-exporter-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
			document.head.appendChild(style);
			PdfProgressModal.spinnerStyleInjected = true;
		}
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Rendering PDF..." });
		const spinner = contentEl.createEl("div");
		spinner.className = "obsidian-exporter-spinner";
		spinner.setCssStyles({ width: "24px", height: "24px", border: "3px solid var(--background-modifier-border)", borderTopColor: "var(--text-accent)", borderRadius: "50%", animation: "obsidian-exporter-spin 1s linear infinite", margin: "8px 0" });
		this.statusEl = contentEl.createEl("div", { text: "Uploading HTML..." });
	}
	setStatus(message: string) {
		if (this.statusEl) this.statusEl.textContent = message;
	}
}

function buildMultiColumnDebug(container: HTMLElement): string {
	const callouts = Array.from(
		container.querySelectorAll('div.callout[data-callout="multi-column"]'),
	);
	if (callouts.length === 0) return "No multi-column callouts found.";
	const lines: string[] = [];
	callouts.forEach((callout, idx) => {
		lines.push(`Callout ${idx + 1}:`);
		const content = callout.querySelector(".callout-content");
		if (!content) {
			lines.push("  (no .callout-content)");
			return;
		}
		const children = Array.from(content.children);
		children.forEach((child, i) => {
			const tag = child.tagName.toLowerCase();
			const cls = child.className || "";
			const textLen = (child.textContent || "").trim().length;
			lines.push(`  [${i}] <${tag}> class="${cls}" textLen=${textLen}`);
			const snippet = child.outerHTML.replace(/\s+/g, " ").slice(0, 300);
			lines.push(`       ${snippet}`);
		});
	});
	return lines.join("\n");
}
