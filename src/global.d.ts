declare global {
  interface Window {
    require: NodeRequire;
  }
}

declare module "obsidian" {
  interface App {
    plugins: {
      plugins: Record<string, unknown>;
      enabledPlugins: Set<string>;
      getPlugin(id: string): unknown;
    };
  }
}

export {};
