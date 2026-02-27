export interface ExportSettings {
	outputFolder: string;
	outputFolderByDevice: Record<string, string>;
	includeCss: boolean;
	copyAssets: boolean;
	openAfterExport: boolean;
	frontmatterExportKey: string;
	pdfFrontmatterExportKey: string;
	pdfApiUrl: string;
	pdfApiKey: string;
	pdfWidth: number;
	pdfHeight: number;
	pdfTimeoutMs: number;
	pdfWaitForSelector: string;
	inlineLocalAssets: boolean;
	postProcessDelayMs: number;
	debugMultiColumn: boolean;
	mdExpandEmbeds: boolean;
	mdConvertCallouts: boolean;
	mdConvertWikilinks: boolean;
	mdDataviewMode: "keep" | "remove" | "placeholder";
	mdDataviewPlaceholder: string;
}

export const DEFAULT_SETTINGS: ExportSettings = {
	outputFolder: "Exports",
	outputFolderByDevice: {},
	includeCss: true,
	copyAssets: true,
	openAfterExport: false,
	frontmatterExportKey: "export_name",
	pdfFrontmatterExportKey: "",
	pdfApiUrl: "",
	pdfApiKey: "",
	pdfWidth: 1920,
	pdfHeight: 1080,
	pdfTimeoutMs: 60000,
	pdfWaitForSelector: "",
	inlineLocalAssets: true,
	postProcessDelayMs: 100,
	debugMultiColumn: false,
	mdExpandEmbeds: true,
	mdConvertCallouts: true,
	mdConvertWikilinks: true,
	mdDataviewMode: "placeholder",
	mdDataviewPlaceholder: "> Dataview output omitted",
};
