function createDarkModeStore() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let dark = $state(mq.matches);
  mq.addEventListener('change', (e) => { dark = e.matches; });
  return { get current() { return dark; } };
}

export const darkMode = createDarkModeStore();
