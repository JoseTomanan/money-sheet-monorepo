import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import EntrySheet from './EntrySheet.svelte';
import type { Entry, EntryMutation, EntrySubmission, GatewayAdapter } from '../../lib/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let store: typeof import('../../lib/store.svelte')['store'];
let adapter: GatewayAdapter;
let server: Entry[];
const original: Entry = {
  id: 1, row: 3, date: '2026-10-11', tag: 'Dining', mainCategory: 'FOOD',
  description: 'Original', direction: 'O', amount: 10,
};

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://submission.example/exec', apiSecret: 'test' }));
  vi.resetModules();
  server = [{ ...original }];
  adapter = {
    getEntries: async () => server.map(entry => ({ ...entry })),
    getMaster: async () => ({ onHand: 100, budgets: { FOOD: 100 } }),
    getCategories: async () => ({ FOOD: ['Dining', 'Groceries'] }),
    getConfig: async () => ({ currency: '$' }),
    getStats: async () => ({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] }),
    addEntry: vi.fn(), addEntries: vi.fn(), updateEntry: vi.fn(), deleteEntry: vi.fn(), validateConnection: vi.fn(),
  };
  (await import('../../lib/api')).setAdapter(adapter);
  store = (await import('../../lib/store.svelte')).store;
  await store.refreshAll();
});

afterEach(() => { store?.dispose(); vi.restoreAllMocks(); });

async function draft(mode: 'Add' | 'Split' | 'Edit') {
  const submissions: EntrySubmission[] = [];
  const onclose = vi.fn();
  const onsave = vi.fn((mutation: EntryMutation) => {
    const submission = mutation.type === 'edit'
      ? store.submitUpdateEntry(mutation.id, mutation.patch)
      : store.submitAddEntry(mutation.payload);
    submissions.push(submission);
    return submission;
  });
  const view = render(EntrySheet, {
    open: true, categories: store.categories, entry: mode === 'Edit' ? original : null, onclose, onsave,
  });
  if (mode !== 'Edit') {
    await fireEvent.click(view.getByRole('button', { name: /^FOOD$/ }));
    await fireEvent.click(view.getByRole('button', { name: /^Dining$/ }));
  }
  await fireEvent.input(view.getAllByPlaceholderText('0.00')[0], { target: { value: '42' } });
  await fireEvent.input(view.getByPlaceholderText('e.g. lunch at canteen'), { target: { value: 'Retained draft' } });
  if (mode === 'Split') {
    await fireEvent.click(view.getByText('Add leg'));
    await fireEvent.click(view.getAllByRole('button', { name: /^FOOD$/ })[1]);
    await fireEvent.click(view.getAllByRole('button', { name: /^Groceries$/ })[1]);
    await fireEvent.input(view.getAllByPlaceholderText('0.00')[1], { target: { value: '8' } });
  }
  return { ...view, submissions, onclose, onsave };
}

it.each(['Add', 'Split', 'Edit'] as const)('%s retries a refused draft, closes before delivery, and leaves later rollback to the store', async mode => {
  const delivery = deferred<Entry>();
  const batch = deferred<Entry[]>();
  const edit = deferred<void>();
  adapter.addEntry = vi.fn(() => delivery.promise);
  adapter.addEntries = vi.fn(() => batch.promise);
  adapter.updateEntry = vi.fn(() => edit.promise);
  const view = await draft(mode);
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  await fireEvent.click(view.getByRole('button', { name: 'Save' }));
  expect(view.submissions[0].accepted).toBe(false);
  expect(await view.submissions[0].completion).toBe(false);
  expect(view.getByRole('alert')).toHaveTextContent("Couldn't write pending saves on this device");
  expect(view.onclose).not.toHaveBeenCalled();
  expect(view.getAllByPlaceholderText('0.00')[0]).toHaveValue('42');
  if (mode === 'Split') expect(view.getAllByPlaceholderText('0.00')[1]).toHaveValue('8');
  expect(view.getByPlaceholderText('e.g. lunch at canteen')).toHaveValue('Retained draft');
  expect(adapter.addEntry).not.toHaveBeenCalled();
  expect(adapter.addEntries).not.toHaveBeenCalled();
  expect(adapter.updateEntry).not.toHaveBeenCalled();
  expect(store.entries).toEqual([original]);

  storage.mockRestore();
  await fireEvent.click(view.getByRole('button', { name: 'Save' }));
  expect(view.submissions[1].accepted).toBe(true);
  expect(view.onclose).toHaveBeenCalledOnce();
  await fireEvent.click(view.getByRole('button', { name: 'Saving…' }));
  expect(view.onsave).toHaveBeenCalledTimes(2);
  expect(store.entries.some(entry => entry.description === 'Retained draft')).toBe(true);
  const queue = (await import('../../lib/queue')).readQueue();
  expect(queue).toHaveLength(1);
  expect(queue[0].op).toBe(mode === 'Edit' ? 'edit' : mode === 'Split' ? 'addBatch' : 'add');
  if (mode === 'Split') expect(adapter.addEntries).toHaveBeenCalledWith([
    expect.objectContaining({ tag: 'Dining', amount: 42, description: 'Retained draft' }),
    expect.objectContaining({ tag: 'Groceries', amount: 8, description: '^^' }),
  ], expect.any(String));
  else if (mode === 'Edit') expect(adapter.updateEntry).toHaveBeenCalledWith(original.id, expect.objectContaining({ amount: 42 }));
  view.unmount();
  const rejection = new Error('Save rejected');
  if (mode === 'Split') batch.reject(rejection);
  else if (mode === 'Edit') edit.reject(rejection);
  else delivery.reject(rejection);
  expect(await view.submissions[1].completion).toBe(false);
  await waitFor(() => expect(store.entries).toEqual([original]));
  expect((await import('../../lib/toast.svelte')).toast.msg).toBe('Save rejected');
  expect((await import('../../lib/queue')).readQueue()).toEqual([]);
  expect(view.onclose).toHaveBeenCalledOnce();
});

it.each(['Add', 'Split', 'Edit'] as const)('%s retains ambiguous delivery after closing and replays the admitted intent', async mode => {
  const delivery = deferred<Entry>();
  const batch = deferred<Entry[]>();
  const edit = deferred<void>();
  adapter.addEntry = vi.fn(() => delivery.promise);
  adapter.addEntries = vi.fn(() => batch.promise);
  adapter.updateEntry = vi.fn(() => edit.promise);
  const view = await draft(mode);
  await fireEvent.click(view.getByRole('button', { name: 'Save' }));
  expect(view.submissions[0].accepted).toBe(true);
  expect(view.onclose).toHaveBeenCalledOnce();
  const { readQueue } = await import('../../lib/queue');
  const admitted = structuredClone(readQueue());
  view.unmount();

  const { ConnectionError } = await import('../../lib/api');
  const timeout = new ConnectionError('Delivery timed out');
  if (mode === 'Split') batch.reject(timeout);
  else if (mode === 'Edit') edit.reject(timeout);
  else delivery.reject(timeout);
  // true means retained for replay here, not confirmed in Sheets.
  expect(await view.submissions[0].completion).toBe(true);
  expect(readQueue()).toEqual(admitted);
  expect(store.entries.find(entry => entry.description === 'Retained draft')?.amount).toBe(42);
  expect(store.localIds.size).toBe(mode === 'Split' ? 2 : 1);
  expect(store.syncStatus.phase).toBe('waiting');
  if (mode !== 'Edit') {
    const id = store.entries.find(entry => entry.description === 'Retained draft')!.id;
    expect(store.submitUpdateEntry(id, { amount: 999 }).accepted).toBe(false);
    expect(readQueue()).toEqual(admitted);
  }

  const saved = (payload: Parameters<GatewayAdapter['addEntry']>[0]): Entry => {
    const entry = { ...payload, id: server.length + 1, row: server.length + 3, mainCategory: 'FOOD' };
    server.push(entry);
    return entry;
  };
  adapter.addEntry = vi.fn(async payload => saved(payload));
  adapter.addEntries = vi.fn(async payloads => payloads.map(saved));
  adapter.updateEntry = vi.fn(async (id, patch) => {
    server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
  });
  await store.drainQueue();
  expect(readQueue()).toEqual([]);
  expect(store.localIds.size).toBe(0);
  expect(store.entries).toEqual(server);
  const item = admitted[0];
  if (item.op === 'add') expect(adapter.addEntry).toHaveBeenCalledWith(item.payload, item.mutationId);
  else if (item.op === 'addBatch') expect(adapter.addEntries).toHaveBeenCalledWith(item.payloads, item.mutationId);
  else if (item.op === 'edit') expect(adapter.updateEntry).toHaveBeenCalledWith(item.id, item.patch);
  expect(view.onclose).toHaveBeenCalledOnce();
});
