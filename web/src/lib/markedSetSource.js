import { PDFDocument } from "pdf-lib";

// Cache failures as well as successes: a protected multi-page source must not
// be reparsed for each sheet. ignoreEncryption is NOT decryption; PDF.js can
// render some sources that pdf-lib cannot safely copy.
export function markedSetSourceLoader(loadPdfData) {
  const sources = new Map();
  return (file) => {
    if (!sources.has(file)) sources.set(file, (async () => {
      const source = await PDFDocument.load(await loadPdfData(file));
      source.getPageCount(); // Validate the page tree before any destination write.
      return source;
    })());
    return sources.get(file);
  };
}

// Keep a failed vector attempt out of the real document. Embedding can fail
// lazily at flush/save time; force it here before choosing the fallback.
/**
 * @param {PDFDocument} output
 * @param {{ vector: (doc: PDFDocument) => Promise<import('pdf-lib').PDFPage>, raster: (doc: PDFDocument) => Promise<import('pdf-lib').PDFPage>, onFallback?: (error: Error) => void }} options
 */
export async function appendMarkedBackground(output, { vector, raster, onFallback = null }) {
  let staged;
  let pageIndex;
  try {
    staged = await PDFDocument.create();
    const page = await vector(staged);
    page.node.normalizedEntries();
    await staged.flush();
    pageIndex = staged.getPages().indexOf(page);
    if (pageIndex < 0) throw new Error("Vector background has no page.");
  } catch (error) {
    onFallback?.(error instanceof Error ? error : new Error(String(error)));
    return raster(output); // A rendering failure must propagate, never yield a blank plan.
  }
  const [copied] = await output.copyPages(staged, [pageIndex]);
  return output.addPage(copied);
}

export function markedRasterScale(width, height, dark = false) {
  // 5600px / 24MP keeps light fallback plans legible without an unbounded
  // full-size canvas. Existing dark exports keep their 2800px limit.
  return Math.min((dark ? 2800 : 5600) / Math.max(width, height), Math.sqrt(24000000 / (width * height)), 4);
}
