const API_SECRET_PROPERTY = "API_SECRET";
const API_SECRET_SPREADSHEET_ID_PROPERTY = "API_SECRET_SPREADSHEET_ID";

function storeApiSecret(
  props: GoogleAppsScript.Properties.Properties,
  spreadsheetId: string,
  secret: string
): void {
  props.setProperties({
    [API_SECRET_PROPERTY]: secret,
    [API_SECRET_SPREADSHEET_ID_PROPERTY]: spreadsheetId,
  });
}

export function bootstrapApiSecret(
  props: GoogleAppsScript.Properties.Properties,
  spreadsheetId: string,
  generateSecret: () => string
): string {
  const existingSecret = props.getProperty(API_SECRET_PROPERTY);
  const existingSpreadsheetId = props.getProperty(
    API_SECRET_SPREADSHEET_ID_PROPERTY
  );
  if (existingSecret && existingSpreadsheetId === spreadsheetId) {
    return existingSecret;
  }
  if (existingSecret && existingSpreadsheetId === null) {
    props.setProperty(API_SECRET_SPREADSHEET_ID_PROPERTY, spreadsheetId);
    return existingSecret;
  }

  const secret = generateSecret();
  storeApiSecret(props, spreadsheetId, secret);
  return secret;
}

export function rotateApiSecret(
  props: GoogleAppsScript.Properties.Properties,
  ui: GoogleAppsScript.Base.Ui,
  spreadsheetId: string,
  generateSecret: () => string
): string | null {
  const response = ui.alert(
    "Rotate API secret? Existing app Connections will stop working.",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return null;

  const secret = generateSecret();
  storeApiSecret(props, spreadsheetId, secret);
  return secret;
}

export function buildConnectionDetailsHtml(secret: string): string {
  const escapedSecret = secret
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html>
  <head>
    <base target="_top">
    <style>
      body { color: #202124; font: 14px Arial, sans-serif; margin: 24px; }
      p { line-height: 1.5; margin: 0 0 16px; }
      label { display: block; font-weight: 600; margin-bottom: 6px; }
      .row { display: flex; gap: 8px; }
      input { border: 1px solid #dadce0; border-radius: 4px; flex: 1; padding: 9px; }
      button { background: #1a73e8; border: 0; border-radius: 4px; color: white; cursor: pointer; padding: 0 16px; }
      #status { color: #5f6368; font-size: 12px; margin-top: 8px; min-height: 15px; }
    </style>
  </head>
  <body>
    <p>Copy this secret into the Money Sheet Connection settings. Keep it private.</p>
    <label for="secret">API secret</label>
    <div class="row">
      <input id="secret" value="${escapedSecret}" readonly onclick="this.select()">
      <button type="button" onclick="copySecret()">Copy secret</button>
    </div>
    <div id="status" role="status"></div>
    <script>
      async function copySecret() {
        const field = document.getElementById('secret');
        field.select();
        try {
          await navigator.clipboard.writeText(field.value);
          document.getElementById('status').textContent = 'Copied.';
        } catch (_) {
          document.getElementById('status').textContent = 'Press Ctrl+C or Cmd+C to copy.';
        }
      }
    </script>
  </body>
</html>`;
}
