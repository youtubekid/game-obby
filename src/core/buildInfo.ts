export const buildInfo: BuildInfo = __BUILD_INFO__;

export function formatBuildInfo(info: BuildInfo): string {
  return `v${info.version} (${info.commit})`;
}
