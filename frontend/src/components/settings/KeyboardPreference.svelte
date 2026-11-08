<script lang="ts">
  import { keyboardPreferences } from '$lib/keyboardPreferences.svelte';
  let error = $state('');
</script>

<label class="flex min-h-11 items-center gap-3 text-sm font-sans text-foreground cursor-pointer">
  <input type="checkbox" checked={keyboardPreferences.enabled} onchange={(event) => {
    try { keyboardPreferences.setEnabled(event.currentTarget.checked); error = ''; }
    catch { event.currentTarget.checked = keyboardPreferences.enabled; error = 'Could not save this preference on this device. Try again.'; }
  }} class="size-4 accent-accent" />
  Enable character shortcuts
</label>
<p class="text-xs font-sans text-muted-foreground leading-relaxed">Shift+N, ?, and G sequences. Saved for this browser/device. Tab, arrows, and Ctrl/Cmd shortcuts remain available.</p>
{#if error}<p role="alert" class="mt-2 text-sm text-destructive">{error}</p>{/if}
