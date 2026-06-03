export function runSetup(
  props: GoogleAppsScript.Properties.Properties,
  ui: GoogleAppsScript.Base.Ui,
  generateSecret: () => string
): void {
  const secret = generateSecret();
  props.setProperty("API_SECRET", secret);
  ui.alert(secret);
}
