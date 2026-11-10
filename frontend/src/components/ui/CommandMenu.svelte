<script lang="ts">
  import { Command, Dialog } from 'bits-ui';
  import { guardEscape, isMac } from '$lib/keyboard';
  import { matchesCommand, type AppCommand, type CommandId } from '$lib/commandMenu';

  let { open, commands, opener, onclose, onselect }: {
    open: boolean;
    commands: AppCommand[];
    opener: HTMLElement | null;
    onclose: () => void;
    onselect: (id: CommandId) => boolean;
  } = $props();

  let search = $state('');
  let input = $state<HTMLInputElement | null>(null);
  let selected: CommandId | null = null;
  let activating = false;
  const groups = ['Actions', 'Navigation', 'Sync'] as const;
  const matches = $derived(commands.filter(command => matchesCommand(command, search)));

  function restoreFocus() {
    const target = opener?.isConnected && opener !== document.body && !opener.matches(':disabled')
      ? opener : document.querySelector<HTMLElement>('[aria-label="Open command menu"], [data-app-navigation][aria-current="page"]');
    target?.focus();
  }

  function select(id: CommandId) {
    if (!open || activating || commands.find(command => command.id === id)?.reason !== '') return;
    activating = true;
    selected = id;
    onclose();
  }

  function guardActivation(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
</script>

<Dialog.Root {open} onOpenChange={(value) => { if (!value) onclose(); }}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[610] bg-[var(--overlay-bg)]" />
    <Dialog.Content
      onEscapeKeydown={guardEscape}
      onkeydowncapture={guardActivation}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        search = ''; selected = null; activating = false;
        input?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const command = selected;
        selected = null;
        // Hand off only after the palette's focus scope has released ownership.
        // A sheet then receives its own initial focus without restoration races.
        // Establish a surviving opener before opening a destination sheet so that
        // its own eventual dismissal also restores focus to a real control.
        restoreFocus();
        if (command) onselect(command);
      }}
      class="fixed left-1/2 top-[min(12dvh,5rem)] z-[611] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-card)] font-sans"
    >
      <div class="flex items-center justify-between gap-3 px-4 pt-3">
        <Dialog.Title class="font-display text-lg font-semibold">Command menu</Dialog.Title>
        <Dialog.Close aria-label="Close command menu" class="min-h-11 min-w-11 rounded-[var(--radius-sm)] border-0 bg-transparent text-muted-foreground cursor-pointer hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mx-auto"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </Dialog.Close>
      </div>
      <Dialog.Description class="px-4 pb-3 text-xs text-muted-foreground">Find an action or destination. {isMac() ? 'Cmd' : 'Ctrl'}+K opens this menu.</Dialog.Description>
      <Command.Root label="App commands" shouldFilter={false} vimBindings={false}>
        <Command.Input bind:ref={input} bind:value={search} aria-label="Search commands" placeholder="Search commands…" class="mx-4 mb-3 min-h-11 w-[calc(100%-2rem)] rounded-[var(--radius-sm)] border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30" />
        <Command.List class="max-h-[min(60dvh,28rem)] overflow-y-auto border-t border-border px-2 py-2">
          <Command.Viewport>
            {#each groups as group}
              {@const items = matches.filter(command => command.group === group)}
              {#if items.length}
                <Command.Group value={group}>
                  <Command.GroupHeading class="px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground">{group}</Command.GroupHeading>
                  <Command.GroupItems>
                    {#each items as command (command.id)}
                      <Command.Item value={command.id} disabled={!!command.reason} onSelect={() => select(command.id)}
                        aria-label={command.label}
                        aria-describedby={command.reason ? `command-reason-${command.id}` : undefined}
                        class="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-sm cursor-pointer outline-none data-[selected]:bg-muted data-[selected]:ring-1 data-[selected]:ring-inset data-[selected]:ring-accent data-[disabled]:cursor-not-allowed">
                        <span class={command.reason ? 'text-muted-foreground' : 'font-medium'}>{command.label}</span>
                        {#if command.reason}<span id={`command-reason-${command.id}`} class="mt-1 block text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{command.reason}</span>{/if}
                      </Command.Item>
                    {/each}
                  </Command.GroupItems>
                </Command.Group>
              {/if}
            {/each}
            {#if !matches.length}<p role="status" class="px-3 py-8 text-center text-sm text-muted-foreground">No commands found. Try another search.</p>{/if}
          </Command.Viewport>
        </Command.List>
      </Command.Root>
      <p class="border-t border-border px-4 py-3 text-xs text-muted-foreground">↑ ↓ to navigate · Enter to choose · Esc to close</p>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
