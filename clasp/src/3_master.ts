function getMaster(): MasterRow {
  const sh = getMasterSheet();
  if (sh.getLastRow() < 3) return { onHand: 0, budgets: {} };

  // MASTER sheet: row 2 = headers, row 3 = single formula row (never use getLastRow()
  // for data — extra formula rows below would push it past the real data row)
  const headerRow = sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0];
  const dataRow = sh.getRange(3, 1, 1, sh.getLastColumn()).getValues()[0];

  return parseMasterRows(headerRow, dataRow);
}
