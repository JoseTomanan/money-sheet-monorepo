import { isCategory } from "./categories";

// The template places hidden incoming/outgoing detail columns after each
// visible Category net-total column. They explain the formula but are not
// budgets themselves; the preceding Category cell is the canonical total.
const DETAIL_HEADERS = new Set(["I", "O"]);

/**
 * Parses MASTER's fixed header and formula rows. MASTER remains formula-owned;
 * this only turns its values into the API's existing MasterRow shape.
 */
export function parseMasterRows(headerRow: unknown[], dataRow: unknown[]): MasterRow {
  let onHand = 0;
  const budgets: Record<string, number> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i]).trim().toUpperCase();
    if (header === "ON HAND") {
      onHand = Number(dataRow[i]) || 0;
    } else if (DETAIL_HEADERS.has(header)) {
      continue;
    } else if (header !== "") {
      if (!isCategory(header)) {
        throw new Error(`Unknown MASTER budget header: ${header}`);
      }
      budgets[header] = Number(dataRow[i]) || 0;
    }
  }

  return { onHand, budgets };
}
