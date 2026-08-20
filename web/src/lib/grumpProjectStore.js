// Durable local-project mirror used only inside the loopback GRUMP shell.
// IndexedDB stays the fast Canvas cache; the gateway writes the portable copy.

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
const TAKEOFF_SCHEMA = "opentakeoff.takeoff_canvas.v1";

export function grumpProjectIdFromUrl(locationLike = window.location) {
  try {
    if (!LOOPBACK.has(locationLike.hostname)) return "";
    const params = new URLSearchParams(locationLike.search || "");
    if (params.get("grumpBridge") !== "1") return "";
    return params.get("grumpProject") || "";
  } catch {
    return "";
  }
}

export function grumpProjectApiBaseFromUrl(locationLike = window.location) {
  try {
    if (!LOOPBACK.has(locationLike.hostname)) return "/api/project";
    const params = new URLSearchParams(locationLike.search || "");
    const projectId = grumpProjectIdFromUrl(locationLike);
    if (!projectId) return "/api/project";
    const value = params.get("grumpApiBase") || "/api/project";
    const expected = `/projects/${projectId}/api/project`;
    return value === expected ? value : "/api/project";
  } catch {
    return "/api/project";
  }
}

async function responseError(response, fallback) {
  try {
    const body = await response.json();
    return new Error(body?.message || body?.error || fallback);
  } catch {
    return new Error(fallback);
  }
}

export function createGrumpProjectStore(
  base,
  projectId,
  fetchLike = globalThis.fetch,
  snapshotScope = projectId,
  apiBase = "/api/project",
) {
  if (!projectId || typeof fetchLike !== "function") return base;
  const options = { credentials: "same-origin" };
  let plansHydration = null;
  let annotationsHydration = null;
  let revisionsHydration = null;
  let annotationsSaveChain = Promise.resolve();

  const projectUrl = (suffix = "") => `${apiBase}${suffix}`;
  const planUrl = (name) => projectUrl(`/plans/${encodeURIComponent(name)}`);
  const revisionUrl = (id) => projectUrl(`/revisions/${encodeURIComponent(id)}`);

  async function putPlan(name, bytes) {
    const response = await fetchLike(planUrl(name), {
      ...options,
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: bytes,
    });
    if (!response.ok) throw await responseError(response, `Couldn't mirror ${name} to the project folder.`);
    return response.json();
  }

  async function hydratePlans() {
    if (plansHydration) return plansHydration;
    plansHydration = (async () => {
      const response = await fetchLike(projectUrl("/plans"), options);
      if (!response.ok) throw await responseError(response, "Couldn't list project plans on disk.");
      const body = await response.json();
      if (body?.project_id !== projectId || !Array.isArray(body?.plans)) {
        throw new Error("The gateway returned plans for a different project.");
      }
      const diskNames = new Set(body.plans.map((row) => row?.name).filter((name) => typeof name === "string"));
      const localRows = await base.listSheets();
      const localNames = new Set(localRows.map((row) => row.name));

      // Existing browser-only projects are copied to disk on their first launch.
      for (const name of localNames) {
        if (!diskNames.has(name)) await putPlan(name, await base.loadPdfData(name));
      }
      // A cleared/new Chrome profile is rebuilt from the durable project folder.
      for (const name of diskNames) {
        if (localNames.has(name)) continue;
        const pdf = await fetchLike(planUrl(name), options);
        if (!pdf.ok) throw await responseError(pdf, `Couldn't restore ${name} from the project folder.`);
        const bytes = await pdf.arrayBuffer();
        await base.addPdf(new File([bytes], name, { type: "application/pdf" }));
      }
    })();
    try {
      await plansHydration;
    } catch (error) {
      plansHydration = null;
      throw error;
    }
  }

  async function loadAnnotations() {
    if (annotationsHydration) return annotationsHydration;
    annotationsHydration = (async () => {
      const response = await fetchLike(projectUrl("/takeoff"), options);
      if (response.status === 404) {
        const local = await base.loadAnnotations();
        await saveAnnotations(local);
        return local;
      }
      if (!response.ok) throw await responseError(response, "Couldn't load the project takeoff from disk.");
      const durable = await response.json();
      await base.saveAnnotations(durable);
      return durable;
    })();
    try {
      return await annotationsHydration;
    } catch (error) {
      annotationsHydration = null;
      throw error;
    }
  }

  async function putAnnotations(persisted) {
    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response;
      try {
        response = await fetchLike(projectUrl("/takeoff"), {
          ...options,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(persisted),
        });
      } catch (error) {
        lastError = error;
        continue;
      }
      if (response.ok) return;
      const error = await responseError(response, "Couldn't mirror the takeoff to the project folder.");
      if (response.status < 500 && response.status !== 408 && response.status !== 429) throw error;
      lastError = error;
    }
    throw lastError || new Error("Couldn't mirror the takeoff to the project folder.");
  }

  function saveAnnotations(payload) {
    // The plain IndexedDB store injects its schema while writing, but the
    // gateway receives the object before that local normalization. Normalize
    // once at this boundary so browser cache and durable project JSON persist
    // the exact same takeoff document.
    const persisted = { ...payload, schema: TAKEOFF_SCHEMA };
    const save = annotationsSaveChain.then(async () => {
      // The project file is canonical. Update the fast browser cache only
      // after the durable write succeeds so a reload can never roll back a
      // change that appeared to have been saved locally.
      await putAnnotations(persisted);
      await base.saveAnnotations(persisted);
    });
    annotationsSaveChain = save.catch(() => {});
    return save;
  }

  async function putRevision(record) {
    const response = await fetchLike(revisionUrl(record.id), {
      ...options,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!response.ok) throw await responseError(response, "Couldn't mirror the takeoff revision to disk.");
  }

  async function hydrateRevisions() {
    if (revisionsHydration) return revisionsHydration;
    revisionsHydration = (async () => {
      const response = await fetchLike(projectUrl("/revisions"), options);
      if (!response.ok) throw await responseError(response, "Couldn't list takeoff revisions on disk.");
      const body = await response.json();
      if (body?.project_id !== projectId || !Array.isArray(body?.revisions)) {
        throw new Error("The gateway returned revisions for a different project.");
      }
      const diskIds = new Set(body.revisions.map((row) => row?.id).filter((id) => typeof id === "string"));
      const localRows = await base.listSnapshots(snapshotScope);
      const localIds = new Set(localRows.map((row) => row.id));
      for (const id of localIds) {
        if (diskIds.has(id)) continue;
        const record = await base.getSnapshot(id, snapshotScope);
        if (record) await putRevision(record);
      }
      for (const id of diskIds) {
        if (localIds.has(id)) continue;
        const revision = await fetchLike(revisionUrl(id), options);
        if (!revision.ok) throw await responseError(revision, "Couldn't restore a takeoff revision from disk.");
        const record = await revision.json();
        await base.putSnapshot({ ...record, project: snapshotScope });
      }
    })();
    try {
      await revisionsHydration;
    } catch (error) {
      revisionsHydration = null;
      throw error;
    }
  }

  return {
    ...base,
    async listSheets() {
      await hydratePlans();
      const rows = await base.listSheets();
      return Promise.all(rows.map(async (row) => {
        const revisions = typeof base.listPdfRevisions === "function"
          ? await base.listPdfRevisions(row.name)
          : [];
        const current = revisions.find((revision) => revision.current) || revisions[0];
        return {
          ...row,
          sha256: typeof current?.hash === "string" ? current.hash : null,
          document_revision: Number.isInteger(current?.rev) ? current.rev : null,
        };
      }));
    },
    async loadPdfData(name) {
      await hydratePlans();
      return base.loadPdfData(name);
    },
    async addPdf(file) {
      const result = await base.addPdf(file);
      await putPlan(file.name, new Uint8Array(await file.arrayBuffer()));
      return result;
    },
    async removePdf(name) {
      await base.removePdf(name);
      const response = await fetchLike(planUrl(name), { ...options, method: "DELETE" });
      if (!response.ok) throw await responseError(response, `Couldn't remove ${name} from the project folder.`);
    },
    loadAnnotations,
    saveAnnotations,
    async saveSnapshot(label, payload) {
      const meta = await base.saveSnapshot(label, payload, snapshotScope);
      const record = await base.getSnapshot(meta.id, snapshotScope);
      if (record) await putRevision(record);
      return meta;
    },
    async listSnapshots() {
      await hydrateRevisions();
      return base.listSnapshots(snapshotScope);
    },
    async getSnapshot(id) {
      await hydrateRevisions();
      return base.getSnapshot(id, snapshotScope);
    },
    async putSnapshot(record) {
      const scoped = { ...record, project: snapshotScope };
      await base.putSnapshot(scoped);
      await putRevision(scoped);
    },
    async deleteSnapshot(id) {
      await base.deleteSnapshot(id);
      const response = await fetchLike(revisionUrl(id), { ...options, method: "DELETE" });
      if (!response.ok) throw await responseError(response, "Couldn't remove the takeoff revision from disk.");
    },
  };
}
