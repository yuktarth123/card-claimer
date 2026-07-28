import { UAParser } from "ua-parser-js";

export interface DeviceInfo {
  deviceType: "mobile" | "tablet" | "desktop";
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
}

export function getDeviceInfo(): DeviceInfo {
  const parser = new UAParser();
  const result = parser.getResult();

  // ua-parser-js only reports a device.type for mobile/tablet (and a few
  // niche categories); anything else -- laptops, desktops -- comes back
  // undefined, which is the "desktop" bucket for our purposes.
  const rawType = result.device.type;
  const deviceType: DeviceInfo["deviceType"] =
    rawType === "mobile" ? "mobile" : rawType === "tablet" ? "tablet" : "desktop";

  return {
    deviceType,
    browser: result.browser.name ?? null,
    browserVersion: result.browser.version ?? null,
    os: result.os.name ?? null,
  };
}
