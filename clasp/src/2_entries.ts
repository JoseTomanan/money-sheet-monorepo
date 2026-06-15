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

    // Date-ordered insertion: scan col B for correct position
    const lastRow = sh.getLastRow();
    let targetRow: number;
    if (lastRow < 2) {
      targetRow = 2;
    } else {
      const colBValues = sh.getRange(2, COL.DATE, lastRow - 1, 1).getValues();
      const dates: (Date | null)[] = colBValues.map((r) => {
        const v = r[0];
        return v instanceof Date ? v : v ? new Date(String(v)) : null;
      });
      const newDate = new Date(payload.date);
      const idx = findInsertionIndex(dates, newDate);
      const sheetRow = 2 + idx;
      if (sheetRow <= lastRow) {
        sh.insertRowBefore(sheetRow);
        targetRow = sheetRow;
      } else {
        targetRow = lastRow + 1;
      }
    }

    sh.getRange(targetRow, COL.DATE).setValue(payload.date);
    sh.getRange(targetRow, COL.TAG).setValue(payload.tag);
    // COL.MAIN_CAT (D) is ARRAYFORMULA-driven — GAS never writes it
    sh.getRange(targetRow, COL.DESC).setValue(payload.description);
    sh.getRange(targetRow, COL.DIR).setValue(payload.direction);
    sh.getRange(targetRow, COL.AMOUNT).setValue(payload.amount);
    sh.getRange(targetRow, COL.ID).setValue(nextId);

    // Read back mainCategory after formula resolves
    SpreadsheetApp.flush();
    const mainCategory = String(sh.getRange(targetRow, COL.MAIN_CAT).getValue());

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
  const lock = LockService.getDocumentLock();
  lock.waitLock(10_000);
  try {
    const sh = getIOSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error(`Entry ${id} not found`);

    const idValues = sh.getRange(2, COL.ID, lastRow - 1, 1).getValues().map((r) => r[0]);
    const targetRow = findRowByEntryId(idValues, id);
    if (targetRow === null) throw new Error(`Entry ${id} not found`);

    if (patch.date !== undefined) sh.getRange(targetRow, COL.DATE).setValue(patch.date);
    if (patch.tag !== undefined) sh.getRange(targetRow, COL.TAG).setValue(patch.tag);
    if (patch.description !== undefined) sh.getRange(targetRow, COL.DESC).setValue(patch.description);
    if (patch.direction !== undefined) sh.getRange(targetRow, COL.DIR).setValue(patch.direction);
    if (patch.amount !== undefined) sh.getRange(targetRow, COL.AMOUNT).setValue(patch.amount);
    // Never touch D (MAIN_CAT) or H (ID)
  } finally {
    lock.releaseLock();
  }
}

function deleteEntry(id: number): void {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10_000);
  try {
    const sh = getIOSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error(`Entry ${id} not found`);

    const idValues = sh.getRange(2, COL.ID, lastRow - 1, 1).getValues().map((r) => r[0]);
    const targetRow = findRowByEntryId(idValues, id);
    if (targetRow === null) throw new Error(`Entry ${id} not found`);

    sh.deleteRow(targetRow);
  } finally {
    lock.releaseLock();
  }
}
