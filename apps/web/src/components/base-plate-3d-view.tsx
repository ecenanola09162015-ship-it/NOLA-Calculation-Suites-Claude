"use client";
/**
 * Base plate 3D view (display only), same system as the Slab 3D tab:
 * three.js loaded only with this tab, watercolour concrete, ink outlines,
 * preset views and a PNG snapshot for the Complete PDF report.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BasePlateInput, ComboResult } from "@nola/calc-core";

import {
  buildBasePlate3DModel,
  type BasePlate3DModel,
  type Box3,
} from "@/lib/base-plate-3d-model";
import { watercolorConcretePixels } from "@/lib/slab-3d-model";

type View = "iso" | "plan" | "front" | "side";
/** Engineering (x east, y north, z up) → three.js (x, y up, z south). */
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

let concreteTexture: THREE.CanvasTexture | null = null;
function concrete() {
  if (concreteTexture) return concreteTexture;
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas
    .getContext("2d")!
    .putImageData(
      new ImageData(watercolorConcretePixels(size, 11), size, size),
      0,
      0,
    );
  concreteTexture = new THREE.CanvasTexture(canvas);
  concreteTexture.wrapS = concreteTexture.wrapT = THREE.RepeatWrapping;
  concreteTexture.colorSpace = THREE.SRGBColorSpace;
  return concreteTexture;
}
function box(b: Box3, material: THREE.Material, outline = 0x3d4a55) {
  const geometry = new THREE.BoxGeometry(b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(
    v3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2),
  );
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: outline,
        transparent: true,
        opacity: 0.6,
      }),
    ),
  );
  return mesh;
}
function label(text: string, color: string, height: number) {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!,
    px = 44;
  ctx.font = `600 ${px}px Arial, sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.height = px + 20;
  ctx.font = `600 ${px}px Arial, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, canvas.height / 2);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, depthTest: false }),
  );
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}
function extrudeOutline(
  outer: [number, number][],
  inner: [number, number][] | null,
  z0: number,
  z1: number,
  material: THREE.Material,
) {
  // Shape in the engineering plan (x, y); extrude along +z then map to three.js.
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  if (inner)
    shape.holes.push(
      new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))),
    );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: z1 - z0,
    bevelEnabled: false,
    curveSegments: 24,
  });
  // (x, y, z) → three (x, z, −y): rotate −90° about X, then lift to z0.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, z0, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 20),
      new THREE.LineBasicMaterial({
        color: 0x1f2933,
        transparent: true,
        opacity: 0.7,
      }),
    ),
  );
  return mesh;
}
function cylinder(
  x: number,
  y: number,
  z0: number,
  z1: number,
  r: number,
  material: THREE.Material,
  segments = 16,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, z1 - z0, segments),
    material,
  );
  mesh.position.copy(v3(x, y, (z0 + z1) / 2));
  return mesh;
}

function buildGroups(model: BasePlate3DModel) {
  const concreteG = new THREE.Group(),
    steel = new THREE.Group(),
    rods = new THREE.Group(),
    loads = new THREE.Group(),
    labels = new THREE.Group(),
    cones = new THREE.Group();
  const map = concrete().clone();
  map.needsUpdate = true;
  const concreteMat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.95,
    transparent: true,
    opacity: 1,
  });
  concreteG.add(box(model.pedestal, concreteMat));
  if (model.grout)
    concreteG.add(
      box(
        model.grout,
        new THREE.MeshStandardMaterial({
          color: 0xd8d1c0,
          roughness: 0.9,
          transparent: true,
          opacity: 1,
        }),
      ),
    );
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x9fb0c0,
    roughness: 0.45,
    metalness: 0.35,
  });
  // Plate with holes: extruded rectangle with circular holes.
  const p = model.plate;
  const shape = new THREE.Shape([
    new THREE.Vector2(p.x0, p.y0),
    new THREE.Vector2(p.x1, p.y0),
    new THREE.Vector2(p.x1, p.y1),
    new THREE.Vector2(p.x0, p.y1),
  ]);
  for (const h of model.holes) {
    const path = new THREE.Path();
    path.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const pg = new THREE.ExtrudeGeometry(shape, {
    depth: p.z1 - p.z0,
    bevelEnabled: false,
    curveSegments: 20,
  });
  pg.rotateX(-Math.PI / 2);
  pg.translate(0, p.z0, 0);
  const plate = new THREE.Mesh(pg, plateMat);
  plate.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(pg, 25),
      new THREE.LineBasicMaterial({ color: 0x24313f }),
    ),
  );
  steel.add(plate);
  const colMat = new THREE.MeshStandardMaterial({
    color: 0x6f7f8f,
    roughness: 0.5,
    metalness: 0.4,
  });
  steel.add(
    extrudeOutline(
      model.column.outer,
      model.column.inner,
      model.column.z0,
      model.column.z1,
      colMat,
    ),
  );
  for (const l of model.lug) steel.add(box(l, colMat, 0x1f2933));
  for (const sp of model.stiffeners) {
    // Profile in the stiffener plane (u along its axis, z up), extruded by t.
    const sh = new THREE.Shape(
      sp.profile.map(([u, z]) => new THREE.Vector2(u, z)),
    );
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: sp.t,
      bevelEnabled: false,
    });
    // (u, z, e) → three (X, Y up, Z = −north).
    const m = new THREE.Matrix4();
    if (sp.axis === "x")
      m.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -sp.pos - sp.t / 2, 0, 0, 0, 1);
    else m.set(0, 0, 1, sp.pos - sp.t / 2, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);
    g.applyMatrix4(m);
    const mesh = new THREE.Mesh(g, colMat);
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(g, 20),
        new THREE.LineBasicMaterial({ color: 0x1f2933 }),
      ),
    );
    steel.add(mesh);
  }
  const washerMat = new THREE.MeshStandardMaterial({
    color: 0x7c8894,
    roughness: 0.5,
    metalness: 0.4,
  });
  for (const w of model.washers) steel.add(box(w, washerMat, 0x24313f));
  const nutMat = new THREE.MeshStandardMaterial({
    color: 0x3b444e,
    roughness: 0.5,
    metalness: 0.5,
  });
  for (const n of model.nuts)
    steel.add(cylinder(n.x, n.y, n.z0, n.z1, n.f / Math.sqrt(3), nutMat, 6));
  const rodMat = new THREE.MeshStandardMaterial({
      color: 0x2b3440,
      roughness: 0.4,
      metalness: 0.6,
    }),
    tensionMat = new THREE.MeshStandardMaterial({
      color: 0xc62828,
      roughness: 0.4,
      metalness: 0.3,
    }),
    adhesiveMat = new THREE.MeshStandardMaterial({
      color: 0xf2c94c,
      transparent: true,
      opacity: 0.55,
    });
  const text = Math.max(0.03, model.extent * 0.04);
  for (const r of model.rods) {
    const m = r.tension > 0 ? tensionMat : rodMat;
    rods.add(cylinder(r.x, r.y, r.z0, r.z1, r.r, m));
    if (r.head === "hook") {
      const hook = cylinder(0, 0, 0, r.hook, r.r, m);
      hook.rotation.set(0, 0, 0);
      const dir = v3(r.hookDir.x, r.hookDir.y, 0).normalize();
      hook.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      hook.position.copy(
        v3(r.x, r.y, r.z0).add(dir.clone().multiplyScalar(r.hook / 2)),
      );
      rods.add(hook);
    }
    if (r.head === "adhesive")
      rods.add(cylinder(r.x, r.y, r.z0, 0, r.r * 1.35, adhesiveMat));
    if (r.head === "expansion")
      rods.add(cylinder(r.x, r.y, r.z0, r.z0 + r.r * 6, r.r * 1.3, nutMat));
    if (r.tension > 0) {
      const s = label(
        `${r.id} T ${(r.tension / 1e3).toFixed(1)} kN`,
        "#c62828",
        text * 0.7,
      );
      s.position.copy(v3(r.x, r.y, r.z1 + text));
      labels.add(s);
    }
  }
  // Breakout prisms (projected 1.5 h′ef) for tensioned rods.
  for (const c of model.cones) {
    const top = [
      [c.x0 - c.spread, c.y0 - c.spread],
      [c.x1 + c.spread, c.y0 - c.spread],
      [c.x1 + c.spread, c.y1 + c.spread],
      [c.x0 - c.spread, c.y1 + c.spread],
    ].map(([x, y]) => [
      Math.max(model.pedestal.x0, Math.min(model.pedestal.x1, x!)),
      Math.max(model.pedestal.y0, Math.min(model.pedestal.y1, y!)),
    ]);
    const bot = [
      [c.x0, c.y0],
      [c.x1, c.y0],
      [c.x1, c.y1],
      [c.x0, c.y1],
    ];
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 4; k++) {
      const a = top[k]!,
        b = top[(k + 1) % 4]!,
        d = bot[k]!,
        e = bot[(k + 1) % 4]!;
      pts.push(
        v3(a[0]!, a[1]!, 0.001),
        v3(b[0]!, b[1]!, 0.001),
        v3(d[0]!, d[1]!, -c.hef),
        v3(e[0]!, e[1]!, -c.hef),
        v3(a[0]!, a[1]!, 0.001),
        v3(d[0]!, d[1]!, -c.hef),
      );
    }
    cones.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: 0xc62828,
          transparent: true,
          opacity: 0.8,
        }),
      ),
    );
  }
  for (const a of model.arrows) {
    const color = new THREE.Color(a.color);
    const dir = v3(a.dir[0], a.dir[1], a.dir[2]).normalize();
    const tip = v3(...a.tip);
    const start = tip.clone().sub(dir.clone().multiplyScalar(a.length));
    const arrow = new THREE.ArrowHelper(
      dir,
      start,
      a.length,
      color,
      a.length * 0.22,
      a.length * 0.12,
    );
    loads.add(arrow);
    const s = label(a.label, a.color, text * 0.8);
    s.position.copy(start.clone().add(new THREE.Vector3(0, text * 0.8, 0)));
    labels.add(s);
  }
  for (const m of model.moments) {
    const curve = new THREE.EllipseCurve(
      0,
      0,
      m.radius,
      m.radius,
      0.2,
      Math.PI * 1.5,
      m.sign < 0,
      0,
    );
    const pts2 = curve.getPoints(40);
    // Moment about X: arc in the y-z plane; about Y: in the x-z plane.
    const pts = pts2.map((q) =>
      m.axis === "x"
        ? v3(0, q.x, m.centre[2] + q.y)
        : v3(q.x, 0, m.centre[2] + q.y),
    );
    loads.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x7c3aed }),
      ),
    );
    const end = pts[pts.length - 1]!,
      prev = pts[pts.length - 4]!;
    const dir = end.clone().sub(prev).normalize();
    loads.add(
      new THREE.ArrowHelper(
        dir,
        prev,
        end.distanceTo(prev) * 1.6,
        0x7c3aed,
        m.radius * 0.25,
        m.radius * 0.15,
      ),
    );
    const s = label(m.label, "#7c3aed", text * 0.8);
    s.position.copy(
      pts[Math.floor(pts.length / 2)]!.clone().add(
        new THREE.Vector3(0, text * 0.6, 0),
      ),
    );
    labels.add(s);
  }
  return { concrete: concreteG, steel, rods, loads, labels, cones };
}

function frame(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  model: BasePlate3DModel,
  view: View,
) {
  const d = model.extent * 2.2;
  const target = v3(0, 0, model.column.z0 * 0.5 - model.pedestal.z0 * 0.15);
  const offset =
    view === "plan"
      ? v3(0.0001, -0.0001, d)
      : view === "front"
        ? v3(0, -d, d * 0.15)
        : view === "side"
          ? v3(d, 0, d * 0.15)
          : v3(d * 0.65, -d * 0.8, d * 0.6);
  camera.position.copy(target.clone().add(offset));
  camera.near = model.extent / 500;
  camera.far = model.extent * 60;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

export default function BasePlate3DView({
  input,
  combo,
  onSnapshot,
}: {
  input: BasePlateInput;
  combo: ComboResult | null;
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
    [show, setShow] = useState({
      loads: true,
      labels: true,
      cones: true,
      xray: false,
    }),
    [note, setNote] = useState("");
  const model = useMemo(() => {
    try {
      return buildBasePlate3DModel(input, combo);
    } catch {
      return null;
    }
  }, [input, combo]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        "3D view needs WebGL, which this browser or device does not provide. The plan and sections remain available.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f4ee);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c6, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(4, 9, 6);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 1000),
      controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth || 600,
        h = Math.max(320, Math.min(540, w * 0.66));
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
        const m = mesh.material as
          THREE.Material | THREE.Material[] | undefined;
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
    s.groups.loads.visible = show.loads;
    s.groups.labels.visible = show.labels;
    s.groups.cones.visible = show.cones;
    s.groups.concrete.traverse((o) => {
      const m = (o as THREE.Mesh).material as
        THREE.MeshStandardMaterial | undefined;
      if (m && "opacity" in m && (o as THREE.Mesh).isMesh) {
        m.opacity = show.xray ? 0.28 : 1;
        m.depthWrite = !show.xray;
      }
    });
    s.render();
  }, [show, model]);
  if (!model)
    return (
      <p className="slabMuted">
        Complete valid inputs to view the base plate in 3D.
      </p>
    );
  return (
    <figure
      className="slab3d"
      aria-label="3D base plate view with anchor rods and loads"
    >
      <div className="slabViewButtons">
        {(
          [
            ["iso", "Isometric"],
            ["plan", "Plan"],
            ["front", "Front (along Y)"],
            ["side", "Side (along X)"],
          ] as const
        ).map(([v, t]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {t}
          </button>
        ))}
        {(
          [
            ["loads", "Loads"],
            ["labels", "Labels"],
            ["cones", "Breakout prism"],
            ["xray", "See-through concrete"],
          ] as const
        ).map(([k, t]) => (
          <label key={k} className="slab3dToggle">
            <input
              type="checkbox"
              checked={show[k]}
              onChange={(e) => setShow({ ...show, [k]: e.target.checked })}
            />{" "}
            {t}
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
      {error ? (
        <p className="slabError">{error}</p>
      ) : (
        <div ref={host} className="slab3dCanvas" />
      )}
      <figcaption className="slabMuted">
        True scale · drag to rotate, right-drag to pan, scroll to zoom.{" "}
        {combo
          ? `Combination ${combo.load.id}: rods in tension are red; the red prism is the projected 1.5h′ef breakout area.`
          : ""}
        {note && ` ${note}`}
      </figcaption>
    </figure>
  );
}
