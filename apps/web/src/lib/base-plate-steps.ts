/**
 * Step-by-step calculation of one load combination: item, equation with
 * substituted values and result, and the clause. Shared by the Calculations
 * tab and the Complete PDF so both print identical numbers.
 */
import {
  basePlateClauses,
  futaUsed,
  heavyHexBearingArea,
  rodsCarryShear,
  type BasePlateInput,
  type BasePlateResult,
  type ComboResult,
} from "@nola/calc-core";

export type Step = [item: string, equation: string, clause: string];
const f = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);
const kN = (n: number) => f(n / 1e3, 1);

export function basePlateSteps(
  i: BasePlateInput,
  r: BasePlateResult,
  c: ComboResult,
): Step[] {
  const s: Step[] = [];
  const lrfd = i.designMethod === "LRFD";
  const fac = (phi: number, omega: number) =>
    lrfd ? `φ ${phi}` : `1/Ω (Ω = ${omega})`;
  const alpha = r.method.anchorDemandFactor;
  const b = r.bearing;
  const L = c.load;
  s.push([
    "Load combination",
    `${L.id}: Pu = ${f(L.pu, 1)} kN, Mx = ${f(L.mx, 1)} kN·m, My = ${f(L.my, 1)} kN·m, Vx = ${f(L.vx, 1)} kN, Vy = ${f(L.vy, 1)} kN${c.seismicApplies ? " (earthquake, SDC " + i.seismic.sdc + ")" : ""}`,
    "Input",
  ]);
  s.push([
    "Bearing strength",
    `A1 = ${f(i.plate.bx, 0)} × ${f(i.plate.by, 0)} = ${f(b.a1, 0)} mm²; A2 = ${f(b.a2, 0)} mm² (geometrically similar); ${lrfd ? "φc fp,max" : "fp,max/Ωc"} = ${fac(0.65, 2.31)} × 0.85 × ${f(i.pedestal.fc, 1)} × min(√(A2/A1), 2) = ${f(b.fpMax, 3)} MPa (${i.designMethod})`,
    basePlateClauses.bearing(),
  ]);
  s.push(["Method", c.method, basePlateClauses.bearing()]);
  for (const a of c.axes) {
    const ax = a.axis === "y" ? "Y (Mx, plate N = By)" : "X (My, plate N = Bx)";
    if (c.case === "uplift") {
      s.push([
        `Axis ${ax}`,
        `Tension, e ≤ f (DG1 Eq. 4-67): Ti = −Pu/n − Mx·yi/Σy² − My·xi/Σx²; plate at the column face over B (Eq. 4-62), or about the web / flange / stiffener with 45° (Ex. 4.7-3) → tp,req = ${f(a.tpTension, 2)} mm`,
        basePlateClauses.plate(),
      ]);
      continue;
    }
    s.push([
      `Cantilevers ${ax}`,
      `m = (N − k·dcol)/2 = ${f(a.m, 1)} mm; n = (B − k·bcol)/2 = ${f(a.nCant, 1)} mm${a.case === "axial" ? `; λn′ = ${f(c.lambdaNp, 1)} mm` : ""}`,
      basePlateClauses.plate(),
    ]);
    if (a.case === "axial")
      s.push([
        "Bearing (axial)",
        `fp = Pu/(B·N) = ${f(L.pu * 1e3, 0)}/(${f(a.b, 0)} × ${f(a.n, 0)}) = ${f(a.fp, 3)} MPa ≤ ${f(b.fpMax, 3)} → DCR ${f(a.bearingDcr, 3)}`,
        basePlateClauses.bearing(),
      ]);
    else if (a.case === "small" || a.case === "biaxial-small")
      s.push([
        `Bearing ${ax}`,
        `e = M/P = ${f(a.e, 1)} mm ≤ ecrit = N/2 − Pu/(2qmax) = ${f(a.ecrit, 1)} mm; Y = N − 2e = ${f(a.y, 1)} mm; fp = ${f(a.fp, 3)} MPa → DCR ${f(a.fp / b.fpMax, 3)}`,
        basePlateClauses.bearing(),
      ]);
    else if (a.case === "large")
      s.push([
        `Bearing ${ax}`,
        `e = ${f(a.e, 1)} > ecrit = ${f(a.ecrit, 1)} mm; qmax = fp,max·B = ${f(b.fpMax * a.b, 0)} N/mm; f = ${f(a.f, 1)} mm; Y = (f + N/2) − √((f + N/2)² − 2Pu(e + f)/qmax) = ${f(a.y, 1)} mm; Tu = qmax·Y − Pu = ${kN(a.tu)} kN on ${a.tensionRods.join(", ")}`,
        basePlateClauses.bearing(),
      ]);
    else
      s.push([
        `Bearing ${ax}`,
        `(f + N/2)² < 2Pu(e + f)/qmax: no real solution — increase the plate or the rod lever arm.`,
        basePlateClauses.bearing(),
      ]);
    if (Number.isFinite(a.tpBearing) && c.stiffener)
      s.push([
        `Plate, bearing interface ${ax}`,
        `Stiffened: max(DG1 cantilever of the unstiffened zones${a.case === "axial" ? " and λn′" : ""}, stiffened panels below) → tp,req = ${f(a.tpBearing, 2)} mm`,
        basePlateClauses.stiffenedPlate(),
      ]);
    else if (Number.isFinite(a.tpBearing))
      s.push([
        `Plate, bearing interface ${ax}`,
        a.case === "axial"
          ? `tp,req = ℓ√(2P/(${lrfd ? "0.90 Fy" : "Fy/1.67"} B N)), ℓ = max(m, n, λn′) = ${f(Math.max(a.m, a.nCant, c.lambdaNp), 1)} mm → ${f(a.tpBearing, 2)} mm`
          : `ℓ = max(m, n) = ${f(Math.max(a.m, a.nCant), 1)} mm; Mpl = ${a.y >= Math.max(a.m, a.nCant) ? "fp ℓ²/2" : "fp Y (ℓ − Y/2)"}; tp,req = √(4Mpl/(${lrfd ? "0.90 Fy" : "Fy/1.67"})) = ${f(a.tpBearing, 2)} mm`,
        basePlateClauses.plate(),
      ]);
    if (a.tpTension > 0 && a.case !== "uplift")
      s.push([
        `Plate, tension interface ${ax}`,
        `x = ${f(a.x, 1)} mm (I strong axis f − d/2 + tf/2; I weak axis f − 0.4bf; HSS f − b/2 + t/2); column-face rods: Mpl = T x / B (B = ${f(a.b, 0)} mm, DG1 Eq. 4-62); rods beside a web, flange or stiffener: 45° (below) → tp,req = ${f(a.tpTension, 2)} mm`,
        basePlateClauses.plate(),
      ]);
  }
  if (c.biaxial)
    s.push([
      "Biaxial interaction (DG1 Eq. 4-69)",
      `Mcx = ${f(c.biaxial.mcx, 1)} kN·m, Mcy = ${f(c.biaxial.mcy, 1)} kN·m at Pu (bisection over the bearing solution, plate, rod steel and ACI tension limit states); (Mx/Mcx)² + (My/Mcy)² = (${f(c.load.mx, 1)}/${f(c.biaxial.mcx, 1)})² + (${f(c.load.my, 1)}/${f(c.biaxial.mcy, 1)})² = ${f(c.biaxial.ratio, 3)}`,
      basePlateClauses.biaxial(),
    ]);
  if (c.lugMoment)
    s.push([
      "Shear lug moment",
      `e = tgrout + hsl/2 = ${f(c.lugMoment.e, 0)} mm; ΔMx = Vy·e = ${f(c.lugMoment.mx, 2)} kN·m, ΔMy = Vx·e = ${f(c.lugMoment.my, 2)} kN·m added to the base moment`,
      basePlateClauses.lugPlate(),
    ]);
  for (const g of [...c.plateTension]
    .filter((x) => !c.stiffener || !x.support.startsWith("S"))
    .sort((p, q) => q.tpReq - p.tpReq)
    .slice(0, 4))
    s.push([
      `Plate at rods ${g.rods.join(", ")} → ${g.support === "column" ? "column face" : g.support}`,
      g.support === "column"
        ? `x = ${g.levers.map((v) => f(v, 1)).join(", ")} mm; width B = ${f(g.beff, 0)} mm (DG1 Eq. 4-62); m = ΣT·x/B = ${f(g.m, 0)} N·mm/mm; tp,req = ${f(g.tpReq, 2)} mm`
        : `a = ${g.levers.map((v) => f(v, 1)).join(", ")} mm to the face; beff = 2a = ${f(g.beff, 0)} mm (45°, clipped; DG1 Ex. 4.7-3/4.7-7); m = ΣT·a/beff = ${f(g.m, 0)} N·mm/mm; tp,req = ${f(g.tpReq, 2)} mm`,
      basePlateClauses.plate(),
    ]);
  const sc = c.stiffener;
  const fb = lrfd ? "0.90 Fy" : "Fy/1.67";
  if (sc) {
    const sf = i.stiffeners;
    s.push([
      "Stiffened plate",
      `${sf.plateMethod === "strip" ? "Hillerborg strip method (45° to the nearest support)" : `Yield-line panels (fixed supports m′ = m) × ${1.1} corner allowance, ≤ unstiffened cantilever`}; unstiffened zones${c.case === "axial" ? " and λn′" : ""}: tp,req = ${f(sc.unstiffenedTp, 2)} mm`,
      basePlateClauses.stiffenedPlate(),
    ]);
    const panels = [...sc.panels].sort((p, q) => q.tpReq - p.tpReq).slice(0, 4);
    for (const p of panels)
      s.push([
        `Panel ${p.id} (${p.type})`,
        `a = ${f(p.a, 1)}, b = ${f(p.b, 1)} mm, fp = ${f(p.fp, 3)} MPa; ${p.mechanism}; m = ${f(p.mReq, 0)} N·mm/mm; tp,req = √(4m/(${fb})) = ${f(p.tpReq, 2)} mm`,
        basePlateClauses.stiffenedPlate(),
      ]);
    for (const g of [...sc.tension]
      .filter((x) => x.support.startsWith("S"))
      .sort((p, q) => q.tpReq - p.tpReq)
      .slice(0, 4))
      s.push([
        `Plate at rods ${g.rods.join(", ")} → ${g.support}`,
        `a = ${g.levers.map((v) => f(v, 1)).join(", ")} mm; beff = ${f(g.beff, 0)} mm (45°, clipped to the support); m = ΣT·a/beff = ${f(g.m, 0)} N·mm/mm; tp,req = ${f(g.tpReq, 2)} mm`,
        basePlateClauses.stiffenedPlate(),
      ]);
  }
  s.push([
    "Plate thickness",
    `tp,req = ${f(c.tpRequired, 2)} mm vs tp = ${f(i.plate.tp, 1)} mm (Fy ${f(i.plate.fy, 0)} MPa) → DCR ${f(c.tpRequired / i.plate.tp, 3)}`,
    basePlateClauses.plate(),
  ]);
  const a = i.anchors,
    an = c.anchor;
  const futa = futaUsed(a.fy, a.fu);
  s.push([
    "Rod steel tension",
    `Ase = ${f(a.ase, 1)} mm²; futa = min(${f(a.fu, 1)}, 1.9 × ${f(a.fy, 1)}, 860) = ${f(futa, 1)} MPa; φNsa = ${a.ductile ? "0.75" : "0.65"} × Ase × futa = ${kN(an.phiNsa)} kN; Nua = ${alpha !== 1 ? `${alpha} × Ta = ` : ""}${kN(an.nuaMax)} kN → DCR ${f(an.steelTensionDcr, 3)}`,
    basePlateClauses.steelTension(),
  ]);
  if (rodsCarryShear(i))
    s.push([
      "Rod steel shear",
      `Vsa = 0.6 Ase futa${i.grout.thickness > 0 ? " × 0.80 (grout pad)" : ""}; φVsa = ${kN(an.phiVsa)} kN; Vua = V/${c.shearRods.length} = ${kN(an.vuaMax)} kN → DCR ${f(an.steelShearDcr, 3)}`,
      basePlateClauses.steelShear(),
    ]);
  if (an.breakout) {
    const k = an.breakout;
    s.push([
      "Concrete breakout, tension",
      `h′ef = ${f(k.hefUsed, 1)} mm${k.reducedForEdges ? " (17.6.2.1.2, ≥ 3 near edges)" : ""}; Nb = ${kN(k.nb)} kN; ANc = ${f(k.anc, 0)}, ANco = 9h′ef² = ${f(k.anco, 0)} mm²; ψec ${f(k.psiEc, 3)} ψed ${f(k.psiEd, 3)} ψc ${f(k.psiC, 2)} ψcp ${f(k.psiCp, 2)}; Ncbg = ${kN(k.ncbg)} kN; φ ${k.phi}${k.seismicFactor < 1 ? " × 0.75" : ""} → Nua ${kN(k.nua)} kN, DCR ${f(k.dcr, 3)}`,
      basePlateClauses.breakoutTension(),
    ]);
  }
  if (an.pullout)
    s.push([
      "Pullout",
      `${an.pullout.basis}; Abrg = ${f(a.abrg > 0 ? a.abrg : heavyHexBearingArea(a.da), 0)} mm²; φNpn = ${kN(an.pullout.phiNpn)} kN vs Nua ${kN(an.pullout.nua)} kN → DCR ${f(an.pullout.dcr, 3)}`,
      basePlateClauses.pullout(),
    ]);
  for (const sf of an.sideFace)
    s.push([
      "Side-face blowout",
      `${sf.edge} edge, ca1 = ${f(sf.ca1, 0)} mm < hef/2.5: φNsbg = ${kN(sf.phiNsbg)} kN vs ${kN(sf.nua)} kN → DCR ${f(sf.dcr, 3)}`,
      basePlateClauses.sideFace(),
    ]);
  if (an.bond)
    s.push([
      "Adhesive bond",
      `τ = ${f(an.bond.tau, 2)} MPa; cNa = 10da√(τuncr/7.6) = ${f(an.bond.cna, 0)} mm; Nba = λa τ π da hef = ${kN(an.bond.nba)} kN; Nag = ${kN(an.bond.nag)} kN; φ ${an.bond.phi} → DCR ${f(an.bond.dcr, 3)}; sustained DCR ${f(an.bond.sustainedDcr, 3)}`,
      basePlateClauses.bond(),
    ]);
  for (const sb of an.shearBreakout)
    s.push([
      `Concrete breakout, shear → ${sb.edge}`,
      `${sb.row === "back" ? "farthest" : "front"} row, ca1 = ${f(sb.ca1Used, 0)} mm; Vb = min(0.6(le/da)^0.2√da λa√f′c ca1^1.5, 3.7λa√f′c ca1^1.5) = ${kN(sb.vb)} kN; AVc/AVco = ${f(sb.avc / sb.avco, 3)}; ψed ${f(sb.psiEd, 3)} ψc ${f(sb.psiC, 2)} ψh ${f(sb.psiH, 3)}; φVcbg = ${kN(sb.phi * sb.vcbg)} kN vs ${kN(sb.vua)} kN → DCR ${f(sb.dcr, 3)}`,
      basePlateClauses.breakoutShear(),
    ]);
  if (an.pryout)
    s.push([
      "Pryout",
      `Vcpg = kcp Ncpg, kcp = ${an.pryout.kcp}; φVcpg = ${kN(an.pryout.phiVcpg)} kN vs ${kN(an.pryout.vua)} kN → DCR ${f(an.pryout.dcr, 3)}`,
      basePlateClauses.pryout(),
    ]);
  s.push([
    "Interaction",
    `${an.interaction.rule}: tension ${f(an.tensionRatio, 3)}, shear ${f(an.shearRatio, 3)} → ${f(an.interaction.ratio, 3)}`,
    basePlateClauses.interaction(),
  ]);
  s.push([
    "Rod as a bolt (AISC J3.8)",
    `Ab = πda²/4, Z = da³/6; ft = T/Ab + M/Z = ${f(c.rodAisc.ft, 1)} MPa (M = V × ${f(c.rodAisc.lever, 1)} mm reverse curvature); fv = V/Ab = ${f(c.rodAisc.fv, 1)} MPa; ${lrfd ? "φF′nt" : "F′nt/Ω"} = ${f(c.rodAisc.ftAllow, 1)} MPa, ${lrfd ? "φFnv" : "Fnv/Ω"} = ${f(c.rodAisc.fvAllow, 1)} MPa (Fnt 0.75Fu, Fnv 0.45Fu) → DCR ${f(c.rodAisc.dcr, 3)}`,
    basePlateClauses.rodAisc(),
  ]);
  if (c.holeBearing) {
    const h = c.holeBearing;
    s.push([
      "Bearing / tearout at rod holes",
      `${h.element}: t = ${f(h.t, 1)} mm, hole ${f(h.hole, 1)} mm, lc = ${f(h.lc, 1)} mm, Fu ${f(h.fu, 0)} MPa; ${lrfd ? "φRn" : "Rn/Ω"} = min(3.0 d t Fu, 1.5 lc t Fu) = min(${kN(h.bearing)}, ${kN(h.tearout)}) kN vs V ${kN(h.v)} kN/rod → DCR ${f(h.dcr, 3)}`,
      basePlateClauses.holeBearing(),
    ]);
  }
  if (c.friction)
    s.push([
      "Friction",
      `φ0.65 μ P = 0.65 × ${i.shear.mu} × ${f(alpha * Math.max(L.pu, 0), 1)} kN ≤ 0.75 min(0.2f′c, 5.5 MPa) Ac (Ac = ${f(c.friction.ac / 1e6, 3)} m² → ${kN(c.friction.cap)} kN) = ${kN(c.friction.capacity)} kN vs V = ${kN(alpha * c.vResultant)} kN${i.shear.method === "friction-anchors" ? `; friction takes ${kN(c.friction.share)} kN, rods the rest` : ` → DCR ${f(c.friction.dcr, 3)}`}`,
      basePlateClauses.friction(),
    ]);
  if (c.lug)
    s.push(
      [
        "Shear lug, concrete",
        `${c.lug.direction.toUpperCase()}: Aef = b × min(hsl, 2tsl) = ${f(c.lug.aef, 0)} mm²; φVbrg = 0.65 × 1.7f′c Aef ψbrg (${f(c.lug.psiBrg, 2)}) = ${kN(c.lug.phiVbrg)} kN → DCR ${f(c.lug.bearingDcr, 3)}; φVcb = 0.65 × ${kN(c.lug.phiVcb / 0.65)} kN (ca1 ${f(c.lug.ca1, 0)} mm) → DCR ${f(c.lug.breakoutDcr, 3)}`,
        `${basePlateClauses.lugBearing()}; ${basePlateClauses.lugBreakout()}`,
      ],
      [
        "Shear lug, steel",
        `M = V e = ${f(c.lug.mu / 1e6, 2)} kN·m; M/φMn + (V/φVn)⁴ = ${f(c.lug.mu / 1e6, 2)}/${f(c.lug.phiMn / 1e6, 2)} + (${kN(c.lug.vu)}/${kN(c.lug.phiVy)})⁴ = ${f(c.lug.interaction, 3)}; rupture DCR ${f(c.lug.steelDcr, 3)}; weld ${f(c.lug.weldF, 0)} vs ${f(c.lug.weldCap, 0)} N/mm; plate at lug ${f(c.lug.plateM / 1e6, 2)} vs ${f(c.lug.plateMn / 1e6, 2)} kN·m`,
        `${basePlateClauses.lugFlexure()}; ${basePlateClauses.lugWeld()}`,
      ],
    );
  s.push([
    "Column weld",
    `${c.weld.detail} vs ${lrfd ? "φRn" : "Rn/Ω"} ${f(c.weld.capacity, 0)} N/mm (${fac(0.75, 2.0)} × 0.6 × ${i.weld.fexx} × 0.707 × ${i.weld.size}${/kds/.test(c.weld.detail) ? " × 1.5" : ""}) → DCR ${f(c.weld.dcr, 3)}`,
    basePlateClauses.weld(),
  ]);
  if (sc) {
    const groups = new Map<string, (typeof sc.members)[number]>();
    for (const m of sc.members) {
      const worst = (x: typeof m) =>
        Math.max(
          x.flexure.dcr,
          x.shear.dcr,
          x.weldColumn.dcr,
          x.weldPlate.dcr,
          x.column?.dcr ?? 0,
        );
      const g = groups.get(m.group);
      if (!g || worst(m) > worst(g)) groups.set(m.group, m);
    }
    const sf = i.stiffeners;
    for (const m of groups.values()) {
      s.push([
        `Stiffener ${m.id} (${m.group})`,
        `${sf.t} × ${sf.hc}/${sf.he} mm, Fy ${sf.fy}; ${m.kind} at the root: V = ${kN(m.vRoot)} kN, M = ${f(m.mRoot / 1e6, 2)} kN·m; flexure at ${f(m.flexure.xi, 0)} mm (h ${f(m.flexure.h, 0)}): Mu ${f(m.flexure.mu / 1e6, 2)} vs ${f(m.flexure.phiMn / 1e6, 2)} kN·m (${m.flexure.basis || "—"}) → DCR ${f(m.flexure.dcr, 3)}; shear ${kN(m.shear.vu)} vs ${kN(m.shear.phiVn)} kN → DCR ${f(m.shear.dcr, 3)}`,
        `${basePlateClauses.stiffenerFlexure()}; ${basePlateClauses.stiffenerShear()}`,
      ]);
      s.push([
        `Stiffener ${m.id} welds`,
        `To column: √((V/2Lw)² + (6M/2Lw²)²) = ${f(m.weldColumn.f, 0)} vs ${f(m.weldColumn.capacity, 0)} N/mm (Lw ${f(m.weldColumn.length, 0)}) → DCR ${f(m.weldColumn.dcr, 3)}; to plate: ${f(m.weldPlate.f, 0)} vs ${f(m.weldPlate.capacity, 0)} N/mm → DCR ${f(m.weldPlate.dcr, 3)}`,
        basePlateClauses.stiffenerWeld(),
      ]);
      if (m.column)
        s.push([
          `Column web at ${m.id}`,
          `H = 1.5M/Lw = ${kN(m.column.h)} kN, lb = ${f(m.column.lb, 0)} mm; web yielding ${kN(m.column.phiRnWly)} kN, crippling ${kN(m.column.phiRnWcr)} kN → DCR ${f(m.column.dcr, 3)}`,
          basePlateClauses.stiffenerColumn(),
        ]);
    }
  }
  const wb = c.weakBase;
  if (wb) {
    const u = i.seismic.ut;
    s.push(
      [
        "Weak base (DG1 6.4.2)",
        `${wb.scope}; n = ${wb.n} rods on the tension line, f = ${f(wb.f, 0)} mm; Tu = ${kN(wb.tu)} kN ≤ n φt Fy Ared = ${wb.n} × 0.90 × ${f(i.anchors.fy, 0)} × π${f(u.dReduced, 1)}²/4 = ${kN(wb.yieldCap)} kN → DCR ${f(wb.yieldDcr, 3)} (dreduced ≥ ${f(wb.dReq, 1)} mm)`,
        basePlateClauses.weakBase(),
      ],
      [
        "UT rod: threads and stretch",
        `Treduced = Fu Ared = ${kN(wb.tReduced)} kN ≤ 0.75 Fu Ase = ${kN(wb.threadCap)} kN → DCR ${f(wb.threadDcr, 3)}; Lstretch ${f(u.lStretch, 0)} ≥ f ${f(wb.f, 0)} mm → DCR ${f(wb.stretchDcr, 3)}`,
        basePlateClauses.weakBase(),
      ],
      [
        "Concrete and plate for yielded rods",
        `Rt Treduced = ${u.rt} × ${kN(wb.tReduced)} = ${kN(wb.rtT)} kN per rod (0.75 factor, 17.10.5.4): ${wb.concreteDetail} → DCR ${f(wb.concreteDcr, 3)}; tension-side plate tp,req = ${f(wb.tpTension, 2)} mm (Eq. 4-62); bearing side ${f(wb.tpBearing, 2)} mm reported only`,
        basePlateClauses.weakBase(),
      ],
    );
  }
  if (c.earthquake && /·Mp$/.test(L.id))
    s.push([
      "Strong base (AISC 341 D2.6c(a))",
      `Capacity combination: M = 1.1 Ry Fy Z / αs with Ry ${i.seismic.ry}, Fy ${f(i.column.fy, 0)} MPa (${i.seismic.columnGrade}); P and V from the E combination`,
      "AISC 341-22 D2.6c(a)",
    ]);
  if (an.ductility)
    s.push([
      "Seismic ductility (17.10.5.3(a))",
      an.ductility.detail,
      basePlateClauses.seismic(),
    ]);
  return s;
}
