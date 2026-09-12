function getCategories(): CategoryMap {
  const sh = getCategoriesSheet();
  const lastRow = sh.getLastRow();
  const firstRow = SHEET_LAYOUT.categories.rows.dataFirst;
  const firstColumn = SHEET_LAYOUT.categories.columns.subcategory;
  if (lastRow < firstRow) return {};

  // B = Subcategory, C = Category (merged cell — getValues() returns value only in first cell of merge)
  const data = sh.getRange(
    firstRow,
    firstColumn,
    lastRow - firstRow + 1,
    rangeWidth(firstColumn, SHEET_LAYOUT.categories.columns.category),
  ).getValues();
  const map: CategoryMap = {};
  let currentCategory = "";

  for (const row of data) {
    const subcategory = String(row[
      columnIndexWithinRange(SHEET_LAYOUT.categories.columns.subcategory, firstColumn)
    ]).trim();
    const categoryCell = String(row[
      columnIndexWithinRange(SHEET_LAYOUT.categories.columns.category, firstColumn)
    ]).trim();
    if (categoryCell !== "") currentCategory = categoryCell;
    if (subcategory === "" || currentCategory === "") continue;
    if (!map[currentCategory]) map[currentCategory] = [];
    map[currentCategory].push(subcategory);
  }

  return map;
}
