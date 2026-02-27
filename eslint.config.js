import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

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
    },
  },
]);
