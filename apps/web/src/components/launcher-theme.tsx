"use client";
import { useEffect, useState } from "react";

export const launcherThemes = [
  { id: "blueprint", label: "Blueprint", swatch: "#0E8BA6" },
  { id: "concrete", label: "Concrete & Signal", swatch: "#5A43DF" },
  { id: "night", label: "Night Lab", swatch: "#F2A33A" },
] as const;
export type LauncherTheme = (typeof launcherThemes)[number]["id"];

const STORAGE_KEY = "nola.launcherTheme";
const isTheme = (v: unknown): v is LauncherTheme =>
  launcherThemes.some((t) => t.id === v);

/** Launcher theme, remembered in this browser only (no account storage). */
export function useLauncherTheme(): [
  LauncherTheme,
  (t: LauncherTheme) => void,
] {
  const [theme, setTheme] = useState<LauncherTheme>("blueprint");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isTheme(saved)) setTheme(saved);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  function choose(next: LauncherTheme) {
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked: theme still applies for this visit */
    }
  }
  return [theme, choose];
}

export function ThemeSwitcher({
  value,
  onChange,
}: {
  value: LauncherTheme;
  onChange: (t: LauncherTheme) => void;
}) {
  return (
    <div className="themeSwitch" role="group" aria-label="Launcher theme">
      {launcherThemes.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={value === t.id}
          title={t.label}
          onClick={() => onChange(t.id)}
        >
          <i style={{ background: t.swatch }} aria-hidden="true" />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
