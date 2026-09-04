import test from "node:test";
import assert from "node:assert/strict";

import {
  createGrumpProjectStore,
  grumpProjectApiBaseFromUrl,
  grumpProjectIdFromUrl,
} from "../src/lib/grumpProjectStore.js";

const empty = {
  schema: "opentakeoff.takeoff_canvas.v1",
  conditions: [], shapes: [], markups: [], sheets: [],
};

test("plan removal archives on disk before evicting cached bytes, without touching measurements", async () => {
  const calls: string[] = [];
  const base: any = { removePdf: async (name: string) => { calls.push(`cache:${name}`); } };
  const fetchLike: any = async (url: string, init: any) => {
    calls.push(`${init.method}:${url}`);
    return response({ removed: true });
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);
  assert.equal(store.planRemovalPolicy, "project-trash");
  await store.removePdf("A 1.pdf");
  assert.deepEqual(calls, ["DELETE:/api/project/plans/A%201.pdf", "cache:A 1.pdf"]);
});

test("failed plan removal preserves the cache and can be retried", async () => {
  let cached = true;
  let refused = true;
  const base: any = { removePdf: async () => { cached = false; } };
  const fetchLike: any = async () => refused
    ? response({ message: "PDF verrouillé" }, 409)
    : response({ removed: true });
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);
  await assert.rejects(store.removePdf("A.pdf"), /PDF verrouillé/);
  assert.equal(cached, true);
  refused = false;
  await store.removePdf("A.pdf");
  assert.equal(cached, false);
});

function response(body: any, status = 200, type = "application/json", headers: Record<string, string> = {}) {
  return new Response(type === "application/json" ? JSON.stringify(body) : body, {
    status,
    headers: { "content-type": type, ...headers },
  });
}

const library = (kind: string, data: any, revision = `${kind}-rev-1`) => ({
  schema: "anviltrace.library.v1",
  kind,
  revision,
  updated_at: "2026-09-01T12:00:00+00:00",
  data,
});

test("grump project scope requires the explicit loopback bridge URL", () => {
  assert.equal(grumpProjectIdFromUrl(new URL("http://127.0.0.1/canvas?grumpBridge=1&grumpProject=bid-42") as any), "bid-42");
  assert.equal(grumpProjectIdFromUrl(new URL("http://127.0.0.1/canvas?grumpProject=bid-42") as any), "");
  assert.equal(grumpProjectIdFromUrl(new URL("https://example.com/?grumpBridge=1&grumpProject=bid-42") as any), "");
});

test("multi-project API base accepts only a scoped loopback manager path", () => {
  const scoped = new URL(
    "http://127.0.0.1/canvas?grumpBridge=1&grumpProject=bid-42-demo&grumpApiBase=/projects/bid-42-demo/api/project",
  );
  assert.equal(grumpProjectApiBaseFromUrl(scoped as any), "/projects/bid-42-demo/api/project");
  assert.equal(
    grumpProjectApiBaseFromUrl(
      new URL("http://127.0.0.1/canvas?grumpBridge=1&grumpProject=bid-42-demo&grumpApiBase=/projects/other-123/api/project") as any,
    ),
    "/api/project",
  );
  assert.equal(
    grumpProjectApiBaseFromUrl(new URL("https://example.com/canvas?grumpApiBase=/projects/bid-42-demo/api/project") as any),
    "/api/project",
  );
});

test("multi-project store sends every mirror request to its scoped API", async () => {
  const calls: string[] = [];
  const base: any = {
    loadAnnotations: async () => empty,
    saveAnnotations: async () => {},
  };
  const fetchLike: any = async (url: string, init: any = {}) => {
    calls.push(url);
    if (!init.method) return response({ error: "takeoff_not_found" }, 404);
    return response({ saved: true });
  };
  const apiBase = "/projects/bid-42-demo/api/project";
  const store = createGrumpProjectStore(base, "bid-42-demo", fetchLike, "bid-42-demo", apiBase);
  await store.loadAnnotations();
  assert.deepEqual(calls, [`${apiBase}/takeoff`, `${apiBase}/takeoff`]);
});

test("first load mirrors an existing browser-only takeoff to disk", async () => {
  let localSave: any = null;
  const calls: { url: string, init: any }[] = [];
  const base: any = {
    loadAnnotations: async () => empty,
    saveAnnotations: async (payload: any) => { localSave = payload; },
  };
  const fetchLike: any = async (url: string, init: any = {}) => {
    calls.push({ url, init });
    if (url === "/api/project/takeoff" && !init.method) return response({ error: "takeoff_not_found" }, 404);
    return response({ saved: true });
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);
  assert.deepEqual(await store.loadAnnotations(), empty);
  assert.deepEqual(localSave, empty);
  assert.equal(calls[1].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].init.body), empty);
});

test("disk takeoff is canonical and rehydrates IndexedDB", async () => {
  const disk = { ...empty, conditions: [{ id: "C1" }] };
  let saved: any = null;
  const base: any = {
    loadAnnotations: async () => empty,
    saveAnnotations: async (payload: any) => { saved = payload; },
  };
  const store = createGrumpProjectStore(base, "bid-42", async () => response(disk));
  assert.deepEqual(await store.loadAnnotations(), disk);
  assert.deepEqual(saved, disk);
});

test("first library load migrates IndexedDB once and makes disk canonical", async () => {
  const cached = [{ finish_tag: "BR-CACHE" }];
  const sanitizedCache = [{ finish_tag: "BR-CACHE", materials: [] }];
  const writes: any[] = [];
  const base: any = {
    loadTemplates: async () => cached,
    saveTemplates: async (value: any) => { writes.push(value); },
  };
  let exists = false;
  const fetchLike: any = async (url: string, init: any = {}) => {
    assert.equal(url, "/api/project/libraries/products");
    if (!init.method && !exists) return response({ error: "library_not_found" }, 404);
    if (init.method === "PUT") {
      assert.equal(init.headers["If-None-Match"], "*");
      exists = true;
      return response(library("products", JSON.parse(init.body)));
    }
    return response(library("products", [{ finish_tag: "BR-DISK" }]));
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);

  assert.deepEqual(await store.loadTemplates(), sanitizedCache);
  assert.deepEqual(writes, [sanitizedCache]);
  assert.deepEqual(await store.loadTemplates(), [{ finish_tag: "BR-DISK", materials: [] }]);
  assert.deepEqual(writes.at(-1), [{ finish_tag: "BR-DISK", materials: [] }]);
});

test("library writes reach disk before the IndexedDB cache and carry revision guards", async () => {
  const order: string[] = [];
  const base: any = {
    loadMaterialLibrary: async () => [],
    saveMaterialLibrary: async () => { order.push("cache"); },
  };
  let first = true;
  const fetchLike: any = async (_url: string, init: any = {}) => {
    if (!init.method) return response(library("materials", [], "rev-1"));
    assert.equal(init.headers["If-Match"], "rev-1");
    order.push("disk");
    first = false;
    return response(library("materials", JSON.parse(init.body), "rev-2"));
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);
  await store.loadMaterialLibrary();
  order.length = 0;
  await store.saveMaterialLibrary([{ id: "m1", name: "Mortier Type N" }]);

  assert.equal(first, false);
  assert.deepEqual(order, ["disk", "cache"]);
});

test("a disk library conflict never advances the IndexedDB cache", async () => {
  let cacheWrites = 0;
  const base: any = {
    loadStampLibrary: async () => ({ stamps: [], sets: [] }),
    saveStampLibrary: async () => { cacheWrites += 1; },
  };
  const fetchLike: any = async (_url: string, init: any = {}) => {
    if (!init.method) return response(library("stamps", { stamps: [], sets: [] }, "rev-1"));
    return response({ message: "modified elsewhere" }, 409);
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);
  await store.loadStampLibrary();
  cacheWrites = 0;

  await assert.rejects(
    store.saveStampLibrary({ stamps: [{ id: "s1", name: "Note", elements: [] }], sets: [] }),
    /modified elsewhere/,
  );
  assert.equal(cacheWrites, 0);
});

test("IndexedDB failure cannot block a disk-authoritative library", async () => {
  const diskProducts = [{ finish_tag: "BR-DISK" }];
  const base: any = {
    loadTemplates: async () => { throw new Error("IndexedDB unavailable"); },
    saveTemplates: async () => { throw new Error("IndexedDB quota exceeded"); },
  };
  const fetchLike: any = async (_url: string, init: any = {}) => {
    if (!init.method) return response(library("products", diskProducts, "rev-1"));
    return response(library("products", JSON.parse(init.body), "rev-2"));
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);

  assert.deepEqual(await store.loadTemplates(), [{ finish_tag: "BR-DISK", materials: [] }]);
  assert.deepEqual(await store.saveTemplates([{ finish_tag: "BR-NEXT" }]), [{ finish_tag: "BR-NEXT", materials: [] }]);
});

test("a first shell launch can create an empty disk library without IndexedDB", async () => {
  const base: any = {
    loadStampLibrary: async () => { throw new Error("IndexedDB unavailable"); },
    saveStampLibrary: async () => { throw new Error("IndexedDB unavailable"); },
  };
  let created: any = null;
  const fetchLike: any = async (_url: string, init: any = {}) => {
    if (!init.method && !created) return response({ error: "library_not_found" }, 404);
    if (init.method === "PUT") {
      created = JSON.parse(init.body);
      return response(library("stamps", created, "rev-empty"));
    }
    return response(library("stamps", created, "rev-empty"));
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);

  assert.deepEqual(await store.loadStampLibrary(), { stamps: [], sets: [] });
  assert.deepEqual(created, { stamps: [], sets: [] });
});

test("disk mirror adds the takeoff schema before sending a raw canvas payload", async () => {
  let localSave: any = null;
  let uploaded: any = null;
  const base: any = {
    saveAnnotations: async (payload: any) => { localSave = payload; },
  };
  const store = createGrumpProjectStore(base, "bid-42", async (_url: RequestInfo | URL, init?: RequestInit) => {
    uploaded = JSON.parse(String(init?.body));
    return response({ saved: true });
  });

  await store.saveAnnotations({ conditions: [], shapes: [] } as any);

  assert.equal(localSave.schema, "opentakeoff.takeoff_canvas.v1");
  assert.equal(uploaded.schema, "opentakeoff.takeoff_canvas.v1");
});

test("failed durable takeoff writes never advance the browser cache", async () => {
  let localSaves = 0;
  let attempts = 0;
  const base: any = {
    saveAnnotations: async () => { localSaves += 1; },
  };
  const store = createGrumpProjectStore(base, "bid-42", async () => {
    attempts += 1;
    return response({ message: "disk unavailable" }, 503);
  });

  await assert.rejects(
    store.saveAnnotations({ ...empty, shapes: [{ id: "S1" }] } as any),
    /disk unavailable/,
  );
  assert.equal(attempts, 3);
  assert.equal(localSaves, 0);
});

test("permanent client errors are not retried or cached locally", async () => {
  let attempts = 0;
  let localSaves = 0;
  const base: any = {
    saveAnnotations: async () => { localSaves += 1; },
  };
  const store = createGrumpProjectStore(base, "bid-42", async () => {
    attempts += 1;
    return response({ message: "invalid takeoff" }, 400);
  });

  await assert.rejects(store.saveAnnotations(empty), /invalid takeoff/);
  assert.equal(attempts, 1);
  assert.equal(localSaves, 0);
});

test("transient takeoff mirror failures are retried before caching locally", async () => {
  let attempts = 0;
  const local: any[] = [];
  const base: any = {
    saveAnnotations: async (payload: any) => { local.push(payload); },
  };
  const store = createGrumpProjectStore(base, "bid-42", async () => {
    attempts += 1;
    return attempts < 3
      ? response({ message: "try again" }, 503)
      : response({ saved: true });
  });

  await store.saveAnnotations({ ...empty, shapes: [{ id: "S1" }] } as any);
  assert.equal(attempts, 3);
  assert.equal(local.length, 1);
  assert.equal(local[0].shapes[0].id, "S1");
});

test("rapid takeoff saves stay ordered across the durable mirror and browser cache", async () => {
  const durableOrder: string[] = [];
  const localOrder: string[] = [];
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const base: any = {
    saveAnnotations: async (payload: any) => { localOrder.push(payload.shapes[0].id); },
  };
  const store = createGrumpProjectStore(base, "bid-42", async (_url: RequestInfo | URL, init?: RequestInit) => {
    const id = JSON.parse(String(init?.body)).shapes[0].id;
    if (id === "S1") await firstBlocked;
    durableOrder.push(id);
    return response({ saved: true });
  });

  const first = store.saveAnnotations({ ...empty, shapes: [{ id: "S1" }] } as any);
  const second = store.saveAnnotations({ ...empty, shapes: [{ id: "S2" }] } as any);
  await Promise.resolve();
  assert.deepEqual(durableOrder, []);
  releaseFirst();
  await Promise.all([first, second]);

  assert.deepEqual(durableOrder, ["S1", "S2"]);
  assert.deepEqual(localOrder, ["S1", "S2"]);
});

test("plan hydration pushes browser-only PDFs and restores disk-only PDFs", async () => {
  const pdfs = new Map<string, Uint8Array>([["local.pdf", new TextEncoder().encode("%PDF-local")]]);
  const uploads: string[] = [];
  const base: any = {
    listSheets: async () => [...pdfs.keys()].map((name) => ({ name })),
    loadPdfData: async (name: string) => pdfs.get(name),
    addPdf: async (file: File) => { pdfs.set(file.name, new Uint8Array(await file.arrayBuffer())); },
  };
  const fetchLike: any = async (url: string, init: any = {}) => {
    if (url === "/api/project/plans") {
      return response({ project_id: "bid-42", plans: [{ name: "disk.pdf" }] });
    }
    if (url.endsWith("local.pdf") && init.method === "PUT") {
      uploads.push("local.pdf");
      return response({ name: "local.pdf" });
    }
    if (url.endsWith("disk.pdf")) return response(new TextEncoder().encode("%PDF-disk"), 200, "application/pdf");
    throw new Error(`Unexpected fetch ${url}`);
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);
  assert.deepEqual((await store.listSheets()).map((row: any) => row.name).sort(), ["disk.pdf", "local.pdf"]);
  assert.deepEqual(uploads, ["local.pdf"]);
});

test("large PDF import reads the File once and reuses the bytes for both stores", async () => {
  let fileReads = 0;
  let cached: Uint8Array | null = null;
  let mirrored: Uint8Array | null = null;
  const base: any = {
    addPdfBytes: async (_name: string, bytes: Uint8Array) => {
      cached = new Uint8Array(bytes);
      return { name: "large.pdf", rev: 1 };
    },
  };
  const fetchLike: any = async (url: string, init: any = {}) => {
    if (url.endsWith("large.pdf") && init.method === "PUT") {
      mirrored = new Uint8Array(init.body);
      return response({ name: "large.pdf" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);
  const file = {
    name: "large.pdf",
    type: "application/pdf",
    arrayBuffer: async () => { fileReads += 1; return new Uint8Array([37, 80, 68, 70]).buffer; },
  } as any;

  await store.addPdf(file);

  assert.equal(fileReads, 1);
  assert.deepEqual([...cached!], [37, 80, 68, 70]);
  assert.deepEqual([...mirrored!], [37, 80, 68, 70]);
});

test("GRUMP sheet registry exposes the current browser PDF hash and revision", async () => {
  const digest = "a".repeat(64);
  const base: any = {
    listSheets: async () => [{ name: "A101.pdf" }],
    loadPdfData: async () => new TextEncoder().encode("%PDF-a101"),
    listPdfRevisions: async () => [{ rev: 4, hash: digest, current: true }],
  };
  const fetchLike: any = async (url: string) => {
    if (url === "/api/project/plans") {
      return response({ project_id: "bid-42", plans: [{ name: "A101.pdf" }] });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike);

  assert.deepEqual(await store.listSheets(), [{
    name: "A101.pdf",
    sha256: digest,
    document_revision: 4,
  }]);
});

test("manual takeoff revisions are mirrored with the project snapshot scope", async () => {
  const snapshots = new Map<string, any>();
  const uploaded: any[] = [];
  const base: any = {
    saveSnapshot: async (label: string, payload: any, project: string) => {
      const record = { id: "snap_abc123", ts: 123, label, project, payload };
      snapshots.set(record.id, record);
      return { id: record.id, ts: record.ts };
    },
    getSnapshot: async (id: string, project: string) => snapshots.get(id)?.project === project ? snapshots.get(id) : null,
    listSnapshots: async () => [],
    putSnapshot: async (record: any) => { snapshots.set(record.id, record); },
    deleteSnapshot: async (id: string) => { snapshots.delete(id); },
  };
  const fetchLike: any = async (url: string, init: any = {}) => {
    if (url === "/api/project/revisions") return response({ project_id: "bid-42", revisions: [] });
    if (init.method === "PUT") {
      uploaded.push(JSON.parse(init.body));
      return response(uploaded.at(-1), 201);
    }
    return response({ removed: true });
  };
  const store = createGrumpProjectStore(base, "bid-42", fetchLike, "bid-42");
  await store.saveSnapshot("Avant addenda", empty);
  assert.equal(uploaded[0].id, "snap_abc123");
  assert.equal(uploaded[0].project, "bid-42");
});
