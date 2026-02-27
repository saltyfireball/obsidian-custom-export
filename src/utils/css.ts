import { App, normalizePath } from "obsidian";

// Selectors to exclude from export (rules with var() that evaluate to empty)
const EXCLUDED_SELECTORS = [
  ".sfb-figlet-display.sfb-figlet-gradient pre",
];

function shouldExcludeRule(rule: CSSRule): boolean {
  if (rule instanceof CSSStyleRule) {
    const selector = rule.selectorText;
    return EXCLUDED_SELECTORS.some(excluded => selector === excluded);
  }
  return false;
}

export function collectCssTextFromDom(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (shouldExcludeRule(rule)) continue;
        parts.push(rule.cssText);
      }
    } catch {
      // Some sheets may be inaccessible; ignore them.
    }
  }
  return normalizeCssForExport(parts.join("\n"));
}

/**
 * Normalize CSS for consistent cross-platform exports.
 * Removes/transforms mobile-specific rules so exports from mobile
 * and desktop devices produce identical results.
 */
function normalizeCssForExport(css: string): string {
  const mobileOnlyPattern = /body\.is-mobile[^{]*\{[^}]*\}/g;
  const iosOnlyPattern = /body\.is-ios[^{]*\{[^}]*\}/g;
  const phoneOnlyPattern = /body\.is-phone[^{]*\{[^}]*\}/g;
  const tabletOnlyPattern = /body\.is-tablet[^{]*\{[^}]*\}/g;
  const androidOnlyPattern = /body\.is-android[^{]*\{[^}]*\}/g;

  let result = css;
  result = result.replace(mobileOnlyPattern, "/* mobile rule removed */");
  result = result.replace(iosOnlyPattern, "/* ios rule removed */");
  result = result.replace(phoneOnlyPattern, "/* phone rule removed */");
  result = result.replace(tabletOnlyPattern, "/* tablet rule removed */");
  result = result.replace(androidOnlyPattern, "/* android rule removed */");

  result = result.replace(/body:not\(\.is-mobile\)/g, "body");
  result = result.replace(/body:not\(\.is-ios\)/g, "body");
  result = result.replace(/body:not\(\.is-phone\)/g, "body");
  result = result.replace(/body:not\(\.is-tablet\)/g, "body");
  result = result.replace(/body:not\(\.is-android\)/g, "body");

  return result;
}

const MIME_EXTENSIONS = new Map([
  ["woff2", "font/woff2"],
  ["woff", "font/woff"],
  ["ttf", "font/ttf"],
  ["otf", "font/otf"],
  ["eot", "application/vnd.ms-fontobject"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
  ["bmp", "image/bmp"],
  ["tif", "image/tiff"],
  ["tiff", "image/tiff"],
]);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function getExtensionFromUrl(url: string): string {
  const clean = (url.split("?")[0] ?? "").split("#")[0] ?? "";
  const parts = clean.split(".");
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return (last ?? "").toLowerCase();
}

export async function inlineLocalAssetUrls(app: App, cssText: string): Promise<string> {
  const matches = Array.from(cssText.matchAll(/url\(([^)]+)\)/g));
  if (matches.length === 0) return cssText;
  const replacements = new Map<string, string>();
  const windowObj = window as unknown as { require?: (module: string) => typeof import("fs") };
  const fsPromises = windowObj.require?.("fs")?.promises;

  for (const match of matches) {
    const raw = match[1] ?? "";
    const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
    if (!trimmed || trimmed.startsWith("data:")) continue;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) continue;
    const ext = getExtensionFromUrl(trimmed);
    const mime = MIME_EXTENSIONS.get(ext);
    if (!mime) continue;
    if (replacements.has(trimmed)) continue;
    try {
      let buffer: ArrayBuffer | null = null;
      if (trimmed.startsWith("file://")) {
        if (!fsPromises) continue;
        const filePath = decodeURIComponent(trimmed.replace("file://", ""));
        const nodeBuf = await fsPromises.readFile(filePath);
        buffer = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength) as ArrayBuffer;
      } else if (trimmed.startsWith("/")) {
        if (!fsPromises) continue;
        const nodeBuf = await fsPromises.readFile(trimmed);
        buffer = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength) as ArrayBuffer;
      } else {
        const res = await fetch(trimmed); // eslint-disable-line no-restricted-globals -- CSS asset URLs may be external file:// or relative paths not suitable for requestUrl
        if (!res.ok) continue;
        buffer = await res.arrayBuffer();
      }
      if (!buffer) continue;
      const base64 = arrayBufferToBase64(buffer);
      const dataUrl = `data:${mime};base64,${base64}`;
      replacements.set(trimmed, dataUrl);
    } catch {
      // ignore
    }
  }

  if (replacements.size === 0) return cssText;
  return cssText.replace(/url\(([^)]+)\)/g, (full, raw) => {
    const trimmed = String(raw ?? "").trim().replace(/^['"]|['"]$/g, "");
    const replacement = replacements.get(trimmed);
    if (!replacement) return full;
    return `url("${replacement}")`;
  });
}

async function safeRead(app: App, path: string): Promise<string> {
  try {
    return await app.vault.adapter.read(path);
  } catch {
    return "";
  }
}

export async function collectEnabledSnippets(
  app: App
): Promise<{ cssText: string; snippetPaths: string[] }> {
  const parts: string[] = [];
  const loadedPaths: string[] = [];
  const base = normalizePath(app.vault.configDir);
  const appearancePath = normalizePath(`${base}/appearance.json`);
  const appearanceRaw = await safeRead(app, appearancePath);
  let appearance: unknown = null;
  if (appearanceRaw) {
    try {
      appearance = JSON.parse(appearanceRaw);
    } catch {
      appearance = null;
    }
  }

  const parsed = appearance as { enabledCssSnippets?: unknown } | null;
  const enabledSnippets: string[] = Array.isArray(parsed?.enabledCssSnippets)
    ? (parsed.enabledCssSnippets as string[])
    : [];
  const snippetsDir = normalizePath(`${base}/snippets`);
  const candidatePaths = new Set<string>();

  if (enabledSnippets.length > 0) {
    for (const snippet of enabledSnippets) {
      const trimmed = String(snippet).trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase().endsWith(".css")) {
        candidatePaths.add(normalizePath(`${snippetsDir}/${trimmed}`));
      } else {
        candidatePaths.add(normalizePath(`${snippetsDir}/${trimmed}.css`));
        candidatePaths.add(normalizePath(`${snippetsDir}/${trimmed}`));
      }
    }
  } else {
    try {
      const listed = await app.vault.adapter.list(snippetsDir);
      for (const file of listed.files) {
        if (file.toLowerCase().endsWith(".css")) {
          candidatePaths.add(normalizePath(file));
        }
      }
    } catch {
      // ignore
    }
  }

  for (const snippetPath of candidatePaths) {
    const snippetCss = await safeRead(app, snippetPath);
    if (snippetCss) {
      parts.push(snippetCss);
      loadedPaths.push(snippetPath);
    }
  }

  return { cssText: parts.join("\n"), snippetPaths: loadedPaths };
}
