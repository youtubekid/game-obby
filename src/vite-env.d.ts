/// <reference types="vite/client" />

interface BuildInfo {
  version: string;
  commit: string;
  builtAt: string;
  basePath: string;
}

declare const __BUILD_INFO__: BuildInfo;
