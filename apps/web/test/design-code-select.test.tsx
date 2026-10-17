/** Shared Primary Design Code dropdown, built from the calc-core catalogue. */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignCodeSelect } from "../src/components/design-code-select";

const options = (html: string) =>
  [...html.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map((m) => ({
    disabled: /disabled/.test(m[1]!),
    selected: /selected/.test(m[1]!),
    text: m[2]!.replace(/&amp;/g, "&"),
  }));

describe("DesignCodeSelect", () => {
  it("concrete: only ACI 318-19 selectable; others Future Development", () => {
    const html = renderToStaticMarkup(
      <DesignCodeSelect
        discipline="concrete"
        value="ACI 318-19"
        onChange={() => {}}
      />,
    );
    const o = options(html);
    expect(o.filter((x) => !x.disabled).map((x) => x.text)).toEqual([
      "ACI 318-19",
    ]);
    expect(o.filter((x) => x.disabled).map((x) => x.text)).toEqual([
      "ACI 318-25 — Future Development",
      "ACI 318-14 — Future Development",
      "NSCP 2015 (Vol. 1) — Future Development",
      "NSCP 2010 (Vol. 1) — Future Development",
      "BS EN 1992-1-1 (Eurocode 2) — Future Development",
      "AS 3600 — Future Development",
    ]);
    expect(html).toContain("Primary Design Code");
  });

  it("steel: label override keeps the DG1 wording for Base Plate", () => {
    const html = renderToStaticMarkup(
      <DesignCodeSelect
        discipline="steel"
        value="AISC 360-22"
        onChange={() => {}}
        labels={{ "AISC 360-22": "AISC 360-22 + AISC Design Guide 1, 3rd Ed." }}
      />,
    );
    const o = options(html);
    expect(o.filter((x) => !x.disabled).map((x) => x.text)).toEqual([
      "AISC 360-22 + AISC Design Guide 1, 3rd Ed.",
    ]);
    expect(o.filter((x) => x.disabled)).toHaveLength(6);
  });

  it("loads: ASCE 7-22 first and selected by default, NSCP 2015 selectable", () => {
    const html = renderToStaticMarkup(
      <DesignCodeSelect
        discipline="loads"
        value="ASCE 7-22"
        onChange={() => {}}
      />,
    );
    const active = options(html).filter((x) => !x.disabled);
    expect(active.map((x) => x.text)).toEqual([
      "ASCE/SEI 7-22",
      "ASCE/SEI 7-16",
      "ASCE/SEI 7-10",
      "NSCP 2015 (Vol. 1, Ch. 2)",
    ]);
    expect(active[0]!.selected).toBe(true);
  });
});
