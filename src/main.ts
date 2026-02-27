import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	type ExportSettings,
} from "./settings";
import { CustomExportSettingTab } from "./settings-tab";
import { deepMerge } from "./helpers";
import { getDeviceInfo, type DeviceInfo } from "./device";
import {
	registerExportCommands,
	registerExportFileMenu,
	type ExportPlugin,
} from "./commands";

export default class CustomExportPlugin extends Plugin implements ExportPlugin {
	settings!: ExportSettings;
	deviceInfo!: DeviceInfo;

	async onload() {
		await this.loadSettings();

		// Initialize device info (used for per-device export folders)
		this.deviceInfo = getDeviceInfo();
		this.applyDeviceExportFolder();

		// Register export commands and file menu items
		registerExportCommands(this);
		registerExportFileMenu(this);

		// Add settings tab
		this.addSettingTab(new CustomExportSettingTab(this.app, this));
	}

	async loadSettings() {
		const savedData = (await this.loadData()) as Partial<ExportSettings> | null;
		this.settings = deepMerge(DEFAULT_SETTINGS as unknown as Record<string, unknown>, (savedData ?? {}) as Record<string, unknown>) as unknown as ExportSettings;

		if (!this.settings.outputFolderByDevice) {
			this.settings.outputFolderByDevice = {};
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async setExportOutputFolder(value: string) {
		const trimmed = value.trim() || "Exports";
		this.settings.outputFolder = trimmed;
		if (!this.settings.outputFolderByDevice) {
			this.settings.outputFolderByDevice = {};
		}
		if (this.deviceInfo?.id) {
			this.settings.outputFolderByDevice[this.deviceInfo.id] = trimmed;
		}
		await this.saveSettings();
	}

	private applyDeviceExportFolder(): void {
		if (!this.deviceInfo?.id) return;
		const deviceFolder =
			this.settings.outputFolderByDevice?.[this.deviceInfo.id];
		if (deviceFolder && deviceFolder.trim()) {
			this.settings.outputFolder = deviceFolder;
		} else if (
			this.settings.outputFolder &&
			this.settings.outputFolder.trim()
		) {
			if (!this.settings.outputFolderByDevice) {
				this.settings.outputFolderByDevice = {};
			}
			this.settings.outputFolderByDevice[this.deviceInfo.id] =
				this.settings.outputFolder.trim();
		}
	}
}
