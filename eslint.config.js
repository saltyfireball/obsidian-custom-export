import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import { DEFAULT_BRANDS } from "eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        window: "readonly",
        document: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        console: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        btoa: "readonly",
        getComputedStyle: "readonly",
        HTMLElement: "readonly",
        MutationObserver: "readonly",
        URL: "readonly",
        File: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        Uint8Array: "readonly",
        CSSRule: "readonly",
        CSSStyleRule: "readonly",
        NodeRequire: "readonly",
      },
    },
    rules: {
      "obsidianmd/sample-names": "off",
      "obsidianmd/ui/sentence-case": ["error", {
        enforceCamelCaseLower: true,
        brands: [...DEFAULT_BRANDS, "Dataview", "DataviewJS", "Lambda", "URLs", "waitFor"],
        ignoreRegex: ["^[a-z][a-z0-9_-]*$"],
      }],
    },
  },
]);
