<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { isMac, isEditable, openOverlays, primaryModifier, guardEscape, type KeyboardContext } from '$lib/keyboard';
  import { keyboardPreferences } from '$lib/keyboardPreferences.svelte';
  import KeyboardPreference from '../settings/KeyboardPreference.svelte';

  let { context }: { context: KeyboardContext } = $props();
  let open = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);
  const modifier = isMac() ? 'Cmd' : 'Ctrl';
  const page = $derived(!['entry', 'settings'].includes(context));
  function consumeSave(event: KeyboardEvent) {
    if (open && event.key === 'Enter' && primaryModifier(event)) { event.preventDefault(); event.stopPropagation(); }
  }
  function showHelp(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.key !== '?' || isEditable(event.target) || !keyboardPreferences.enabled || open) return;
    const overlay = openOverlays().at(-1);
    if (overlay && !overlay.contains(trigger)) return;
    event.preventDefault();
    open = true;
  }
</script>

<svelte:window onkeydown={showHelp} />

<Dialog.Root bind:open>
  <Dialog.Trigger bind:ref={trigger} onkeydown={consumeSave} aria-label="Keyboard shortcuts" title="Keyboard shortcuts"
    class="min-h-11 min-w-11 flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-0 bg-transparent px-2 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8 lg:min-w-8">?</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[610] bg-[var(--overlay-bg)]" />
    <Dialog.Content onEscapeKeydown={guardEscape} onkeydowncapture={consumeSave} class="fixed left-1/2 top-1/2 z-[611] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-card)] p-5 font-sans">
      <div class="flex items-center justify-between gap-3">
        <Dialog.Title class="font-display text-lg font-semibold">Keyboard shortcuts</Dialog.Title>
        <Dialog.Close aria-label="Close keyboard shortcuts" class="min-h-11 min-w-11 rounded-[var(--radius-sm)] border-0 bg-transparent text-lg text-muted-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-accent">×</Dialog.Close>
      </div>
      <Dialog.Description class="mt-2 text-sm text-muted-foreground">{context === 'entry' ? 'Add / Edit Entry, including Split Entry' : context === 'bulk' ? 'Entries · bulk selection' : context === 'settings' ? 'Settings' : context === 'statistics' ? 'Deeper statistics' : context === 'entries' ? 'Entries' : context === 'summary' ? 'Summary' : 'Home'}</Dialog.Description>
      <dl class="my-4 grid grid-cols-1 min-[420px]:grid-cols-[auto_1fr] gap-x-4 gap-y-1 min-[420px]:gap-y-3 text-sm [&>dt]:mt-2 min-[420px]:[&>dt]:mt-0 [&>dd]:text-muted-foreground">
        <dt class="font-mono">Tab / Shift+Tab</dt><dd>Next / previous field or control</dd>
        <dt class="font-mono">Esc</dt><dd>Close the innermost popup, then cancel the sheet{context === 'bulk' ? ' or exit bulk selection' : ''}</dd>
        {#if context === 'entry'}
          <dt class="font-mono">{modifier}+Enter</dt><dd>Save all legs through Save</dd>
          <dt class="font-mono">← / →</dt><dd>Focus Category / Subcategory choices</dd>
          <dt class="font-mono">Enter / Space</dt><dd>Activate the focused choice; Subcategory is optional on Outgoing</dd>
        {/if}
        {#if page}
          {#if context !== 'bulk'}<dt class="font-mono">Shift+N</dt><dd>Add Entry when available; focus Amount</dd>{/if}
          <dt class="font-mono">G then H / E / S</dt><dd>Home / Entries / Summary within one second</dd>
        {/if}
        {#if context === 'entries' || context === 'bulk'}
          <dt class="font-mono">↑ / ↓</dt><dd>Focus previous / next visible Entry</dd>
          <dt class="font-mono">{context === 'bulk' ? 'Enter / Space' : 'Enter'}</dt><dd>{context === 'bulk' ? 'Toggle an eligible Entry' : 'Edit an available Entry'}</dd>
        {/if}
        {#if context === 'bulk'}
          <dt class="font-mono">{modifier}+A</dt><dd>Select all eligible Entries in this filtered week</dd>
          <dt class="font-mono">Delete</dt><dd>Confirm deletion of selected Entries</dd>
        {/if}
        <dt class="font-mono">?</dt><dd>Open help when outside editable fields</dd>
      </dl>
      <p class="text-xs text-muted-foreground leading-relaxed">Page commands pause while typing or using another popup. Browser shortcuts keep their usual behavior.</p>
      {#if !keyboardPreferences.enabled}<p class="mt-3 text-sm text-muted-foreground">Character shortcuts are off. Use the visible ? help button or enable them below.</p>{/if}
      <div class="mt-4 border-t border-border pt-3"><KeyboardPreference /></div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
