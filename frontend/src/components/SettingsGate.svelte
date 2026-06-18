<!-- First-launch non-dismissible gate dialog; could map to shadcn Dialog but is out of scope for issue #39 (Sheet + Badge only). -->
<script lang="ts">
  import Settings from './Settings.svelte';
  import Wordmark from './Wordmark.svelte';

  const TEMPLATE_URL = 'https://docs.google.com/spreadsheets/d/1dW0X378z9MXCqZ9YK2oxCqk3FjX6TUP2h7yLSdjmd6g/template/preview';

  interface Props {
    onsaved: () => void;
  }

  let { onsaved }: Props = $props();
</script>

<div class="gate-backdrop fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-[2px] z-[500]"></div>
<div
  class="gate-dialog card-hero fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-[400px] md:max-w-[520px] max-h-[calc(100dvh-32px)] rounded-[var(--radius-xl)] z-[501] overflow-y-auto"
  role="dialog"
  aria-modal="true"
  aria-labelledby="gate-title"
>
  <div class="gate-header px-5 pt-7 pb-2">
    <Wordmark />
    <h1 id="gate-title" class="font-display text-[15px] font-bold text-foreground tracking-[-0.2px] mt-5">Connect your spreadsheet</h1>
    <p class="font-sans text-[13px] text-muted-foreground mt-1 mb-4">Follow these steps to get started:</p>
    <ol class="font-sans text-[13px] text-foreground space-y-2 list-none pl-0 mb-1">
      <li class="flex gap-2">
        <span class="shrink-0 font-semibold text-muted-foreground w-4">1.</span>
        <span>
          <a href={TEMPLATE_URL} target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2">Copy the template</a>
          — opens a pre-configured Google Sheet with the script included.
        </span>
      </li>
      <li class="flex gap-2">
        <span class="shrink-0 font-semibold text-muted-foreground w-4">2.</span>
        <span>In your sheet, open the <strong>Autohide</strong> menu → <strong>Run setup</strong> — a secret is generated and shown in a dialog; copy it.</span>
      </li>
      <li class="flex gap-2">
        <span class="shrink-0 font-semibold text-muted-foreground w-4">3.</span>
        <span>Deploy as a <strong>web app</strong> (execute as Me, access Anyone) — copy the URL.</span>
      </li>
      <li class="flex gap-2">
        <span class="shrink-0 font-semibold text-muted-foreground w-4">4.</span>
        <span>Paste the URL and secret into the fields below.</span>
      </li>
    </ol>
  </div>
  <Settings {onsaved} />
</div>
