const ENTRY_ID_HIGH_WATER_PROPERTY = "ENTRY_ID_HIGH_WATER";
const ENTRY_ID_SPREADSHEET_ID_PROPERTY = "ENTRY_ID_SPREADSHEET_ID";

/**
 * Reserves a contiguous Entry-ID block for one spreadsheet.
 *
 * The caller holds the shared document lock, so advancing the durable high-water
 * mark and writing the corresponding Entries are serialized with every other IO
 * mutation. The mark advances before row writes: a failed write may leave a gap,
 * but an assigned ID can never be reused.
 */
export function reserveEntryIdBlock(
  props: GoogleAppsScript.Properties.Properties,
  spreadsheetId: string,
  existingIds: number[],
  count: number,
): number {
  const currentMax = existingIds.length > 0 ? Math.max(...existingIds) : 0;
  const storedSpreadsheetId = props.getProperty(ENTRY_ID_SPREADSHEET_ID_PROPERTY);
  const storedHighWater = Number(props.getProperty(ENTRY_ID_HIGH_WATER_PROPERTY));
  const validStoredHighWater = storedSpreadsheetId === spreadsheetId
    && Number.isInteger(storedHighWater)
    && storedHighWater >= 0
    ? storedHighWater
    : 0;
  const firstId = Math.max(currentMax, validStoredHighWater) + 1;

  props.setProperties({
    [ENTRY_ID_HIGH_WATER_PROPERTY]: String(firstId + count - 1),
    [ENTRY_ID_SPREADSHEET_ID_PROPERTY]: spreadsheetId,
  });

  return firstId;
}
