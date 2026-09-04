// CSS-pixel viewport policy. A 1080p laptop normally exposes roughly
// 930–1000px of content height after window chrome, while a full-height 1440p
// workstation stays comfortably above this boundary. Width also catches the
// common 1366/1536 laptop layouts and resized desktop windows.
export const COMPACT_VIEWPORT_MQ = "(max-width: 1500px), (max-height: 1050px)";

export function isCompactViewport(width, height) {
  const w = Number(width);
  const h = Number(height);
  return (Number.isFinite(w) && w <= 1500) || (Number.isFinite(h) && h <= 1050);
}
