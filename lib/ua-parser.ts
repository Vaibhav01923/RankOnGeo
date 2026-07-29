import { UAParser } from "ua-parser-js";

export type DeviceType = "desktop" | "mobile" | "tablet" | "other";

// Isolates the third-party parser behind one function, same reasoning as
// lib/bot-detection.ts being the single place that knows bot UA patterns —
// except here we lean on a maintained library instead of a hand-rolled list,
// since the output is customer-visible in a paid dashboard and the surface
// (browsers, OEM webviews, foldables, etc.) is far bigger than "~20 known bots".
export function parseUserAgent(userAgent: string | null | undefined): {
  deviceType: DeviceType;
  browser: string;
  os: string;
} {
  try {
    if (!userAgent) return { deviceType: "desktop", browser: "Unknown", os: "Unknown" };
    const result = new UAParser(userAgent).getResult();

    // ua-parser-js leaves device.type undefined for ordinary desktop UAs —
    // that's its own documented convention, not a missing-data case.
    const rawType = result.device.type;
    const deviceType: DeviceType =
      rawType === undefined ? "desktop" : rawType === "mobile" ? "mobile" : rawType === "tablet" ? "tablet" : "other";

    return {
      deviceType,
      browser: result.browser.name ?? "Unknown",
      os: result.os.name ?? "Unknown",
    };
  } catch {
    // Never let analytics ingestion fail on a malformed/garbage UA string.
    return { deviceType: "desktop", browser: "Unknown", os: "Unknown" };
  }
}
