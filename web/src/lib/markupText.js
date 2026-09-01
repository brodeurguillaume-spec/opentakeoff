// Pure text helpers shared by the canvas, panel editor, and Marked Set export.
// Markup text is stored as ordinary JSON text with `\n`; layout is derived.

export function markupTextLines(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
}

export function markupTextLayout(text, { charWidth = 7, lineHeight = 16, padX = 10, padY = 4 } = {}) {
  const lines = markupTextLines(text);
  const maxChars = Math.max(1, ...lines.map((line) => line.length));
  return { lines, width: maxChars * charWidth + padX, height: Math.max(1, lines.length) * lineHeight + padY, lineHeight };
}

export function insertMarkupLineBreak(value, selectionStart, selectionEnd) {
  const text = String(value ?? "");
  const start = Math.max(0, Math.min(text.length, Number(selectionStart) || 0));
  const end = Math.max(start, Math.min(text.length, Number(selectionEnd) || start));
  return { value: `${text.slice(0, start)}\n${text.slice(end)}`, caret: start + 1 };
}
