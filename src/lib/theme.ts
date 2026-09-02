export const THEME_STORAGE_KEY = "theme";

export type Theme = "light" | "dark";

export function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

export function getInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function setTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage may be unavailable in privacy-restricted browsers.
    }
  }
}
