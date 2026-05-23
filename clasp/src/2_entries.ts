function getEntries(): Entry[] {
  const rows = getIODataRows();
  const entries: Entry[] = [];
  for (const row of rows) {
    const id = row[6]; // H column (index 6 in B-based slice)
    if (id === "" || id === null || id === undefined) continue;
    const rawDate = row[0];
    let dateStr: string;
    try {
      // Utilities.formatDate handles Date objects; try/catch avoids instanceof issues in the GAS sandbox
      dateStr = Utilities.formatDate(rawDate as Date, "Asia/Manila", "yyyy-MM-dd");
    } catch {
      dateStr = rawDate ? String(rawDate) : "";
    }
    entries.push({
      id: Number(id),
      date: dateStr,
      tag: String(row[1]),
      mainCategory: String(row[2]),
      description: String(row[3]),
      direction: String(row[4]) as Direction,
      amount: Number(row[5]) || 0,
    });
  }
  return entries;
}

interface AddEntryPayload {
  date: string;
  tag: string;
  description: string;
  direction: Direction;
  amount: number;
}

function addEntry(payload: AddEntryPayload): Entry {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10_000);
  try {
  const sh = getIOSheet();
  const existing = getEntries();
  const existingIds = new Set(existing.map((e) => e.id));
  let nextId = existing.length > 0 ? Math.max(...existing.map((e) => e.id)) + 1 : 1;
  while (existingIds.has(nextId)) nextId++;

  const newRow = sh.getLastRow() + 1;
  sh.getRange(newRow, COL.DATE).setValue(payload.date);
  sh.getRange(newRow, COL.TAG).setValue(payload.tag);
  // COL.MAIN_CAT (D) is formula-driven — GAS never writes it
  sh.getRange(newRow, COL.DESC).setValue(payload.description);
  sh.getRange(newRow, COL.DIR).setValue(payload.direction);
  sh.getRange(newRow, COL.AMOUNT).setValue(payload.amount);
  sh.getRange(newRow, COL.ID).setValue(nextId);

  // Read back mainCategory after formula resolves
  SpreadsheetApp.flush();
  const mainCategory = String(sh.getRange(newRow, COL.MAIN_CAT).getValue());

  return {
    id: nextId,
    date: payload.date,
    tag: payload.tag,
    mainCategory,
    description: payload.description,
    direction: payload.direction,
    amount: payload.amount,
  };
  } finally {
    lock.releaseLock();
  }
}

interface UpdateEntryPatch {
  date?: string;
  tag?: string;
  description?: string;
  direction?: Direction;
  amount?: number;
}

function updateEntry(id: number, patch: UpdateEntryPatch): void {
  const sh = getIOSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error(`Entry ${id} not found`);

  const ids = sh.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === id) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) throw new Error(`Entry ${id} not found`);

  if (patch.date !== undefined) sh.getRange(targetRow, COL.DATE).setValue(patch.date);
  if (patch.tag !== undefined) sh.getRange(targetRow, COL.TAG).setValue(patch.tag);
  if (patch.description !== undefined) sh.getRange(targetRow, COL.DESC).setValue(patch.description);
  if (patch.direction !== undefined) sh.getRange(targetRow, COL.DIR).setValue(patch.direction);
  if (patch.amount !== undefined) sh.getRange(targetRow, COL.AMOUNT).setValue(patch.amount);
  // Never touch D (MAIN_CAT) or H (ID)
}

function deleteEntry(id: number): void {
  const sh = getIOSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error(`Entry ${id} not found`);

  const ids = sh.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === id) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) throw new Error(`Entry ${id} not found`);

  sh.deleteRow(targetRow);
}
