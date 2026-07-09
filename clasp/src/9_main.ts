// HTTP entry points. All routing, auth, payload validation, and the response
// envelope live in the pure `dispatch` module (src/lib/dispatch.ts) so they can
// be unit-tested without a GAS deployment. These functions only build the
// dependency bundle (the GAS-API bound side) and serialize the response.

function apiDeps(): DispatchDeps {
  return {
    secret: PropertiesService.getScriptProperties().getProperty("API_SECRET") ?? "",
    getCategories: () => getCategories(),
    getMaster: () => getMaster(),
    getEntries: () => getEntries(),
    getConfig: () => getConfig(),
    getEntryById: (id) => getEntries().find((e) => e.id === id) ?? null,
    addEntry: (payload) => addEntry(payload),
    addEntries: (payloads) => addEntries(payloads),
    updateEntry: (id, patch) => updateEntry(id, patch),
    deleteEntry: (id) => deleteEntry(id),
  };
}

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  const res = dispatch(
    { action: e.parameter.action, secret: e.parameter.secret, body: e.parameter },
    apiDeps()
  );
  return apiJson(res);
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(e.postData.contents) as Record<string, unknown>;
  } catch (err) {
    const message = String(err);
    return apiJson({ ok: false, error: message, code: "internal", message });
  }
  const action = String(body.action ?? "");
  const secret = body.secret === undefined ? undefined : String(body.secret);
  return apiJson(dispatch({ action, secret, body }, apiDeps()));
}

function apiJson(obj: object): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
