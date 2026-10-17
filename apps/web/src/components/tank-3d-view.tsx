"use client";
/**
 * Underground tank 3D view (three.js, loaded only with the 3D tab): walls,
 * base, roof, liquid, soil and groundwater, with the factored outside-face
 * vertical moment mapped on the two near outer walls.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TankInput, TankResult } from "@nola/calc-core";

import { buildTank3DModel, type Tank3DModel, type TankBox } from "@/lib/tank-3d-model";
import { rampColor } from "@/lib/retaining-wall-elevation";
import { watercolorConcretePixels } from "@/lib/slab-3d-model";

type View = "iso" | "section" | "plan";
/** Engineering (x, y, z up) → three.js (x, y up, z). */
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

let concreteTexture: THREE.CanvasTexture | null = null;
function concrete() {
  if (concreteTexture) return concreteTexture;
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.putImageData(new ImageData(watercolorConcretePixels(size, 7), size, size), 0, 0);
  concreteTexture = new THREE.CanvasTexture(canvas);
  concreteTexture.wrapS = concreteTexture.wrapT = THREE.RepeatWrapping;
  concreteTexture.colorSpace = THREE.SRGBColorSpace;
  return concreteTexture;
}
function boxMesh(b: TankBox) {
  const geo = new THREE.BoxGeometry(b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0);
  let mat: THREE.Material;
  if (b.kind === "concrete" || b.kind === "roof") {
    const map = concrete().clone();
    map.needsUpdate = true;
    map.repeat.set(0.4, 0.4);
    mat = new THREE.MeshStandardMaterial({ map, color: b.kind === "roof" ? 0xe6e2da : 0xffffff, roughness: 0.95, transparent: b.kind === "roof", opacity: b.kind === "roof" ? 0.85 : 1 });
  } else if (b.kind === "liquid") mat = new THREE.MeshStandardMaterial({ color: 0x3f86c9, transparent: true, opacity: 0.45, depthWrite: false });
  else if (b.kind === "water") mat = new THREE.MeshStandardMaterial({ color: 0x2d7fd3, transparent: true, opacity: 0.12, depthWrite: false });
  else mat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, transparent: true, opacity: 0.2, roughness: 1, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(v3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2));
  if (b.kind === "concrete" || b.kind === "roof")
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3d4a55, transparent: true, opacity: 0.6 })));
  return m;
}
function buildGroups(model: Tank3DModel) {
  const concreteG = new THREE.Group(),
    roof = new THREE.Group(),
    liquid = new THREE.Group(),
    soil = new THREE.Group(),
    moments = new THREE.Group();
  for (const b of model.boxes) {
    const m = boxMesh(b);
    (b.kind === "roof" ? roof : b.kind === "liquid" ? liquid : b.kind === "soil" || b.kind === "water" ? soil : concreteG).add(m);
  }
  if (model.vmax > 0)
    for (const mp of model.maps) {
      const pos: number[] = [],
        col: number[] = [],
        idx: number[] = [];
      for (let a = 0; a <= mp.nu; a++)
        for (let b = 0; b <= mp.nv; b++) {
          const s = (mp.lu * a) / mp.nu,
            t = (mp.lv * b) / mp.nv;
          const p = v3(mp.origin[0] + mp.u[0] * s + mp.v[0] * t, mp.origin[1] + mp.u[1] * s + mp.v[1] * t, mp.origin[2] + mp.u[2] * s + mp.v[2] * t);
          pos.push(p.x, p.y, p.z);
          const c = new THREE.Color(rampColor(mp.values[a]![b]! / model.vmax));
          col.push(c.r, c.g, c.b);
        }
      for (let a = 0; a < mp.nu; a++)
        for (let b = 0; b < mp.nv; b++) {
          const k = a * (mp.nv + 1) + b;
          idx.push(k, k + mp.nv + 1, k + 1, k + 1, k + mp.nv + 1, k + mp.nv + 2);
        }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geom.setIndex(idx);
      moments.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
  return { concrete: concreteG, roof, liquid, soil, moments };
}

export default function Tank3DView({ input, result, onSnapshot }: { input: TankInput; result: TankResult; onSnapshot?: (png: string) => void }) {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; groups: ReturnType<typeof buildGroups> | null; render: () => void } | null>(null);
  const [error, setError] = useState(""),
    [view, setView] = useState<View>("iso"),
    [show, setShow] = useState({ roof: true, liquid: true, soil: true, moments: true }),
    [note, setNote] = useState("");
  const model = useMemo(() => {
    try {
      return buildTank3DModel(input, result);
    } catch {
      return null;
    }
  }, [input, result]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError("3D view needs WebGL, which this browser or device does not provide. The section and plan remain available.");
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
    for (const [k, g] of Object.entries(s.groups)) {
      s.scene.add(g);
      if (k in show) g.visible = show[k as keyof typeof show];
    }
    s.render();
  }, [model]);
  useEffect(() => {
    const s = stage.current;
    if (!s || !model) return;
    const [cx, cy, cz] = model.center,
      target = v3(cx, cy, cz),
      d = model.extent * 1.3;
    const offset = view === "section" ? v3(0, -d, 0.05) : view === "plan" ? v3(0, 0.001, d) : v3(-d * 0.55, -d * 0.75, d * 0.5);
    s.camera.position.copy(target.clone().add(offset));
    s.camera.near = model.extent / 500;
    s.camera.far = model.extent * 50;
    s.camera.updateProjectionMatrix();
    s.controls.target.copy(target);
    s.controls.update();
    s.render();
  }, [view, model?.extent]);
  useEffect(() => {
    const s = stage.current;
    if (!s?.groups) return;
    for (const k of Object.keys(show) as (keyof typeof show)[]) s.groups[k].visible = show[k];
    s.render();
  }, [show]);
  if (!model) return <p className="slabMuted">Complete valid inputs to view the tank in 3D.</p>;
  return (
    <figure className="slab3d" aria-label="3D underground tank view">
      <div className="slabViewButtons">
        {(
          [
            ["iso", "Isometric"],
            ["section", "Section"],
            ["plan", "Plan"],
          ] as const
        ).map(([v, t]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {t}
          </button>
        ))}
        {(["roof", "liquid", "soil", "moments"] as const).map((k) => (
          <label key={k} className="slab3dToggle">
            <input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{" "}
            {k === "roof" ? "Roof" : k === "liquid" ? "Liquid" : k === "soil" ? "Soil & groundwater" : "Moment map"}
          </label>
        ))}
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
        True scale. Colour on the near long and short walls: factored outside-face vertical moment (Wood–Armer), 0 to {model.vmax.toFixed(1)} kN·m/m. Drag to
        rotate, right-drag to pan, scroll to zoom.{note && ` ${note}`}
      </figcaption>
    </figure>
  );
}
