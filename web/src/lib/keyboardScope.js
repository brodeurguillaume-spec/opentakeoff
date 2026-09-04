// A key used in a form/panel must never edit the selected drawing behind it.
export function ownsKeyboard(event) {
  const target = event.target;
  return Boolean(event.defaultPrevented || event.isComposing || target?.isContentEditable
    || target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-canvas-shortcuts="off"]'));
}
