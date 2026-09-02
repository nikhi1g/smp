"use client";

import { useEffect, useState } from "react";
import {
  getInitialTheme,
  isTheme,
  setTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setCurrentTheme] = useState<Theme>("light");

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setCurrentTheme(initialTheme);
    setTheme(initialTheme);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;

      setCurrentTheme(event.newValue);
      document.documentElement.setAttribute("data-theme", event.newValue);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setCurrentTheme(nextTheme);
    setTheme(nextTheme);
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      aria-pressed={isDark}
      title="Toggle theme"
      onClick={toggleTheme}
      className="ml-auto inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-[var(--sub)] transition-colors duration-200 hover:text-[var(--acc)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path
          className="sun"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          style={{ display: isDark ? "block" : "none" }}
        />
        <path
          className="moon"
          d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
          style={{ display: isDark ? "none" : "block" }}
        />
      </svg>
    </button>
  );
}
