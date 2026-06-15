export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

function applyThemeClass(pref: ThemePreference) {
  const html = document.documentElement;
  html.classList.remove('theme-light', 'theme-dark');
  if (pref === 'dark')  html.classList.add('theme-dark');
  if (pref === 'light') html.classList.add('theme-light');
}

function createDarkModeStore() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let systemDark  = $state(mq.matches);
  let preference  = $state<ThemePreference>(
    (localStorage.getItem(STORAGE_KEY) as ThemePreference) ?? 'system'
  );

  applyThemeClass(preference);

  mq.addEventListener('change', (e) => { systemDark = e.matches; });

  return {
    get current()    { return preference === 'dark' || (preference === 'system' && systemDark); },
    get preference() { return preference; },
    setPreference(pref: ThemePreference) {
      preference = pref;
      localStorage.setItem(STORAGE_KEY, pref);
      applyThemeClass(pref);
    },
  };
}

export const darkMode = createDarkModeStore();
