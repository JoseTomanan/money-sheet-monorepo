const STORAGE_KEY = 'ms_character_shortcuts';

function readPreference() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'false'; }
  catch { return true; }
}

let enabled = $state(readPreference());
export const keyboardPreferences = {
  get enabled() { return enabled; },
  setEnabled(value: boolean) {
    localStorage.setItem(STORAGE_KEY, String(value));
    enabled = value;
  },
};
