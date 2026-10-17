"use client";
/**
 * Storey geometry (panel 01): floor-to-floor height and upper-floor beam
 * depths. One source for slenderness ℓu (6.2.4), confinement lo / Ve
 * (18.7.5.1, 18.7.6.1.1) and the estimate's height and joint (18.8.3).
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  STOREY_SIDES,
  defaultColumnStorey,
  storeyClearHeights,
  storeyDepths,
  storeyError,
  storeySides,
  withStoreySides,
  type ColumnStorey,
  type RectangularColumnInput,
  type StoreySide,
  type StoreySideId,
} from "@nola/calc-core";
import { NumberField, fmt } from "./column-ui";
import { OVERRIDE_COLOR } from "../lib/override-style";

// three.js loads only when panel 01 renders in the browser.
const ColumnStorey3DView = dynamic(() => import("./column-storey-3d-view"), {
  ssr: false,
  loading: () => <p className="rcMuted">Loading 3D storey view…</p>,
});
const SIDE_NAME: Record<StoreySideId, string> = {
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};

export function StoreyGeometryFields({
  input,
  onChange,
  onSnapshot,
}: {
  input: RectangularColumnInput;
  onChange: (next: RectangularColumnInput) => void;
  /** 3D storey snapshot for the Complete report. */
  onSnapshot?: (png: string) => void;
}) {
  const s = input.storey ?? defaultColumnStorey();
  const set = (k: keyof ColumnStorey, v: number) =>
    onChange({ ...input, storey: { ...s, [k]: v } });
  const h = storeyClearHeights(s);
  const error = storeyError(s);
  const resolved = storeySides(s);
  const depths = storeyDepths(s);
  const setSide = (k: StoreySideId, patch: Partial<StoreySide>) =>
    onChange({
      ...input,
      storey: withStoreySides(
        s,
        { ...resolved.sides, [k]: { ...resolved.sides[k], ...patch } },
        resolved.slab,
      ),
    });
  const [no3d, setNo3d] = useState(false);
  return (
    <div className="storeyGeometry">
      <h3>Storey Geometry</h3>
      <div className="storeyBody">
        <div className="rcFields storeyFields">
          <NumberField
            label="Floor-to-floor height H (top of slab to top of slab)"
            unit="mm"
            value={s.height}
            onChange={(v) => set("height", v)}
          />
          <NumberField
            label="Upper slab thickness (sides without a beam)"
            unit="mm"
            value={resolved.slab}
            onChange={(v) =>
              onChange({
                ...input,
                storey: withStoreySides(s, resolved.sides, v),
              })
            }
          />
          <NumberField
            label="Drop panel / capital / haunch below soffit"
            unit="mm"
            value={s.capital ?? 0}
            onChange={(v) => set("capital", Number.isFinite(v) ? v : 0)}
          />
          <NumberField
            label="Bottom: top of footing / tie beam above lower level"
            unit="mm"
            value={s.bottom ?? 0}
            onChange={(v) => set("bottom", Number.isFinite(v) ? v : 0)}
          />
        </div>
      </div>
      {/* Upper-floor beams on each face (N/S along Y brace Mux; E/W along X brace Muy). */}
      <div className="rcTableWrap storeySides">
        <table className="rcInputTable" aria-label="Upper-floor beams">
          <thead>
            <tr>
              <th>Side</th>
              <th>Support</th>
              <th>Width (mm)</th>
              <th>Depth (mm)</th>
            </tr>
          </thead>
          <tbody>
            {STOREY_SIDES.map((k) => {
              const side = resolved.sides[k];
              return (
                <tr key={k}>
                  <td>
                    {SIDE_NAME[k]}
                    <small className="rcMuted">
                      {" "}
                      {k === "north" || k === "south" ? "along Y · Mux" : "along X · Muy"}
                    </small>
                  </td>
                  <td>
                    <select
                      aria-label={`${SIDE_NAME[k]} support`}
                      value={side.beam ? "beam" : "none"}
                      onChange={(e) => setSide(k, { beam: e.target.value === "beam" })}
                    >
                      <option value="beam">Beam</option>
                      <option value="none">None (slab only)</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      aria-label={`${SIDE_NAME[k]} beam width`}
                      disabled={!side.beam}
                      value={side.width}
                      onChange={(e) => setSide(k, { width: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      aria-label={`${SIDE_NAME[k]} beam depth`}
                      disabled={!side.beam}
                      value={side.depth}
                      onChange={(e) => setSide(k, { depth: Number(e.target.value) })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rcMuted">
        Governing depth for ℓu (shallower support in each direction, ACI 318-19 6.2.4):
        N/S {fmt(depths.ns, 0)} mm → ℓu,x · E/W {fmt(depths.ew, 0)} mm → ℓu,y.
        {resolved.assumedWidth && " Beam widths are assumed 300 mm (older draft) until entered."}
      </p>
      {no3d ? (
        <StoreySketch storey={s} />
      ) : (
        <ColumnStorey3DView
          storey={s}
          column={{ width: input.width, depth: input.depth }}
          onSnapshot={onSnapshot}
          onUnavailable={() => setNo3d(true)}
        />
      )}
      {error ? (
        <p className="rcAlert">{error}</p>
      ) : (
        <p className="rcMuted storeyDerived">
          ℓu,x (Mux) = {fmt(h.derivedX, 0)} mm
          {s.luOverrideX !== null ? (
            <strong style={{ color: OVERRIDE_COLOR }}>
              {" "}
              → override {fmt(s.luOverrideX, 0)}
            </strong>
          ) : null}{" "}
          · ℓu,y (Muy) = {fmt(h.derivedY, 0)} mm
          {s.luOverrideY !== null ? (
            <strong style={{ color: OVERRIDE_COLOR }}>
              {" "}
              → override {fmt(s.luOverrideY, 0)}
            </strong>
          ) : null}{" "}
          · lo uses {fmt(h.loClear, 0)} mm · joint {fmt(h.joint, 0)} mm (deepest
          member). ACI 318-19 6.2.4.
        </p>
      )}
    </div>
  );
}

/** Small elevation: H, beam depths, capital / bottom, ℓu,x / ℓu,y. */
export function StoreySketch({ storey: s }: { storey: ColumnStorey }) {
  const h = storeyClearHeights(s);
  const H = 190,
    top = 20,
    S = H / Math.max(s.height, 1);
  const Y = (z: number) => top + H - z * S;
  const deep = Math.max(s.beamX, s.beamY);
  const cap = s.capital ?? 0,
    bot = s.bottom ?? 0;
  return (
    <svg
      className="storeySketch"
      viewBox="0 0 260 240"
      role="img"
      aria-label={`Storey: H ${s.height} mm, beams ${s.beamX} / ${s.beamY} mm, ℓu ${h.luX} / ${h.luY} mm`}
    >
      {/* slabs / beams at the upper level */}
      <rect x="20" y={top} width="150" height={s.beamX * S} fill="#d1e7eb" />
      <rect
        x="95"
        y={top}
        width="75"
        height={s.beamY * S}
        fill="#b9dade"
        opacity="0.9"
      />
      {cap > 0 ? (
        <rect
          x="70"
          y={top + deep * S}
          width="60"
          height={cap * S}
          fill="#e4d5b7"
        />
      ) : null}
      {bot > 0 ? (
        <rect
          x="60"
          y={Y(bot)}
          width="80"
          height={bot * S}
          fill="#e4d5b7"
        />
      ) : null}
      {/* column */}
      <rect
        x="85"
        y={top}
        width="30"
        height={H}
        fill="#edf3f6"
        stroke="#617a88"
      />
      <line x1="10" x2="180" y1={Y(0)} y2={Y(0)} stroke="#4b5d6b" />
      <line
        x1="10"
        x2="180"
        y1={top}
        y2={top}
        stroke="#4b5d6b"
        strokeDasharray="3 2"
      />
      <path d={`M14 ${top}V${Y(0)}`} stroke="#4b5d6b" />
      <text
        x="10"
        y={top + H / 2}
        fontSize="10"
        textAnchor="middle"
        transform={`rotate(-90 10 ${top + H / 2})`}
      >
        H = {s.height}
      </text>
      <path
        d={`M190 ${top + (s.beamY + cap) * S}V${Y(bot)}`}
        stroke="#007f86"
      />
      <text x="194" y={top + H / 2 - 6} fontSize="10" fill="#007f86">
        ℓu,x {h.luX}
      </text>
      <path
        d={`M226 ${top + (s.beamX + cap) * S}V${Y(bot)}`}
        stroke="#b45309"
      />
      <text x="194" y={top + H / 2 + 8} fontSize="10" fill="#b45309">
        ℓu,y {h.luY}
      </text>
      <text x="22" y={top + 10} fontSize="9">
        beam ∥X {s.beamX}
      </text>
      <text x="118" y={top + 10} fontSize="9">
        ∥Y {s.beamY}
      </text>
      <text x="20" y="236" fontSize="9">
        Top of lower slab → top of upper slab
      </text>
    </svg>
  );
}
