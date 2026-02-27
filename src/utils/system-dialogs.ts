import { App, Notice } from "obsidian";

export async function showSystemFolderDialog(app: App, defaultPath: string): Promise<string | null> {
  try {
    const electron = (window as any).require?.("electron");
    const dialog = electron?.remote?.dialog ?? electron?.dialog;
    if (!dialog) return null;
    const result = await dialog.showOpenDialog({
      defaultPath,
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  } catch {
    new Notice("System folder dialog unavailable in this environment.");
    return null;
  }
}
