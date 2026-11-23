export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

function applyThemePreference(pref: ThemePreference) {
  const html = document.documentElement;
  html.classList.toggle('theme-dark', pref === 'dark');
  html.classList.toggle('theme-light', pref === 'light');

  const scheme = document.querySelector<HTMLMetaElement>('#theme-color-scheme');
  if (scheme) scheme.content = pref === 'system' ? 'light dark' : pref;

  const override = document.querySelector<HTMLMetaElement>('#theme-color-override');
  const themeColor = document.querySelector<HTMLMetaElement>(`#theme-color-${pref}`);
  if (override) {
    override.content = themeColor?.content ?? '';
    override.media = themeColor ? 'all' : 'not all';
  }
}

function createDarkModeStore() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let systemDark  = $state(mq.matches);
  const saved = localStorage.getItem(STORAGE_KEY);
  const initialPreference = saved === 'dark' || saved === 'light' ? saved : 'system';
  let preference = $state<ThemePreference>(initialPreference);

  applyThemePreference(initialPreference);

  mq.addEventListener('change', (e) => { systemDark = e.matches; });

  return {
    get current()    { return preference === 'dark' || (preference === 'system' && systemDark); },
    get preference() { return preference; },
    setPreference(pref: ThemePreference) {
      preference = pref;
      localStorage.setItem(STORAGE_KEY, pref);
      applyThemePreference(pref);
    },
  };
}

export const darkMode = createDarkModeStore();
