<script lang="ts">
  import { connection, setConnection, generateSetupUrl } from '../lib/connection.svelte';
  import { validateConnection, UnauthorizedError, ConnectionError } from '../lib/api';
  import { darkMode, type ThemePreference } from '../lib/darkMode.svelte';

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light',  label: 'Light'  },
    { value: 'dark',   label: 'Dark'   },
  ];

  interface Props {
    onsaved: () => void;
  }

  let { onsaved }: Props = $props();

  let gasUrl    = $state(connection.current?.gasUrl    ?? '');
  let apiSecret = $state(connection.current?.apiSecret ?? '');
  let showSecret = $state(false);
  let copyLabel = $state('Copy setup link');
  let saving = $state(false);
  let errorMsg = $state('');

  let saveDisabled = $derived(saving || gasUrl.trim() === '' || apiSecret.trim() === '');

  async function handleCopySetupLink() {
    const url = generateSetupUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    copyLabel = 'Copied!';
    setTimeout(() => { copyLabel = 'Copy setup link'; }, 2000);
  }

  async function handleSave() {
    errorMsg = '';
    saving = true;
    try {
      await validateConnection(gasUrl.trim(), apiSecret.trim());
      // Only commit after validation succeeds — committing first would unmount
      // SettingsGate before the error can be shown (connection.current becomes non-null).
      setConnection({ gasUrl: gasUrl.trim(), apiSecret: apiSecret.trim() });
      onsaved();
    } catch (err) {
      errorMsg = err instanceof UnauthorizedError
        ? "Secret rejected — make sure the secret and the GAS URL are from the same copy of the sheet."
        : err instanceof ConnectionError
          ? "Couldn't reach that URL — check the GAS web-app URL and try again."
          : "Something went wrong. Check the URL and secret and try again.";
    } finally {
      saving = false;
    }
  }
</script>

<div class="settings-content px-4 pt-4 pb-8">
  <h2 class="settings-title font-display text-base font-semibold text-foreground tracking-[-0.2px] mb-5">Connection Settings</h2>

  <div class="field-card mt-0 py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
    <label
      for="settings-gas-url"
      class="field-label block text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1"
    >GAS URL</label>
    <input
      id="settings-gas-url"
      type="text"
      bind:value={gasUrl}
      placeholder="https://script.google.com/macros/s/…/exec"
      class="field-input w-full bg-transparent border-0 outline-none font-sans text-[15px] text-foreground placeholder:text-muted-foreground"
      autocomplete="off"
      autocorrect="off"
      spellcheck={false}
    />
  </div>

  <div class="field-card mt-[10px] py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)] flex items-center gap-2">
    <div class="flex-1 min-w-0">
      <label
        for="settings-api-secret"
        class="field-label block text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1"
      >API Secret</label>
      <input
        id="settings-api-secret"
        type={showSecret ? 'text' : 'password'}
        bind:value={apiSecret}
        placeholder="your-api-secret"
        class="field-input w-full bg-transparent border-0 outline-none font-sans text-[15px] text-foreground placeholder:text-muted-foreground"
        autocomplete="current-password"
      />
    </div>
    <button
      type="button"
      class="shrink-0 bg-transparent border-0 cursor-pointer p-1 text-muted-foreground font-sans text-[12px] font-medium"
      onclick={() => (showSecret = !showSecret)}
      aria-label={showSecret ? 'Hide' : 'Show'}
    >
      {#if showSecret}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      {/if}
    </button>
  </div>

  <button
    class="save-btn w-full mt-5 py-3 rounded-[var(--radius-md)] border-0 bg-accent text-white font-sans text-[15px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-150"
    onclick={handleSave}
    disabled={saveDisabled}
  >{saving ? 'Checking…' : 'Save'}</button>

  {#if errorMsg}
    <p class="font-sans text-[13px] text-destructive mt-3 leading-snug">{errorMsg}</p>
  {/if}

  {#if connection.current}
    <button
      class="copy-link-btn w-full mt-2 py-[11px] rounded-[var(--radius-md)] border border-border bg-transparent text-muted-foreground font-sans text-[14px] font-medium cursor-pointer transition-[color,border-color] duration-150 hover:text-foreground hover:border-foreground/30"
      onclick={handleCopySetupLink}
      type="button"
    >{copyLabel}</button>
  {/if}

  <div class="appearance-section mt-8">
    <h2 class="font-display text-base font-semibold text-foreground tracking-[-0.2px] mb-3">Appearance</h2>
    <div class="py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
      <p class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-3">Theme</p>
      <div class="flex gap-2">
        {#each themeOptions as opt}
          <button
            type="button"
            class="flex-1 py-[9px] rounded-[var(--radius-sm)] font-sans text-[13px] font-semibold border-0 cursor-pointer transition-colors duration-150 {darkMode.preference === opt.value ? 'bg-accent text-white' : 'bg-muted text-muted-foreground'}"
            onclick={() => darkMode.setPreference(opt.value)}
          >{opt.label}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="spreadsheet-hints mt-8 space-y-3">
    <h2 class="font-display text-base font-semibold text-foreground tracking-[-0.2px]">Spreadsheet Settings</h2>

    <div class="py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
      <p class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Currency symbol</p>
      <p class="font-sans text-[13px] text-muted-foreground leading-snug">Set in the <strong class="text-foreground font-semibold">Config</strong> sheet of your spreadsheet — change the value in the <em>currency</em> row. Picked up automatically on next load.</p>
    </div>

    <div class="py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
      <p class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Subcategories</p>
      <p class="font-sans text-[13px] text-muted-foreground leading-snug">Add or remove subcategories by editing the <strong class="text-foreground font-semibold">Categories</strong> sheet directly. Changes are picked up automatically.</p>
    </div>
  </div>
</div>
