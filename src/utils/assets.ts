import { App, TFile, normalizePath } from "obsidian";

const EXTERNAL_PREFIXES = ["http://", "https://", "mailto:", "tel:"];
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function isExternalLink(link: string): boolean {
  const lower = link.toLowerCase();
  return EXTERNAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function getLinkText(el: Element): string {
  const dataHref = el.getAttribute("data-href");
  if (dataHref) return dataHref;
  const dataSrc = el.getAttribute("data-src");
  if (dataSrc) return dataSrc;
  const href = el.getAttribute("href");
  if (href) return href;
  const src = el.getAttribute("src") || "";
  if (src && !src.startsWith("app://") && !src.startsWith("file://")) return src;
  const embed = (el as HTMLElement).closest?.(".internal-embed, .media-embed, .image-embed");
  if (embed) {
    const embedHref = embed.getAttribute("data-href");
    if (embedHref) return embedHref;
    const embedSrc = embed.getAttribute("data-src");
    if (embedSrc) return embedSrc;
    const embedAttr = embed.getAttribute("src");
    if (embedAttr) return embedAttr;
  }
  return src;
}

function resolveLinkToFile(app: App, linkText: string, sourcePath: string): TFile | null {
  const hashSplit = linkText.split("#");
  const hashBase = (hashSplit[0] ?? "").split("|");
  const cleaned = (hashBase[0] ?? "").trim();
  if (!cleaned) return null;
  return app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function getImageMimeType(file: TFile): string {
  const ext = file.extension.toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] || "application/octet-stream";
}

export async function inlineLocalImages(
  app: App,
  container: HTMLElement,
  sourcePath: string
) {
  const images = Array.from(container.querySelectorAll("img"));
  for (const img of images) {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("data:")) continue;
    const linkText = getLinkText(img);
    if (!linkText || isExternalLink(linkText) || linkText.startsWith("app://") || linkText.startsWith("file://")) {
      continue;
    }
    const file = resolveLinkToFile(app, linkText, sourcePath);
    if (!file) continue;
    const binary = await app.vault.adapter.readBinary(file.path);
    const base64 = arrayBufferToBase64(binary);
    const mime = getImageMimeType(file);
    img.setAttribute("src", `data:${mime};base64,${base64}`);
    img.removeAttribute("srcset");
  }
}

async function copyFileToAssets(app: App, file: TFile, assetsFolder: string): Promise<string> {
  const binary = await app.vault.adapter.readBinary(file.path);
  const outPath = normalizePath(`${assetsFolder}/${file.path}`);
  const outDir = outPath.split("/").slice(0, -1).join("/");
  if (outDir) {
    try {
      await app.vault.adapter.mkdir(outDir);
    } catch {
      // ignore if exists
    }
  }
  await app.vault.adapter.writeBinary(outPath, binary);
  return outPath;
}

function toRelativeAssetPath(outPath: string, assetsFolder: string): string {
  const normalized = normalizePath(outPath);
  const base = normalizePath(assetsFolder);
  if (normalized.startsWith(base)) {
    return normalized.slice(base.length + 1);
  }
  return normalized;
}

export async function copyLocalAssets(
  app: App,
  container: HTMLElement,
  sourcePath: string,
  assetsFolder: string
) {
  const images = Array.from(container.querySelectorAll("img"));
  for (const img of images) {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("data:")) continue;
    const linkText = getLinkText(img);
    if (!linkText || isExternalLink(linkText)) continue;
    const file = resolveLinkToFile(app, linkText, sourcePath);
    if (!file) continue;
    const outPath = await copyFileToAssets(app, file, assetsFolder);
    const rel = toRelativeAssetPath(outPath, assetsFolder);
    img.setAttribute("src", `assets/${rel}`);
  }

  const links = Array.from(container.querySelectorAll("a"));
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const linkText = getLinkText(link);
    if (!linkText || isExternalLink(href) || href.startsWith("#")) continue;
    const file = resolveLinkToFile(app, linkText, sourcePath);
    if (!file) continue;
    const outPath = await copyFileToAssets(app, file, assetsFolder);
    const rel = toRelativeAssetPath(outPath, assetsFolder);
    link.setAttribute("href", `assets/${rel}`);
  }
}

export async function copyLocalAssetsToDisk(
  app: App,
  container: HTMLElement,
  sourcePath: string,
  assetsFolder: string
) {
  const path = (window as any).require?.("path") as typeof import("path");
  const fsPromises = ((window as any).require?.("fs") as typeof import("fs"))?.promises;
  if (!path || !fsPromises) {
    throw new Error("Node fs/path unavailable. External export requires desktop mode.");
  }

  async function writeBinary(targetPath: string, data: ArrayBuffer) {
    const dir = path.dirname(targetPath);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(targetPath, Buffer.from(data));
  }

  const images = Array.from(container.querySelectorAll("img"));
  for (const img of images) {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("data:")) continue;
    const linkText = getLinkText(img);
    if (!linkText || isExternalLink(linkText)) continue;
    const file = resolveLinkToFile(app, linkText, sourcePath);
    if (!file) continue;
    const binary = await app.vault.adapter.readBinary(file.path);
    const outPath = path.join(assetsFolder, file.path);
    await writeBinary(outPath, binary);
    const rel = path.relative(assetsFolder, outPath).split(path.sep).join("/");
    img.setAttribute("src", `assets/${rel}`);
  }

  const links = Array.from(container.querySelectorAll("a"));
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const linkText = getLinkText(link);
    if (!linkText || isExternalLink(href) || href.startsWith("#")) continue;
    const file = resolveLinkToFile(app, linkText, sourcePath);
    if (!file) continue;
    const binary = await app.vault.adapter.readBinary(file.path);
    const outPath = path.join(assetsFolder, file.path);
    await writeBinary(outPath, binary);
    const rel = path.relative(assetsFolder, outPath).split(path.sep).join("/");
    link.setAttribute("href", `assets/${rel}`);
  }
}
