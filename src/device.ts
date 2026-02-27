import { App, Platform } from "obsidian";

export interface DeviceInfo {
  id: string;
  type: string;
  typeLabel: string;
}

const DEVICE_TYPES: Record<string, string> = {
  IOS: "ios",
  IPAD: "ipad",
  ANDROID: "android",
  ANDROID_TABLET: "android-tablet",
  MACOS: "macos",
  WINDOWS: "windows",
  LINUX: "linux",
};

const DEVICE_TYPE_LABELS: Record<string, string> = {
  [DEVICE_TYPES.IOS]: "iPhone",
  [DEVICE_TYPES.IPAD]: "iPad",
  [DEVICE_TYPES.ANDROID]: "Android",
  [DEVICE_TYPES.ANDROID_TABLET]: "Android Tablet",
  [DEVICE_TYPES.MACOS]: "Mac",
  [DEVICE_TYPES.WINDOWS]: "Windows",
  [DEVICE_TYPES.LINUX]: "Linux",
};

const DEVICE_STORAGE_KEY = "saltyfireball-device-id";

function generateUniqueId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceType() {
  if (Platform.isIosApp) {
    return Platform.isTablet ? DEVICE_TYPES.IPAD : DEVICE_TYPES.IOS;
  }
  if (Platform.isAndroidApp) {
    return Platform.isTablet
      ? DEVICE_TYPES.ANDROID_TABLET
      : DEVICE_TYPES.ANDROID;
  }
  if (Platform.isMacOS) return DEVICE_TYPES.MACOS;
  if (Platform.isWin) return DEVICE_TYPES.WINDOWS;
  if (Platform.isLinux) return DEVICE_TYPES.LINUX;
  return Platform.isMobile ? DEVICE_TYPES.IOS : DEVICE_TYPES.MACOS;
}

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY); // eslint-disable-line no-restricted-globals -- device ID is global, not vault-specific
  if (!deviceId) {
    deviceId = generateUniqueId();
    localStorage.setItem(DEVICE_STORAGE_KEY, deviceId); // eslint-disable-line no-restricted-globals -- device ID is global, not vault-specific
  }
  return deviceId;
}

export function isMobileApp(app: App): boolean {
	const platform = Platform as unknown as Record<string, boolean | undefined>;
	const appRecord = app as unknown as Record<string, boolean | undefined>;
	const isMobilePlatform =
		Boolean(appRecord.isMobile) ||
		Boolean(platform.isMobile) ||
		Boolean(platform.isMobileApp) ||
		Boolean(platform.isAndroidApp) ||
		Boolean(platform.isIosApp);
	const windowObj = window as unknown as { require?: (module: string) => unknown };
	const hasElectron = Boolean(windowObj.require?.("electron"));
	return isMobilePlatform || !hasElectron;
}

export function getDeviceInfo(): DeviceInfo {
  const type = getDeviceType();
  const typeLabel = DEVICE_TYPE_LABELS[type] || type;
  return {
    id: getOrCreateDeviceId(),
    type,
    typeLabel,
  };
}
