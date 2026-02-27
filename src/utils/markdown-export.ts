import { App, TFile } from "obsidian";
import type { ExportSettings } from "../settings";

const IMAGE_EXT_RE = /png|jpg|jpeg|gif|svg|webp|bmp|tif|tiff/i;

function formatMarkdownLinkTarget(target: string): string {
  if (!target) return target;
  if (/^<.*>$/.test(target)) return target;
  if (/\s|[()]/.test(target)) return `<${target}>`;
  return target;
}

function normalizeLinkTarget(target: string): string {
  const trimmed = target.trim();
  const unwrapped = trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
  try {
    return decodeURI(unwrapped);
  } catch {
    return unwrapped;
  }
}

type OutputInfo = {
  isExternal: boolean;
  assetsPath: string;
  ensureAssetsFolder: () => Promise<void>;
  writeFile: (path: string, contents: string) => Promise<void>;
  join: (fileName: string) => string;
};

function stripDataview(markdown: string, settings: ExportSettings): string {
  if (settings.mdDataviewMode === "keep") return markdown;
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceLang = "";
  for (const line of lines) {
    const fenceStart = line.match(/^```(\S+)?\s*$/);
    if (!inFence && fenceStart) {
      inFence = true;
      fenceLang = (fenceStart[1] || "").toLowerCase();
      if (fenceLang === "dataview" || fenceLang === "dataviewjs") {
        if (settings.mdDataviewMode === "placeholder") out.push(settings.mdDataviewPlaceholder);
      } else {
        out.push(line);
      }
      continue;
    }
    if (inFence && line.trim() === "```") {
      if (fenceLang === "dataview" || fenceLang === "dataviewjs") {
        inFence = false;
        fenceLang = "";
        continue;
      }
      inFence = false;
      fenceLang = "";
      out.push(line);
      continue;
    }
    if (inFence && (fenceLang === "dataview" || fenceLang === "dataviewjs")) {
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function convertCallouts(markdown: string): string {
  const lines = markdown.split("\n");
  const out = lines.map((line) => {
    const match = line.match(/^(\s*(?:>\s*)+)\[!([^\]]+)\]\+?\s*(.*)$/);
    if (!match) return line;
    const prefix = match[1] ?? "";
    const titleText = (match[3] ?? "").trim();
    if (!titleText) return "";
    return `${prefix}${titleText}`;
  });
  return out.join("\n");
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function convertWikilinks(app: App, markdown: string, sourcePath: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (full, inner) => {
    const parts = inner.split("|");
    const target = (parts[0] ?? "").trim();
    const alias = parts[1]?.trim();
    let filePart = target;
    let sub = "";
    if (target.includes("#")) {
      const split = target.split("#");
      const f = split[0] ?? "";
      const h = split[1] ?? "";
      filePart = f;
      sub = h ? `#${slugifyHeading(h)}` : "";
    } else if (target.includes("^")) {
      const split = target.split("^");
      const f = split[0] ?? "";
      const b = split[1] ?? "";
      filePart = f;
      sub = b ? `#^${b}` : "";
    }
    const subText = target.split(/[#^]/)[1] ?? "";
    const text = alias || (sub ? subText : filePart);
    const dest = app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
    if (dest && dest.extension !== "md") {
      return `[${text}](${formatMarkdownLinkTarget(dest.path)})`;
    }
    const link = dest ? `${dest.basename}.md${sub}` : `${filePart}.md${sub}`;
    return `[${text}](${link})`;
  });
}

function extractHeadingSection(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  let start = -1;
  let level = 0;
  const headingRegex = /^(#{1,6})\s+(.*)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = line.match(headingRegex);
    if (!m) continue;
    const headingText = (m[2] ?? "").trim();
    if (headingText === heading.trim()) {
      start = i;
      level = (m[1] ?? "").length;
      break;
    }
  }
  if (start === -1) return null;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = line.match(headingRegex);
    if (i !== start && m && (m[1] ?? "").length <= level) break;
    out.push(line);
  }
  return out.join("\n");
}

function extractBlock(markdown: string, blockId: string): string | null {
  const lines = markdown.split("\n");
  const target = `^${blockId}`;
  for (const line of lines) {
    if (line.includes(target)) {
      return line.replace(new RegExp(`\\s*\\^${blockId}\\s*$`), "");
    }
  }
  return null;
}

async function resolveEmbed(
  app: App,
  target: string,
  sourcePath: string
): Promise<{ type: "file" | "note"; file?: TFile; heading?: string; blockId?: string; alias?: string }> {
  const parts = target.split("|");
  const raw = (parts[0] ?? "").trim();
  const alias = parts[1]?.trim();
  let filePart = raw;
  let heading: string | undefined;
  let blockId: string | undefined;
  if (raw.includes("#")) {
    const split = raw.split("#");
    filePart = split[0] ?? "";
    heading = split[1] ?? "";
  } else if (raw.includes("^")) {
    const split = raw.split("^");
    filePart = split[0] ?? "";
    blockId = split[1] ?? "";
  }
  const file = app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
  if (!file) return { type: "note", heading, blockId, alias };
  if (file.extension !== "md") return { type: "file", file, alias };
  return { type: "note", file, heading, blockId, alias };
}

export function normalizeImageEmbeds(app: App, markdown: string, sourcePath: string): string {
  return markdown.replace(/!\[\[([^\]]+)\]\]/g, (full, inner) => {
    const parts = inner.split("|");
    const raw = (parts[0] ?? "").trim();
    const alias = parts[1]?.trim();
    const filePart = raw.split(/[#^]/)[0]?.trim();
    if (!filePart) return full;
    const file = app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
    if (!file || !IMAGE_EXT_RE.test(file.extension)) return full;
    const label = alias || file.basename;
    return `![${label}](${formatMarkdownLinkTarget(file.path)})`;
  });
}

async function expandEmbeds(
  app: App,
  markdown: string,
  sourcePath: string,
  seen: Set<string>,
  depth: number
): Promise<string> {
  if (depth > 10) return markdown;
  const regex = /!\[\[([^\]]+)\]\]/g;
  let result = "";
  let lastIndex = 0;
  const prefixLines = (text: string, prefix: string): string => {
    if (!prefix) return text;
    return text
      .split("\n")
      .map((line) => {
        const stripped = line.replace(/^\s*(?:>\s*)+/, "");
        return `${prefix}${stripped}`;
      })
      .join("\n");
  };
  for (const match of markdown.matchAll(regex)) {
    const full = match[0] ?? "";
    const inner = match[1] ?? "";
    if (!full) {
      continue;
    }
    const index = match.index ?? 0;
    const lineStart = markdown.lastIndexOf("\n", index - 1) + 1;
    const linePrefix = markdown.slice(lineStart, index);
    const prefixMatch = linePrefix.match(/^(\s*(?:>\s*)+)/);
    const quotePrefix = prefixMatch ? prefixMatch[1] : "";
    if (quotePrefix && linePrefix === quotePrefix) {
      result += markdown.slice(lastIndex, lineStart);
    } else {
      result += markdown.slice(lastIndex, index);
    }
    lastIndex = index + full.length;
    const resolved = await resolveEmbed(app, inner, sourcePath);
    if (resolved.type === "file" && resolved.file) {
      const label = resolved.alias || resolved.file.basename;
      const path = resolved.file.path;
      if (IMAGE_EXT_RE.test(resolved.file.extension)) {
        const rendered = `![${label}](${formatMarkdownLinkTarget(path)})`;
        result += quotePrefix ? prefixLines(rendered, quotePrefix) : rendered;
      } else {
        const rendered = `[${label}](${formatMarkdownLinkTarget(path)})`;
        result += quotePrefix ? prefixLines(rendered, quotePrefix) : rendered;
      }
      continue;
    }

    if (resolved.type === "note" && resolved.file) {
      const key = resolved.file.path + (resolved.heading || "") + (resolved.blockId || "");
      if (seen.has(key)) {
        const rendered = `> Recursive embed blocked: ${inner}`;
        result += quotePrefix ? prefixLines(rendered, quotePrefix) : rendered;
        continue;
      }
      seen.add(key);
      let raw = await app.vault.read(resolved.file);
      if (resolved.heading) {
        const section = extractHeadingSection(raw, resolved.heading);
        raw = section ?? `> Missing heading: ${resolved.heading}`;
      } else if (resolved.blockId) {
        const block = extractBlock(raw, resolved.blockId);
        raw = block ?? `> Missing block: ^${resolved.blockId}`;
      }
      const expanded = await expandEmbeds(app, raw, resolved.file.path, seen, depth + 1);
      const trimmed = expanded.trim();
      result += quotePrefix ? prefixLines(trimmed, quotePrefix) : `\n\n${expanded}\n\n`;
      continue;
    }

    const rendered = `> Missing embed: ${inner}`;
    result += quotePrefix ? prefixLines(rendered, quotePrefix) : rendered;
  }
  result += markdown.slice(lastIndex);
  return result;
}

async function rewriteAssetLinks(
  app: App,
  markdown: string,
  sourcePath: string,
  assetsFolder: string,
  outputInfo: OutputInfo
): Promise<string> {
  const pathMod = (window as any).require?.("path") as typeof import("path");
  const fsPromises = ((window as any).require?.("fs") as typeof import("fs"))?.promises;

  async function copyFile(file: TFile): Promise<string> {
    const binary = await app.vault.adapter.readBinary(file.path);
    const target = outputInfo.isExternal && pathMod
      ? pathMod.join(assetsFolder, file.path)
      : `${assetsFolder}/${file.path}`;
    if (outputInfo.isExternal && fsPromises && pathMod) {
      await fsPromises.mkdir(pathMod.dirname(target), { recursive: true });
      await fsPromises.writeFile(target, Buffer.from(binary));
    } else {
      await app.vault.adapter.writeBinary(target, binary);
    }
    const rel = outputInfo.isExternal && pathMod
      ? pathMod.relative(assetsFolder, target).split(pathMod.sep).join("/")
      : file.path;
    return `assets/${rel}`;
  }

  async function replaceLink(full: string, target: string, isImage: boolean): Promise<string> {
    if (!target) return full;
    const normalizedTarget = normalizeLinkTarget(target);
    if (/^https?:\/\//i.test(normalizedTarget)) return full;
    const hashSplit = normalizedTarget.split("#");
    const hashBase = (hashSplit[0] ?? "").split("|");
    const cleaned = (hashBase[0] ?? "").trim();
    const file = app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
    if (!file) return full;
    const newPath = await copyFile(file);
    const formatted = formatMarkdownLinkTarget(newPath);
    if (isImage) {
      return full.replace(target, formatted);
    }
    return full.replace(target, formatted);
  }

  const imageRegex = /!\[[^\]]*]\(([^)]+)\)/g;
  const linkRegex = /\[[^\]]+]\(([^)]+)\)/g;

  let out = markdown;
  const imageMatches = Array.from(out.matchAll(imageRegex));
  for (const match of imageMatches) {
    const full = match[0] ?? "";
    const target = match[1] ?? "";
    if (!full) continue;
    out = out.replace(full, await replaceLink(full, target, true));
  }
  const linkMatches = Array.from(out.matchAll(linkRegex));
  for (const match of linkMatches) {
    const full = match[0] ?? "";
    const target = match[1] ?? "";
    if (!full) continue;
    out = out.replace(full, await replaceLink(full, target, false));
  }
  return out;
}

export async function exportMarkdown(input: {
  app: App;
  sourcePath: string;
  markdown: string;
  settings: ExportSettings;
  assetsFolder: string;
  outputInfo: OutputInfo;
}): Promise<{ markdown: string }> {
  let md = input.markdown;
  md = stripDataview(md, input.settings);
  if (input.settings.mdExpandEmbeds) {
    md = await expandEmbeds(input.app, md, input.sourcePath, new Set(), 0);
  }
  if (input.settings.mdConvertCallouts) {
    md = convertCallouts(md);
  }
  if (input.settings.mdConvertWikilinks) {
    md = convertWikilinks(input.app, md, input.sourcePath);
  }
  if (input.settings.copyAssets) {
    md = await rewriteAssetLinks(input.app, md, input.sourcePath, input.assetsFolder, input.outputInfo);
  }
  return { markdown: md };
}
