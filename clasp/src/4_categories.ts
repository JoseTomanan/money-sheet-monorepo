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
