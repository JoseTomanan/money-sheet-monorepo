export const COMMAND_MENU = Symbol('command menu');
export type CommandId = 'add' | 'redistribute' | 'settings' | 'home' | 'entries' | 'summary' | 'sync';
export interface AppCommand {
  id: CommandId;
  group: 'Actions' | 'Navigation' | 'Sync';
  label: string;
  aliases: string[];
  reason: string;
}

/** Presentation only. Action, route, and sync owners still decide their effects. */
export function appCommands(state: {
  loading: boolean;
  error: string | null;
  selecting: boolean;
  entries: boolean;
  redistributionAvailable: boolean;
  syncAction: string;
}): AppCommand[] {
  return [
    { id: 'add', group: 'Actions', label: 'Add Entry', aliases: ['new', 'transaction', 'shift n'],
      reason: state.loading ? 'Wait for data to load.' : state.error ? 'Resolve the data loading error first.' : state.selecting ? 'Exit bulk selection to add an Entry.' : '' },
    { id: 'redistribute', group: 'Actions', label: 'Fund Redistribution', aliases: ['redistribute', 'move', 'transfer', 'budget'],
      reason: !state.entries ? 'Go to Entries to redistribute funds.' : !state.redistributionAvailable ? 'Wait for Entries to load.' : '' },
    { id: 'settings', group: 'Actions', label: 'Settings', aliases: ['connection', 'theme', 'keyboard'], reason: '' },
    { id: 'home', group: 'Navigation', label: 'Home', aliases: ['go', 'overview'], reason: '' },
    { id: 'entries', group: 'Navigation', label: 'Entries', aliases: ['go', 'transactions', 'week'], reason: '' },
    { id: 'summary', group: 'Navigation', label: 'Summary', aliases: ['go', 'budgets', 'statistics'], reason: '' },
    { id: 'sync', group: 'Sync', label: state.syncAction || 'Sync unavailable', aliases: ['retry', 'recover', 'refresh', 'sync'],
      reason: state.syncAction ? '' : 'Sync is currently unavailable.' },
  ];
}

export function matchesCommand(command: AppCommand, query: string): boolean {
  return [command.label, ...command.aliases].join(' ').toLowerCase().includes(query.trim().toLowerCase());
}
