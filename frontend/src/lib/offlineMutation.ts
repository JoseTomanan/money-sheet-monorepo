// Compatibility facade: the Offline Queue owns persistence and mutation lifecycle.
export { drain, getLocalEntryIds, isLocalEntryId, isQueuedAddId, localEntryIdsFromQueue,
  submitAdd, submitAddBatch, submitDelete, submitEdit } from './queue';
export type { AddOutcome, AddBatchOutcome, MutateOutcome, DrainItemResult } from './queue';
