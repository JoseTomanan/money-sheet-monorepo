export function runSetup(
  props: GoogleAppsScript.Properties.Properties,
  ui: GoogleAppsScript.Base.Ui,
  generateSecret: () => string
): void {
  const existing = props.getProperty("API_SECRET");
  if (existing !== null) {
    const response = ui.alert(
      "API_SECRET already exists. Regenerate and overwrite?",
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }
  const secret = generateSecret();
  props.setProperty("API_SECRET", secret);
  ui.alert(secret);
}
