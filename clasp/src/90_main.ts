function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  const action = e.parameter.action;
  try {
    if (action === "getEntries") return apiJson({ entries: getEntries() });
    if (action === "getMaster") return apiJson({ master: getMaster() });
    if (action === "getCategories") return apiJson({ categories: getCategories() });
    if (action === "getSubcategoryBreakdown") return apiJson({ breakdown: getSubcategoryBreakdown() });
    return apiJson({ error: "unknown action" });
  } catch (err) {
    return apiJson({ error: String(err) });
  }
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    const body = JSON.parse(e.postData.contents);
    const action: string = body.action;

    // Read-only actions — no secret required (POST avoids CORS preflight issues)
    if (action === "getEntries") return apiJson({ entries: getEntries() });
    if (action === "getMaster") return apiJson({ master: getMaster() });
    if (action === "getCategories") return apiJson({ categories: getCategories() });
    if (action === "getSubcategoryBreakdown") return apiJson({ breakdown: getSubcategoryBreakdown() });

    // Write actions — shared-secret auth required
    const secret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
    if (!secret || body.secret !== secret) {
      return apiJson({ error: "unauthorized" });
    }

    if (action === "addEntry") {
      const entry = addEntry({
        date: String(body.date),
        tag: String(body.tag),
        description: String(body.description || ""),
        direction: (body.direction === "I" ? "I" : "O") as Direction,
        amount: Number(body.amount) || 0,
      });
      return apiJson({ ok: true, entry });
    }

    if (action === "updateEntry") {
      const patch: UpdateEntryPatch = {};
      if (body.date !== undefined) patch.date = String(body.date);
      if (body.tag !== undefined) patch.tag = String(body.tag);
      if (body.description !== undefined) patch.description = String(body.description);
      if (body.direction !== undefined) patch.direction = (body.direction === "I" ? "I" : "O") as Direction;
      if (body.amount !== undefined) patch.amount = Number(body.amount);
      updateEntry(Number(body.id), patch);
      return apiJson({ ok: true });
    }

    if (action === "deleteEntry") {
      deleteEntry(Number(body.id));
      return apiJson({ ok: true });
    }

    return apiJson({ error: "unknown action" });
  } catch (err) {
    return apiJson({ error: String(err) });
  }
}

function apiJson(obj: object): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
