function getCategories(): CategoryMap {
  const sh = getCategoriesSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {};

  // B = Subcategory, C = Category (merged cell — getValues() returns value only in first cell of merge)
  const data = sh.getRange(2, 2, lastRow - 1, 2).getValues();
  const map: CategoryMap = {};
  let currentCategory = "";

  for (const row of data) {
    const subcategory = String(row[0]).trim();
    const categoryCell = String(row[1]).trim();
    if (categoryCell !== "") currentCategory = categoryCell;
    if (subcategory === "" || currentCategory === "") continue;
    if (!map[currentCategory]) map[currentCategory] = [];
    map[currentCategory].push(subcategory);
  }

  return map;
}

function getSubcategoryBreakdown(): SubcategoryBreakdown {
  const rows = getIODataRows();
  const breakdown: SubcategoryBreakdown = {};

  for (const row of rows) {
    const direction = String(row[4]); // F column (index 4 in B-based slice)
    if (direction !== "O") continue;
    const tag = String(row[1]); // C column
    const amount = Number(row[5]) || 0;
    breakdown[tag] = (breakdown[tag] ?? 0) + amount;
  }

  return breakdown;
}
