/**
 * Stairs report figures (decision R1/R2): the workspace drawings rendered
 * to standalone SVG strings (true scale), plus factored M / V envelopes.
 * Loaded with the report code only (react-dom/server stays out of the
 * workspace bundle).
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  stairGeometry,
  type StairsInput,
  type StairsResult,
  type StairStripResult,
} from "@nola/calc-core";
import {
  StairDogLegElevation,
  StairPlan,
  StripSection,
  StripSectionOnAxis,
  stairSectionRange,
} from "@/components/stair-diagrams";
import { stairBarColors } from "@/lib/stair-bar-styles";
import type { ReportFigure } from "./data";

/** Standalone SVG (xmlns, pixel size, white background) from React markup. */
export function standaloneSvg(element: ReactElement, widthPx = 900): string {
  const markup = renderToStaticMarkup(element);
  const m = markup.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  if (!m) return markup;
  const [x, y, w, h] = m.slice(1).map(Number);
  const height = Math.round((widthPx * h) / w);
  return markup
    .replace(/ class="[^"]*"/g, "")
    .replace(
      /^<svg/,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${height}" font-family="Arial, sans-serif" fill="#263d4d"`,
    )
    .replace(
      /(<svg[^>]*>)/,
      `$1<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`,
    );
}

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Factored Mu (+/−) and |Vu| envelopes along the developed length. */
export function stairForceFigureSvg(strip: StairStripResult): string {
  const st = strip.stations;
  const W = 500,
    H = 330,
    pad = 40,
    half = (H - 3 * pad) / 2;
  const sMax = Math.max(1, ...st.map((p) => p.s));
  const sx = (s: number) => pad + (s / sMax) * (W - 2 * pad);
  const chart = (
    top: number,
    title: string,
    unit: string,
    lines: { v: number[]; color: string; name: string }[],
  ) => {
    const all = lines.flatMap((l) => l.v);
    const hi = Math.max(1e-6, ...all),
      lo = Math.min(0, ...all),
      span = hi - lo || 1;
    const sy = (v: number) => top + ((hi - v) / span) * half;
    let body = `<text x="${pad}" y="${top - 8}" font-weight="bold" font-size="12">${esc(title)} (${unit})</text>`;
    body += `<line x1="${pad}" y1="${sy(0)}" x2="${W - pad}" y2="${sy(0)}" stroke="#98a2b3" stroke-width="1"/>`;
    for (const s of strip.geometry.supports) {
      let best = st[0];
      for (const p of st)
        if (Math.abs(p.x - s.x) < Math.abs(best.x - s.x)) best = p;
      body += `<line x1="${sx(best.s)}" y1="${top}" x2="${sx(best.s)}" y2="${top + half}" stroke="#98a2b3" stroke-dasharray="3 3"/>`;
    }
    lines.forEach((l, k) => {
      body += `<polyline fill="none" stroke="${l.color}" stroke-width="1.8" points="${st.map((p, n) => `${sx(p.s).toFixed(1)},${sy(l.v[n]).toFixed(1)}`).join(" ")}"/>`;
      body += `<text x="${W - pad - 150 * (lines.length - 1 - k)}" y="${top - 8}" font-size="11" fill="${l.color}" text-anchor="end">${esc(l.name)}</text>`;
    });
    body += `<text x="${W - pad}" y="${top + half + 14}" font-size="10" text-anchor="end">max ${hi.toFixed(2)} · min ${lo.toFixed(2)}</text>`;
    return body;
  };
  const body =
    chart(pad, "Mu envelope", "kN·m/m", [
      {
        v: st.map((p) => p.mPos),
        color: stairBarColors.mainBottom,
        name: "Mu+ sagging",
      },
      {
        v: st.map((p) => p.mNeg),
        color: stairBarColors.topBottom,
        name: "Mu− hogging",
      },
    ]) +
    chart(2 * pad + half, "|Vu| envelope", "kN/m", [
      { v: st.map((p) => p.vu), color: "#2e8b3e", name: "|Vu|" },
    ]) +
    `<text x="${pad}" y="${H - 6}" font-size="10">s = 0 → developed length ${(sMax / 1000).toFixed(2)} m · dashed: supports</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif" fill="#263d4d"><rect width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
}

export function stairFigures(
  i: StairsInput,
  r: StairsResult,
  snapshot3d?: string | null,
): ReportFigure[] {
  const geos = stairGeometry(i);
  const range = stairSectionRange(i, geos);
  const dog = i.stairType === "dog-leg";
  const out: ReportFigure[] = [];
  if (dog)
    out.push({
      title: "Dog-Leg Elevation (Flight 1 Front, Flight 2 Behind)",
      svg: standaloneSvg(<StairDogLegElevation input={i} bare />),
      completeOnly: true,
    });
  for (const g of geos)
    out.push({
      title: dog
        ? `Section · ${g.label} (Bars B1 / T1–T3 / D1)`
        : "Longitudinal Section · Bars B1 / T1–T3 / D1",
      svg: standaloneSvg(
        dog && g.index === 2 ? (
          <StripSectionOnAxis
            i={i}
            g={g}
            L1={geos[0].length}
            range={range!}
            highlight={null}
          />
        ) : (
          <StripSection i={i} g={g} xRange={range} highlight={null} />
        ),
      ),
    });
  out.push({
    title: "Plan · Bottom Layer And Top-Bar Zones",
    svg: standaloneSvg(<StairPlan input={i} bare />),
  });
  for (const s of r.strips)
    out.push({
      title: `Factored Envelopes · ${s.geometry.label}`,
      svg: stairForceFigureSvg(s),
      completeOnly: true,
    });
  if (snapshot3d)
    out.push({
      title: "3D View With Supports And Loads (snapshot)",
      svg: "",
      png: snapshot3d,
      completeOnly: true,
    });
  return out;
}
