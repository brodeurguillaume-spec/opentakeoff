// Mouse-wheel intent is presentation-specific:
// - one ordinary sheet/tab keeps the drafting-canvas controls (wheel zooms,
//   trackpad scroll pans);
// - a vertical working set behaves like a document (wheel scrolls the set,
//   Ctrl/Cmd+wheel zooms).
// Keep this decision pure so changing one presentation can never leak into the
// other again.

export const DEFAULT_WHEEL_ZOOM_PERCENT = 12;
export const MIN_WHEEL_ZOOM_PERCENT = 4;
export const MAX_WHEEL_ZOOM_PERCENT = 30;

export function sanitizeWheelZoomPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WHEEL_ZOOM_PERCENT;
  return Math.round(Math.max(MIN_WHEEL_ZOOM_PERCENT, Math.min(MAX_WHEEL_ZOOM_PERCENT, n)));
}

export function wheelIntent({ stacked = false, shiftKey = false, modified = false, device = "mouse" } = {}) {
  if (shiftKey) return "pan";
  if (stacked && !modified) return "pan";
  if (modified) return device === "trackpad" ? "zoom-continuous" : "zoom-notch";
  return device === "trackpad" ? "pan" : "zoom-notch";
}

// The original canvas used 0.0012 × a Windows ±100 wheel notch, i.e. an
// exponential zoom distance of 0.12. Express the same tuning as an operator-
// readable percentage while preserving 12 as the byte-for-byte default rate.
export function wheelNotchDelta(deltaY, deltaMode = 0, zoomPercent = DEFAULT_WHEEL_ZOOM_PERCENT) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1;
  return -Number(deltaY || 0) * unit * sanitizeWheelZoomPercent(zoomPercent) * 0.0001;
}
