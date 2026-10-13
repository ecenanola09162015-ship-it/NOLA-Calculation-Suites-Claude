"use client";
/**
 * 3D P–Mx–My interaction surface (ACI 318-19 22.2 strain compatibility,
 * φ Table 21.2.2, cap 0.80·φPo Table 22.4.2.1). Three.js is loaded only when
 * this card mounts. Design surface (φ) inside, nominal outside, both
 * translucent; demand points coloured by status with the capacity ray.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MeshPhongMaterial } from "three";
import type {
  DesignCheckPolicy,
  RectangularColumnInput,
  RectangularColumnResult,
} from "@nola/calc-core";
import {
  buildInteraction3D,
  cameraFor,
  fromSceneP,
  sliceAt,
  surfaceMesh,
  toScene,
  type View3D,
} from "../lib/interaction-3d-model";
import { fmt } from "./column-ui";

type Show = {
  design: boolean;
  nominal: boolean;
  cap: boolean;
  points: boolean;
  wire: boolean;
  labels: boolean;
};
const DESIGN = 0x0f8a80,
  NOMINAL = 0x8a99a6,
  CAP = 0xd99a00;

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function ColumnInteraction3D({
  input,
  result,
  policy,
}: {
  input: RectangularColumnInput;
  result: RectangularColumnResult;
  policy: DesignCheckPolicy;
}) {
  const model = useMemo(
    () => buildInteraction3D(input, result, policy),
    [input, result, policy],
  );
  const [view, setView] = useState<View3D>("iso");
  const [show, setShow] = useState<Show>({
    design: true,
    nominal: true,
    cap: false,
    points: true,
    wire: false,
    labels: false,
  });
  const [opacity, setOpacity] = useState(0.35);
  const [pLevel, setPLevel] = useState(model.governingPu);
  const [selected, setSelected] = useState(
    model.points.find((p) => p.governing)?.id ?? "",
  );
  const [hover, setHover] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "nowebgl">(
    "loading",
  );
  const [full, setFull] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  // Live handles into the three.js scene (set once mounted).
  const api = useRef<{
    apply: (o: {
      view: View3D;
      show: Show;
      opacity: number;
      pLevel: number;
      selected: string;
    }) => void;
    snapshot: () => string;
    reset: () => void;
  } | null>(null);
  const settings = { view, show, opacity, pLevel, selected };
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => {
    if (!webglAvailable()) {
      setStatus("nowebgl");
      return;
    }
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      if (disposed || !host.current) return;
      const el = host.current;
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(3, 5, 2);
      scene.add(sun);

      const s = model.scale;
      const meshOf = (grid: typeof model.surface.design, color: number) => {
        const m = surfaceMesh(grid, s);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        g.setIndex(m.indices);
        g.computeVertexNormals();
        const mat = new THREE.MeshPhongMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
          shininess: 30,
        });
        const mesh = new THREE.Mesh(g, mat);
        const wire = new THREE.LineSegments(
          new THREE.WireframeGeometry(g),
          new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.35,
          }),
        );
        return { mesh, wire };
      };
      const design = meshOf(model.surface.design, DESIGN);
      const nominal = meshOf(model.surface.nominal, NOMINAL);
      nominal.mesh.renderOrder = 2;
      design.mesh.renderOrder = 1;
      scene.add(design.mesh, design.wire, nominal.mesh, nominal.wire);
      // Constant-P rings on the design surface for depth perception.
      const rings = new THREE.Group();
      const pLo = Math.min(...model.surface.design.map((r) => r[0]![2])),
        pHi = model.surface.axialCap;
      for (let k = 1; k <= 6; k++) {
        const p = pLo + ((pHi - pLo) * k) / 7;
        const pts = sliceAt(model.surface.design, p).map(
          ([mx, my]) => new THREE.Vector3(...toScene(s, mx, my, p)),
        );
        if (pts.length > 3)
          rings.add(
            new THREE.LineLoop(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({
                color: DESIGN,
                transparent: true,
                opacity: 0.55,
              }),
            ),
          );
      }
      scene.add(rings);

      // Axial cap plane at 0.80·φPo.
      const capY = toScene(s, 0, 0, model.surface.axialCap)[1];
      const cap = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 2.2),
        new THREE.MeshBasicMaterial({
          color: CAP,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = capY;
      scene.add(cap);

      // Axes through the origin (P = 0).
      const y0 = toScene(s, 0, 0, 0)[1];
      const axes = new THREE.Group();
      const axis = (a: [number, number, number], b: [number, number, number]) =>
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...a),
            new THREE.Vector3(...b),
          ]),
          new THREE.LineBasicMaterial({ color: 0x4b5d6b }),
        );
      axes.add(
        axis([-1.15, y0, 0], [1.15, y0, 0]),
        axis([0, y0, -1.15], [0, y0, 1.15]),
        axis([0, -1.1, 0], [0, 1.15, 0]),
      );
      scene.add(axes);

      // Demand points and capacity rays (at constant Pu).
      const points = new THREE.Group();
      const sphere = new THREE.SphereGeometry(0.025, 16, 12);
      const pointMeshes = model.points.map((p) => {
        const m = new THREE.Mesh(
          sphere,
          new THREE.MeshBasicMaterial({ color: p.color }),
        );
        m.position.set(...toScene(s, p.mux, p.muy, p.pu));
        m.userData = p;
        points.add(m);
        if (p.capacity) {
          const from = toScene(s, 0, 0, p.pu),
            to = toScene(s, p.capacity.mx, p.capacity.my, p.pu);
          const ray = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(...from),
              new THREE.Vector3(...to),
            ]),
            new THREE.LineDashedMaterial({
              color: p.color,
              dashSize: 0.03,
              gapSize: 0.02,
            }),
          );
          ray.computeLineDistances();
          ray.userData = { ray: p.id };
          points.add(ray);
        }
        return m;
      });
      scene.add(points);

      // Mx–My slice at P (design solid, nominal dashed).
      const slice = new THREE.Group();
      scene.add(slice);
      const drawSlice = (p: number) => {
        slice.clear();
        const on = latest.current.show;
        for (const [grid, color, dashed] of [
          ...(on.design ? [[model.surface.design, DESIGN, false] as const] : []),
          ...(on.nominal
            ? [[model.surface.nominal, NOMINAL, true] as const]
            : []),
        ]) {
          const pts = sliceAt(grid, p).map(
            ([mx, my]) => new THREE.Vector3(...toScene(s, mx, my, p)),
          );
          if (pts.length < 3) continue;
          const line = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(pts),
            dashed
              ? new THREE.LineDashedMaterial({
                  color,
                  dashSize: 0.04,
                  gapSize: 0.03,
                })
              : new THREE.LineBasicMaterial({ color }),
          );
          if (dashed) line.computeLineDistances();
          slice.add(line);
        }
      };

      const size = () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        renderer.setSize(w, h, false);
        const a = w / Math.max(h, 1);
        camera.left = -1.6 * a;
        camera.right = 1.6 * a;
        camera.top = 1.6;
        camera.bottom = -1.6;
        camera.updateProjectionMatrix();
      };
      const labelsOn = () => latest.current.show.labels;
      const render = () => {
        renderer.render(scene, camera);
        // HTML overlay labels: axis ends and the governing / selected point.
        const o = overlay.current;
        if (!o) return;
        const put = (key: string, v: [number, number, number], text: string) => {
          let span = o.querySelector<HTMLSpanElement>(`[data-k="${key}"]`);
          if (!span) {
            span = document.createElement("span");
            span.dataset.k = key;
            o.appendChild(span);
          }
          const p = new THREE.Vector3(...v).project(camera);
          span.style.left = `${((p.x + 1) / 2) * el.clientWidth}px`;
          span.style.top = `${((1 - p.y) / 2) * el.clientHeight}px`;
          span.textContent = text;
        };
        o.replaceChildren();
        const v = latest.current.view;
        if (v !== "pmy") put("mx", [1.2, y0, 0], "Mx (kN·m)");
        if (v !== "pmx") put("my", [0, y0, 1.2], "My (kN·m)");
        if (v !== "mxmy") put("p", [0, 1.2, 0], "P (kN, compression +)");
        if (labelsOn()) {
          put("pmax", [0, 1, 0], `${fmt(s.pMax, 0)}`);
          put("pmin", [0, -1, 0], `${fmt(s.pMin, 0)}`);
          put("m", [1, y0, 0], `${fmt(s.m, 0)}`);
        }
        const sel = model.points.find((p) => p.id === latest.current.selected);
        if (sel)
          put(
            "sel",
            toScene(s, sel.mux, sel.muy, sel.pu),
            `${sel.id} · DCR ${fmt(sel.dcr, 3)}`,
          );
      };
      controls.addEventListener("change", render);

      const apply = (o: {
        view: View3D;
        show: Show;
        opacity: number;
        pLevel: number;
        selected: string;
      }) => {
        design.mesh.visible = o.show.design && !o.show.wire;
        design.wire.visible = o.show.design && o.show.wire;
        rings.visible = o.show.design && !o.show.wire && o.view !== "mxmy";
        nominal.mesh.visible = o.show.nominal && !o.show.wire;
        nominal.wire.visible = o.show.nominal && o.show.wire;
        for (const m of [design.mesh, nominal.mesh])
          (m.material as MeshPhongMaterial).opacity =
            m === nominal.mesh ? o.opacity * 0.7 : o.opacity;
        cap.visible = o.show.cap;
        points.visible = o.show.points;
        for (const m of pointMeshes)
          m.scale.setScalar(
            m.userData.id === o.selected || m.userData.governing ? 1.8 : 1,
          );
        slice.visible = o.view === "mxmy";
        if (o.view === "mxmy") drawSlice(o.pLevel);
        render();
      };
      const setCamera = (v: View3D) => {
        const c = cameraFor(v);
        camera.position.set(...c.position);
        camera.up.set(...c.up);
        camera.zoom = 1;
        controls.target.set(0, 0, 0);
        controls.enableRotate = v === "iso";
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        controls.update();
      };
      let lastView: View3D | null = null;
      api.current = {
        apply: (o) => {
          if (o.view !== lastView) {
            setCamera(o.view);
            lastView = o.view;
          }
          apply(o);
        },
        snapshot: () => {
          render();
          return renderer.domElement.toDataURL("image/png");
        },
        reset: () => {
          setCamera(lastView ?? "iso");
          render();
        },
      };

      // Hover readout: demand points first, then the design surface.
      const ray = new THREE.Raycaster();
      const onMove = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            -((e.clientY - r.top) / r.height) * 2 + 1,
          ),
          camera,
        );
        const hitP = latest.current.show.points
          ? ray.intersectObjects(pointMeshes)[0]
          : undefined;
        if (hitP) {
          const p = hitP.object.userData;
          setHover(
            `${p.id}: Pu ${fmt(p.pu, 1)} kN · Mux ${fmt(p.mux, 1)} · Muy ${fmt(p.muy, 1)} kN·m · DCR ${fmt(p.dcr, 3)} (${p.status})`,
          );
          return;
        }
        const target = [design.mesh, nominal.mesh].filter((m) => m.visible);
        const hit = ray.intersectObjects(target)[0];
        if (hit) {
          const v = hit.point;
          setHover(
            `${hit.object === design.mesh ? "Design (φ)" : "Nominal"} surface: Mx ${fmt(v.x * s.m, 1)} · My ${fmt(v.z * s.m, 1)} kN·m · P ${fmt(fromSceneP(s, v.y), 1)} kN`,
          );
        } else setHover("");
      };
      renderer.domElement.addEventListener("pointermove", onMove);
      const onDbl = () => api.current?.reset();
      renderer.domElement.addEventListener("dblclick", onDbl);
      const ro = new ResizeObserver(() => {
        size();
        render();
      });
      ro.observe(el);
      size();
      setCamera(latest.current.view);
      lastView = latest.current.view;
      apply(latest.current);
      setStatus("ready");
      cleanup = () => {
        ro.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("dblclick", onDbl);
        scene.traverse((o) => {
          const any = o as unknown as {
            geometry?: { dispose: () => void };
            material?: { dispose: () => void };
          };
          any.geometry?.dispose();
          any.material?.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
        api.current = null;
      };
    })().catch(() => setStatus("nowebgl"));
    return () => {
      disposed = true;
      cleanup();
    };
  }, [model]);

  useEffect(() => {
    api.current?.apply({ view, show, opacity, pLevel, selected });
  }, [view, show, opacity, pLevel, selected, status]);

  const toggle = (k: keyof Show) => setShow((v) => ({ ...v, [k]: !v[k] }));
  const sel = model.points.find((p) => p.id === selected);
  const pRange = {
    min: Math.floor(model.scale.pMin),
    max: Math.ceil(model.surface.axialCap),
  };
  return (
    <section
      className={`rcPanel interaction3d ${full ? "isFull" : ""}`}
      aria-label="3D interaction surface"
    >
      <div className="i3dHead">
        <h3>3D Interaction Surface (P–Mx–My)</h3>
        <div className="i3dViews" role="group" aria-label="View">
          {(
            [
              ["iso", "3D"],
              ["pmx", "P–Mx"],
              ["pmy", "P–My"],
              ["mxmy", "Mx–My"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={view === v ? "isActive" : ""}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => api.current?.reset()}>
            Reset
          </button>
          <button type="button" onClick={() => setFull((f) => !f)}>
            {full ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            disabled={status !== "ready"}
            onClick={() => {
              const url = api.current?.snapshot();
              if (!url) return;
              const a = document.createElement("a");
              a.href = url;
              a.download = "interaction-surface.png";
              document.body.appendChild(a);
              a.click();
              a.remove();
            }}
          >
            PNG
          </button>
        </div>
      </div>
      <div className="i3dControls">
        <fieldset>
          <legend>Show</legend>
          {(
            [
              ["design", "Design surface (φ)"],
              ["nominal", "Nominal surface"],
              ["cap", "Axial cap 0.80φPo"],
              ["points", "Load points"],
              ["wire", "Wireframe"],
              ["labels", "Labels"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="rcCheckbox">
              <input
                type="checkbox"
                checked={show[k]}
                onChange={() => toggle(k)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label>
          Opacity {Math.round(opacity * 100)}%
          <input
            type="range"
            min={0.1}
            max={0.8}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
        </label>
        <label>
          Combination
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const p = model.points.find((x) => x.id === e.target.value);
              if (p) setPLevel(p.pu);
            }}
          >
            {model.points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
                {p.governing ? " (governing)" : ""} · DCR {fmt(p.dcr, 3)}
              </option>
            ))}
          </select>
        </label>
        {view === "mxmy" ? (
          <label>
            P level {fmt(pLevel, 0)} kN
            <input
              type="range"
              min={pRange.min}
              max={pRange.max}
              step={Math.max(1, (pRange.max - pRange.min) / 200)}
              value={pLevel}
              onChange={(e) => setPLevel(Number(e.target.value))}
            />
          </label>
        ) : null}
      </div>
      <div className="i3dStage">
        <div ref={host} className="i3dCanvas" />
        <div ref={overlay} className="i3dLabels" aria-hidden="true" />
        {status === "loading" ? (
          <p className="i3dNote">Loading 3D view…</p>
        ) : status === "nowebgl" ? (
          <p className="i3dNote">
            3D graphics (WebGL) are not available in this browser. Use the
            P–Mx, P–My and Mx–My diagrams below.
          </p>
        ) : null}
      </div>
      <p className="i3dReadout" role="status">
        {hover ||
          (sel
            ? `${sel.id}: Pu ${fmt(sel.pu, 1)} kN · Mux ${fmt(sel.mux, 1)} · Muy ${fmt(sel.muy, 1)} kN·m · capacity on the load ray ${sel.capacity ? fmt(Math.hypot(sel.capacity.mx, sel.capacity.my), 1) : "—"} kN·m · DCR ${fmt(sel.dcr, 3)} (${sel.status})`
            : "Hover a point or the surface for values.")}
      </p>
      <p className="rcLegend">
        Teal: design strength φPn–φMnx–φMny (cap 0.80φPo) · Gray: nominal
        strength · Points: factored demands (magnified when slenderness is
        on), coloured by status; dashed: capacity ray at constant Pu · Drag to
        rotate (3D view), right-drag to pan, wheel to zoom, double-click to
        reset. ACI 318-19 22.2, 22.4, Table 21.2.2.
      </p>
    </section>
  );
}
