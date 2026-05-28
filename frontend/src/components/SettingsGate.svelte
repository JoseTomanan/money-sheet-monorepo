<!-- First-launch non-dismissible gate dialog; could map to shadcn Dialog but is out of scope for issue #39 (Sheet + Badge only). -->
<script lang="ts">
  import Settings from './Settings.svelte';

  interface Props {
    onsaved: () => void;
  }

  let { onsaved }: Props = $props();
</script>

<div class="gate-backdrop fixed inset-0 bg-black/60 z-[500]"></div>
<div
  class="gate-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-[400px] bg-background rounded-[var(--radius-xl)] shadow-[var(--shadow-sheet)] z-[501] overflow-hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby="gate-title"
>
  <div class="gate-header px-5 pt-7 pb-2">
    <h1 id="gate-title" class="font-display text-xl font-bold text-foreground tracking-[-0.3px]">Welcome to Money Sheet</h1>
    <p class="font-sans text-[13px] text-muted-foreground mt-1">Enter your Google Apps Script URL and API secret to get started.</p>
  </div>
  <Settings {onsaved} />
</div>
