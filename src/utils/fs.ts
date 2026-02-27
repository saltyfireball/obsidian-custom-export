import { App, TFolder, normalizePath } from "obsidian";

export async function ensureFolder(app: App, folderPath: string) {
  const normalized = normalizePath(folderPath);
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFolder) return;

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const found = app.vault.getAbstractFileByPath(current);
    if (!found) {
      await app.vault.createFolder(current);
    }
  }
}
