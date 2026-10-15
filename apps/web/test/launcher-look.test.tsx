import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ThemeSwitcher,
  launcherThemes,
} from "../src/components/launcher-theme";
import { LauncherHero } from "../src/components/launcher-hero";

const pub = (p: string) => new URL(`../public/${p}`, import.meta.url);

describe("launcher look", () => {
  it("offers three themes with the active one pressed", () => {
    const html = renderToStaticMarkup(
      <ThemeSwitcher value="night" onChange={() => {}} />,
    );
    for (const t of launcherThemes)
      expect(html).toContain(t.label.replace("&", "&amp;"));
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*title="Night Lab"/);
  });
  it("hero shows the project, the headline and the theme's art", () => {
    const html = renderToStaticMarkup(
      <LauncherHero
        theme="concrete"
        quickOpen={[{ label: "Open RC Column", onOpen: () => {} }]}
      />,
    );
    expect(html).toContain("What are we designing today?");
    expect(html).toContain("Open RC Column");
    expect(html).toContain("/launcher/hero-concrete.svg");
    expect(html).not.toContain("Ask");
  });
  it("ships hero art for every theme and both trade heading backgrounds", () => {
    for (const t of launcherThemes) {
      const svg = readFileSync(pub(`launcher/hero-${t.id}.svg`), "utf8");
      expect(svg).toContain("Neural network behind a diagrid tower");
    }
    expect(existsSync(pub("launcher/band-structural.jpg"))).toBe(true);
    expect(existsSync(pub("launcher/band-geotechnical.jpg"))).toBe(true);
  });
  it("every catalogue module has a WebP icon", async () => {
    const { uiCatalogue } = await import("../src/lib/ui-catalogue");
    for (const m of uiCatalogue)
      expect(existsSync(pub(`icons/${m.slug}.webp`)), m.slug).toBe(true);
  });
});
