import { expect, it } from 'vitest';
import { appCommands, matchesCommand } from './commandMenu';

const ready = { loading: false, error: null, selecting: false, entries: true, redistributionAvailable: true, syncAction: 'Refresh data' };

it('keeps stable groups, useful aliases and disabled matches', () => {
  const commands = appCommands({ ...ready, entries: false });
  expect(commands.map(command => command.group)).toEqual(['Actions', 'Actions', 'Actions', 'Navigation', 'Navigation', 'Navigation', 'Sync']);
  expect(commands.filter(command => matchesCommand(command, '  TRANSFER '))).toMatchObject([{ id: 'redistribute', reason: 'Go to Entries to redistribute funds.' }]);
  expect(commands.filter(command => matchesCommand(command, 'nothing matches'))).toEqual([]);
});

it.each([
  [{ loading: true }, 'Wait for data to load.'],
  [{ error: 'Failed' }, 'Resolve the data loading error first.'],
  [{ selecting: true }, 'Exit bulk selection to add an Entry.'],
])('explains the existing Add guard: %j', (state, reason) => {
  expect(appCommands({ ...ready, ...state })[0].reason).toBe(reason);
});

it('uses the status owner label without prohibiting busy/waiting sync or bulk redistribution', () => {
  for (const syncAction of ['Sync now', 'Refresh data', 'Refresh demo']) {
    const commands = appCommands({ ...ready, selecting: true, syncAction });
    expect(commands.find(command => command.id === 'sync')).toMatchObject({ label: syncAction, reason: '' });
    expect(commands.find(command => command.id === 'redistribute')?.reason).toBe('');
  }
  expect(appCommands({ ...ready, redistributionAvailable: false })[1].reason).toBe('Wait for Entries to load.');
});
