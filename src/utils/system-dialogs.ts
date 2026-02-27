import { App, Notice } from "obsidian";

interface ElectronDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface ElectronDialog {
  showOpenDialog: (options: {
    defaultPath: string;
    properties: string[];
  }) => Promise<ElectronDialogResult>;
}

interface ElectronModule {
  remote?: { dialog?: ElectronDialog };
  dialog?: ElectronDialog;
}

export async function showSystemFolderDialog(app: App, defaultPath: string): Promise<string | null> {
  try {
    const windowObj = window as unknown as { require?: (module: string) => unknown };
    const electron = windowObj.require?.("electron") as ElectronModule | undefined;
    const dialog = electron?.remote?.dialog ?? electron?.dialog;
    if (!dialog) return null;
    const result = await dialog.showOpenDialog({
      defaultPath,
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  } catch {
    new Notice("System folder dialog unavailable in this environment.");
    return null;
  }
}
