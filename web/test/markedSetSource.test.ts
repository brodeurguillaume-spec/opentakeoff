import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { appendMarkedBackground, markedRasterScale, markedSetSourceLoader } from "../src/lib/markedSetSource.js";

test("readable vector sources are loaded once", async () => {
  const source = await PDFDocument.create();
  source.addPage();
  const bytes = await source.save();
  let reads = 0;
  const load = markedSetSourceLoader(async () => { reads++; return bytes; });
  assert.equal(await load("plan"), await load("plan"));
  assert.equal(reads, 1);
});

test("source parse failures are cached rather than retried on every sheet", async () => {
  let reads = 0;
  const load = markedSetSourceLoader(async () => { reads++; return new Uint8Array([1, 2, 3]); });
  await assert.rejects(load("broken"));
  await assert.rejects(load("broken"));
  assert.equal(reads, 1);
});

test("encrypted sources are refused rather than blindly ignoring encryption", async () => {
  const source = await PDFDocument.create();
  source.addPage();
  // The encryption flag is enough to exercise pdf-lib's supported guard; no
  // customer document or password is part of this fixture.
  source.context.trailerInfo.Encrypt = source.context.register(source.context.obj({ Filter: "Standard" }));
  const bytes = await source.save({ useObjectStreams: false });
  const load = markedSetSourceLoader(async () => bytes);
  await assert.rejects(load("protected"), /encrypted/i);
});

test("successful vector pages preserve size, rotation and allow vector annotations", async () => {
  const output = await PDFDocument.create();
  const page = await appendMarkedBackground(output, {
    vector: async (staged: any) => {
      const page = staged.addPage([300, 500]);
      page.setRotation(degrees(90));
      page.drawLine({ start: { x: 10, y: 10 }, end: { x: 100, y: 100 } });
      return page;
    },
    raster: () => { throw new Error("Unexpected fallback"); },
  });
  page.drawText("Shape + markup", { font: await output.embedFont(StandardFonts.Helvetica) });
  const saved = await PDFDocument.load(await output.save());
  assert.equal(saved.getPageCount(), 1);
  assert.deepEqual(saved.getPage(0).getSize(), { width: 300, height: 500 });
  assert.equal(saved.getPage(0).getRotation().angle, 90);
});

test("failed partially-built vector backgrounds never leak pages into the deliverable", async () => {
  const output = await PDFDocument.create();
  output.addPage();
  const warnings: string[] = [];
  await appendMarkedBackground(output, {
    vector: async (staged: any) => { staged.addPage(); throw new Error("broken page tree"); },
    raster: async (doc: any) => doc.addPage([400, 600]),
    onFallback: (error: Error) => warnings.push(error.message),
  });
  assert.deepEqual(warnings, ["broken page tree"]);
  assert.equal((await PDFDocument.load(await output.save())).getPageCount(), 2);
});

test("deferred embed failures trigger fallback before saving the output", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 200]); // No Contents stream: embedPage fails only during flush.
  const output = await PDFDocument.create();
  let fellBack = false;
  await appendMarkedBackground(output, {
    vector: async (staged: any) => {
      const page = staged.addPage([200, 200]);
      page.drawPage(await staged.embedPage(source.getPage(0)));
      return page;
    },
    raster: async (doc: any) => { fellBack = true; return doc.addPage([200, 200]); },
  });
  assert.equal(fellBack, true);
  assert.equal((await PDFDocument.load(await output.save())).getPageCount(), 1);
});

test("an unreadable raster fails explicitly instead of exporting a blank background", async () => {
  const output = await PDFDocument.create();
  await assert.rejects(appendMarkedBackground(output, {
    vector: async () => { throw new Error("unsupported vector"); },
    raster: async () => { throw new Error("render failed"); },
  }), /render failed/);
  assert.equal(output.getPageCount(), 0);
});

test("raster sizes are bounded in landscape, portrait and square plans", () => {
  for (const [width, height] of [[2592, 1728], [1728, 2592], [10000, 10000]]) {
    const s = markedRasterScale(width, height);
    assert.ok(Math.max(width, height) * s <= 5600 + 1e-8);
    assert.ok(width * height * s * s <= 24000000 + 1);
    assert.ok(Math.max(width, height) * markedRasterScale(width, height, true) <= 2800 + 1e-8);
  }
});
