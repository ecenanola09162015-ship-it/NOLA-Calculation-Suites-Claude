"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RetainingWallInput, RetainingWallResult } from "@nola/calc-core";

import {
  buildRetainingWall3DModel,
  type Prism,
  type RetainingWall3DModel,
} from "@/lib/retaining-wall-3d-model";
import { watercolorConcretePixels } from "@/lib/slab-3d-model";
import { RW_COLORS } from "@/lib/retaining-wall-drawing";
import { rampColor } from "@/lib/retaining-wall-elevation";

type View = "iso" | "section" | "front" | "back" | "plan";
/** Engineering (x across, y along the wall, z up) → three.js (x, y up, z). */
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

let concreteTexture: THREE.CanvasTexture | null = null;
function concrete() {
  if (concreteTexture) return concreteTexture;
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas
    .getContext("2d")!
    .putImageData(new ImageData(watercolorConcretePixels(size, 11), size, size), 0, 0);
  concreteTexture = new THREE.CanvasTexture(canvas);
  concreteTexture.wrapS = concreteTexture.wrapT = THREE.RepeatWrapping;
  concreteTexture.colorSpace = THREE.SRGBColorSpace;
  return concreteTexture;
}
function prismMesh(p: Prism) {
  const shape = new THREE.Shape(p.polygon.map((q) => new THREE.Vector2(q.x, q.z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: p.y1 - p.y0, bevelEnabled: false });
  let material: THREE.Material;
  if (p.kind === "concrete" || p.kind === "slab") {
    const map = concrete().clone();
    map.needsUpdate = true;
    map.repeat.set(0.4, 0.4);
    material = new THREE.MeshStandardMaterial({ map, color: p.kind === "slab" ? 0xe6e2da : 0xffffff, roughness: 0.95 });
  } else if (p.kind === "soil")
    material = new THREE.MeshStandardMaterial({ color: 0xc9a46a, transparent: true, opacity: 0.22, roughness: 1, depthWrite: false });
  else if (p.kind === "water")
    material = new THREE.MeshStandardMaterial({ color: 0x2d7fd3, transparent: true, opacity: 0.3, depthWrite: false });
  else material = new THREE.MeshStandardMaterial({ color: 0x8a96a3, metalness: 0.4, roughness: 0.5 });
  const mesh = new THREE.Mesh(geometry, material);
  // Extrusion runs along three +z = engineering −y; place it over [y0, y1].
  mesh.position.set(0, 0, -p.y1);
  if (p.kind === "concrete" || p.kind === "slab")
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 20),
        new THREE.LineBasicMaterial({ color: 0x3d4a55, transparent: true, opacity: 0.6 }),
      ),
    );
  return mesh;
}
function buildGroups(model: RetainingWall3DModel) {
  const concreteG = new THREE.Group(),
    soil = new THREE.Group(),
    water = new THREE.Group(),
    pressures = new THREE.Group(),
    moments = new THREE.Group();
  const mm = model.momentMap;
  if (mm && mm.vmax > 0) {
    // Vertex-coloured surface just behind the stem back face.
    const pos: number[] = [],
      col: number[] = [],
      idx: number[] = [];
    for (let a = 0; a <= mm.nx; a++)
      for (let b = 0; b <= mm.nz; b++) {
        const z = mm.z0 + ((mm.z1 - mm.z0) * b) / mm.nz,
          y = (model.length * a) / mm.nx,
          p = v3(mm.faceX(z) + 0.004, y, z);
        pos.push(p.x, p.y, p.z);
        const c = new THREE.Color(rampColor(mm.values[a]![b]! / mm.vmax));
        col.push(c.r, c.g, c.b);
      }
    for (let a = 0; a < mm.nx; a++)
      for (let b = 0; b < mm.nz; b++) {
        const k = a * (mm.nz + 1) + b;
        idx.push(k, k + mm.nz + 1, k + 1, k + 1, k + mm.nz + 1, k + mm.nz + 2);
      }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    moments.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }
  for (const p of model.prisms) {
    const m = prismMesh(p);
    (p.kind === "soil" ? soil : p.kind === "water" ? water : concreteG).add(m);
  }
  // Solid arrows (shaft + cone) pointing from the backfill to the stem.
  const r0 = Math.max(0.012, model.extent * 0.0016);
  for (const a of model.arrows) {
    const color = new THREE.Color(RW_COLORS.pressure[a.component] ?? "#555555");
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const head = Math.min(a.length * 0.4, r0 * 9);
    const shaftLen = Math.max(0, a.length - head);
    const arrow = new THREE.Group();
    if (shaftLen > 0) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, shaftLen, 10), mat);
      shaft.position.set(0, head + shaftLen / 2, 0);
      arrow.add(shaft);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r0 * 3, head, 14), mat);
    cone.rotation.x = Math.PI;
    cone.position.set(0, head / 2, 0);
    arrow.add(cone);
    // Local +y (tail direction) → engineering +x; the tip sits on the stem face.
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.copy(v3(a.x, a.y, a.z));
    pressures.add(arrow);
  }
  const loadColors: Record<string, string> = {
    surchargeDead: RW_COLORS.pressure.surchargeDead!,
    surchargeLive: RW_COLORS.pressure.surchargeLive!,
    strip: "#6b3fa0",
    axial: "#c0392b",
    wind: "#0e7c86",
  };
  for (const a of model.loads) {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(loadColors[a.kind] ?? "#555"), roughness: 0.6 });
    const head = a.length * 0.3,
      arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.8, r0 * 0.8, a.length - head, 8), mat);
    shaft.position.set(0, head + (a.length - head) / 2, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r0 * 2.6, head, 12), mat);
    cone.rotation.x = Math.PI;
    cone.position.set(0, head / 2, 0);
    arrow.add(shaft, cone);
    // Local +y = tail: "down" keeps the tail up; "toe" points the tip towards −x.
    if (a.direction === "toe") arrow.rotation.z = -Math.PI / 2;
    arrow.position.copy(v3(a.x, a.y, a.z));
    pressures.add(arrow);
  }
  return { concrete: concreteG, soil, water, pressures, moments };
}
function frame(camera: THREE.PerspectiveCamera, controls: OrbitControls, model: RetainingWall3DModel, view: View) {
  const c = model.center,
    target = v3(c.x, c.y, c.z),
    d = model.extent * 1.25;
  const offset =
    view === "section"
      ? v3(0, -d, 0.05)
      : view === "front"
        ? v3(-d, 0, d * 0.12)
        : view === "back"
          ? v3(d, 0, d * 0.35)
          : view === "plan"
            ? v3(0, 0.001, d)
            : v3(d * 0.6, -d * 0.72, d * 0.48); // from the backfill side: pressure arrows in view
  camera.position.copy(target.clone().add(offset));
  camera.near = model.extent / 500;
  camera.far = model.extent * 50;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

export default function RetainingWall3DView({
  input,
  result,
  onSnapshot,
}: {
  input: RetainingWallInput;
  result: RetainingWallResult;
  onSnapshot?: (png: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<{
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      groups: ReturnType<typeof buildGroups> | null;
      render: () => void;
    } | null>(null);
  const [error, setError] = useState(""),
    [view, setView] = useState<View>("iso"),
    [length, setLength] = useState(5),
    [show, setShow] = useState({ soil: true, water: true, pressures: true, moments: true }),
    [note, setNote] = useState("");
  const model = useMemo(() => {
    try {
      return buildRetainingWall3DModel(input, result, length);
    } catch {
      return null;
    }
  }, [input, result, length]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError("3D view needs WebGL, which this browser or device does not provide. The section view remains available.");
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f4ee);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c6, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-6, 10, 7);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000),
      controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth || 600,
        h = Math.max(300, Math.min(540, w * 0.62));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    stage.current = { renderer, scene, camera, controls, groups: null, render };
    resize();
    return () => {
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);
  useEffect(() => {
    const s = stage.current;
    if (!s || !model) return;
    if (s.groups)
      for (const g of Object.values(s.groups)) {
        s.scene.remove(g);
        g.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
      }
    s.groups = buildGroups(model);
    for (const g of Object.values(s.groups)) s.scene.add(g);
    s.groups.soil.visible = show.soil;
    s.groups.water.visible = show.water;
    s.groups.pressures.visible = show.pressures;
    s.groups.moments.visible = show.moments;
    s.render();
  }, [model]);
  useEffect(() => {
    const s = stage.current;
    if (!s || !model) return;
    frame(s.camera, s.controls, model, view);
    s.render();
  }, [view, model?.extent]);
  useEffect(() => {
    const s = stage.current;
    if (!s?.groups) return;
    s.groups.soil.visible = show.soil;
    s.groups.water.visible = show.water;
    s.groups.pressures.visible = show.pressures;
    s.groups.moments.visible = show.moments;
    s.render();
  }, [show]);
  if (!model) return <p className="slabMuted">Complete valid inputs to view the wall in 3D.</p>;
  const comps = result.stem.components.filter((c) => c.id !== "inertia" && c.force > 0);
  return (
    <figure className="slab3d" aria-label="3D retaining wall view with earth pressure">
      <div className="slabViewButtons">
        {(
          [
            ["iso", "Isometric"],
            ["section", "Section"],
            ["front", "Front"],
            ["back", "Back (backfill)"],
            ["plan", "Plan"],
          ] as const
        ).map(([v, t]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {t}
          </button>
        ))}
        {(["soil", "water", "pressures", ...(model.momentMap ? (["moments"] as const) : [])] as const).map((k) => (
          <label key={k} className="slab3dToggle">
            <input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{" "}
            {k === "soil" ? "Backfill" : k === "water" ? "Water" : k === "moments" ? "Moment map" : "Pressure"}
          </label>
        ))}
        {!result.plate && (
        <label className="slab3dToggle">
          Length{" "}
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            value={length}
            style={{ width: "4.5em" }}
            onChange={(e) => setLength(Math.min(50, Math.max(1, Number(e.target.value) || 5)))}
          />{" "}
          m
        </label>
        )}
        {onSnapshot && (
          <button
            className="suiteSecondary"
            disabled={!!error}
            onClick={() => {
              const s = stage.current;
              if (!s) return;
              s.render();
              onSnapshot(s.renderer.domElement.toDataURL("image/png"));
              setNote("3D view added to the Complete PDF report.");
            }}
          >
            Add 3D view to report
          </button>
        )}
      </div>
      {error ? <p className="slabError">{error}</p> : <div ref={host} className="slab3dCanvas" />}
      <figcaption className="slabMuted">
        {result.plate
          ? `True scale, full wall L = ${result.plate.length} m; the colour map on the back face shows the factored Wood–Armer back-face moment (vertical + horizontal).`
          : `True scale, 1 m strip extruded to ${length} m for display.`} Drag to rotate, right-drag to pan, scroll to zoom. Arrows show service
        pressure on the stem, scaled to the largest value
        {comps.length > 0 &&
          `: ${comps.map((c) => `${c.label.toLowerCase()} (${c.base.toFixed(1)} kPa at base)`).join(", ")}`}
        .{note && ` ${note}`}
      </figcaption>
    </figure>
  );
}
