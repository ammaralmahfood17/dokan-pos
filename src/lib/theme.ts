/**
 * Live theme customization (P2.1).
 *
 * The app's design tokens are real CSS variables (`--primary`, `--gold`,
 * `--card`, …) so a runtime override on `document.documentElement`
 * restyles every utility that references them. Persisted per browser.
 */

export interface ThemeColors {
  /** Brand color — maps to `--primary`. */
  primary: string;
  /** Accent — maps to `--gold` (new token, see index.css). */
  gold: string;
  /** Surface — maps to `--card` / `--popover` (the doc's `--color-surface`). */
  surface: string;
}

export const DEFAULT_THEME: ThemeColors = {
  primary: "#1B1B1B", // ≈ oklch(0.18 0 0) — the Minimalism near-black
  gold: "#D4AF37",
  surface: "#FFFFFF", // ≈ oklch(1 0 0) — card surface
};

const THEME_KEY = "dokan-theme";

function toHex(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
}

export function applyTheme(colors: ThemeColors) {
  const root = document.documentElement;
  root.style.setProperty("--primary", toHex(colors.primary));
  // Keep readable button text on the brand color.
  root.style.setProperty("--primary-foreground", "#FAFAFA");
  root.style.setProperty("--gold", toHex(colors.gold));
  root.style.setProperty("--card", toHex(colors.surface));
  root.style.setProperty("--popover", toHex(colors.surface));
}

export function resetTheme() {
  const root = document.documentElement;
  root.style.removeProperty("--primary");
  root.style.removeProperty("--primary-foreground");
  root.style.removeProperty("--gold");
  root.style.removeProperty("--card");
  root.style.removeProperty("--popover");
  stash = null;
  try {
    localStorage.removeItem(THEME_KEY);
  } catch {
    // storage unavailable
  }
}

let stash: ThemeColors | null = null;

export function saveTheme(colors: ThemeColors) {
  stash = colors;
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(colors));
  } catch {
    // storage unavailable
  }
}

export function loadTheme(): ThemeColors {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeColors>;
    return {
      primary: typeof parsed.primary === "string" ? parsed.primary : DEFAULT_THEME.primary,
      gold: typeof parsed.gold === "string" ? parsed.gold : DEFAULT_THEME.gold,
      surface: typeof parsed.surface === "string" ? parsed.surface : DEFAULT_THEME.surface,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

/** Applies the saved theme (called once at startup, before first paint). */
export function applySavedTheme() {
  if (typeof window === "undefined") return;
  stash = loadTheme();
  applyTheme(stash);
}

export function getStashedTheme(): ThemeColors | null {
  return stash;
}