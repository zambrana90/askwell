// Dashboard theme: the stored choice (Light / Dark / System) and how it becomes a theme.
// The choice lives in the browser only (localStorage). No database column.

export const THEME_KEY = "askwell-theme";
export const THEME_CHOICES = ["light", "dark", "system"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ResolvedTheme = "light" | "dark";

export function parseThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === value) ?? "system";
}

// A stored light/dark choice wins. Otherwise follow the system setting.
export function resolveTheme(stored: unknown, systemPrefersDark: boolean): ResolvedTheme {
  const choice = parseThemeChoice(stored);
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

// "system" removes the attribute, so the CSS falls back to prefers-color-scheme.
export function applyThemeChoice(root: HTMLElement, choice: ThemeChoice): void {
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
}

// Inline script that runs before first paint, so a reload never flashes the wrong theme.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
