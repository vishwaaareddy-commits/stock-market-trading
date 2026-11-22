export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";
const THEME_EVENT = "app:theme-change";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/**
 * Inline script executed in <head> before first paint, so the saved theme is applied
 * before any content renders (no flash of the wrong theme). Keep it dependency-free.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark")t=${JSON.stringify(
  DEFAULT_THEME,
)};document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(
  DEFAULT_THEME,
)});}})();`;

export function getCurrentTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const value = document.documentElement.getAttribute("data-theme");
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** Apply and persist a theme without reloading the page. */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies for this session.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeToTheme(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && isTheme(e.newValue)) {
      document.documentElement.setAttribute("data-theme", e.newValue);
      callback();
    }
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", onStorage); // keep other tabs in sync
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}
