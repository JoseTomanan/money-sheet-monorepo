function getMaster(): MasterRow {
  const sh = getMasterSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 1) return { onHand: 0, budgets: {} };

  // Read header row to find column positions by name
  const headerRow = sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0];
  const dataRow = sh.getRange(lastRow, 1, 1, sh.getLastColumn()).getValues()[0];

  let onHand = 0;
  const budgets: Record<string, number> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i]).trim().toUpperCase();
    if (header === "ON HAND") {
      onHand = Number(dataRow[i]) || 0;
    } else if (header !== "" && header !== "ON HAND") {
      // Any non-empty header that isn't ON HAND is treated as a Category budget column
      const categories = ["HOUSING", "FOOD", "TRANSIT", "HEALTH", "FINANCE", "LIFESTYLE", "MISC"];
      if (categories.includes(header)) {
        budgets[header] = Number(dataRow[i]) || 0;
      }
    }
  }

  return { onHand, budgets };
}
