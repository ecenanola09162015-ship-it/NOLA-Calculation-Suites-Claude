"use client";
/**
 * Stairs 3-D view (decision D5): true-scale solid stair with supports,
 * uniform load arrows over the walking surface, local point / line / area
 * loads and, in 1 m strip mode, the design strip band. Same renderer
 * conventions and watercolour concrete as the slab 3-D view.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { StairBarSetId, StairsInput } from "@nola/calc-core";
import { stairBarColors } from "@/lib/stair-bar-styles";
import { watercolorConcretePixels } from "@/lib/slab-3d-model";
import { loadStyles } from "@/lib/load-styles";
import {
  buildStair3DModel,
  type Stair3DLoad,
  type Stair3DModel,
} from "@/lib/stair-3d-model";
import styles from "./stair-workspace.module.css";

type View = "iso" | "side" | "plan" | "front";
const UNIFORM = { stroke: "#6d4bb3", text: "#4a2f80", label: "Uniform load" };

let texture: THREE.CanvasTexture | null = null;
function concreteMap() {
  if (!texture) {
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
    texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  const map = texture.clone();
  map.needsUpdate = true;
  map.repeat.set(0.4, 0.4);
  return map;
}
const concreteMaterial = (tint = 0xffffff) =>
  new THREE.MeshStandardMaterial({
    map: concreteMap(),
    color: tint,
    roughness: 0.95,
    metalness: 0,
  });
const edges = (g: THREE.BufferGeometry) =>
  new THREE.LineSegments(
    new THREE.EdgesGeometry(g, 20),
    new THREE.LineBasicMaterial({
      color: 0x3d4a55,
      transparent: true,
      opacity: 0.55,
    }),
  );

function label(text: string, color: string, height: number) {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!,
    font = "600 44px Arial, sans-serif";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  canvas.width = w;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(0, 0, w, 64);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, 60);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 14, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, depthTest: false }),
  );
  sprite.scale.set((height * w) / 64, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}
function loadColor(l: Stair3DLoad) {
  return l.kind === "uniform"
    ? { stroke: UNIFORM.stroke, text: UNIFORM.text }
    : { stroke: loadStyles[l.kind].stroke, text: loadStyles[l.kind].text };
}

function buildGroups(model: Stair3DModel) {
  const stair = new THREE.Group(),
    supports = new THREE.Group(),
    uniform = new THREE.Group(),
    local = new THREE.Group(),
    labels = new THREE.Group();
  for (const s of model.solids) {
    const shape = new THREE.Shape(
      s.profile.map((p) => new THREE.Vector2(p.x, p.y)),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: s.z1 - s.z0,
      bevelEnabled: false,
    });
    const mesh = new THREE.Mesh(geometry, concreteMaterial());
    mesh.position.z = s.z0;
    mesh.add(edges(geometry));
    stair.add(mesh);
  }
  for (const b of model.boxes) {
    const geometry = new THREE.BoxGeometry(
      b.x1 - b.x0,
      b.y1 - b.y0,
      b.z1 - b.z0,
    );
    const mesh = new THREE.Mesh(
      geometry,
      concreteMaterial(
        b.kind === "footing"
          ? 0xd9cfbd
          : b.kind === "beam"
            ? 0xe6e9ec
            : 0xffffff,
      ),
    );
    mesh.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    mesh.add(edges(geometry));
    (b.kind === "landing" ? stair : supports).add(mesh);
  }
  const text = Math.max(0.12, model.extent * 0.042);
  if (model.band) {
    const material = new THREE.LineDashedMaterial({
      color: 0x0a7f6f,
      dashSize: 0.08,
      gapSize: 0.05,
    });
    for (const b of model.band)
      for (const z of [b.z0, b.z1]) {
        const g = new THREE.BufferGeometry().setFromPoints(
          b.line.map((p) => new THREE.Vector3(p.x, p.y, z)),
        );
        const l = new THREE.Line(g, material);
        l.computeLineDistances();
        stair.add(l);
      }
    const b0 = model.band[0],
      first = b0.line[0];
    const sprite = label("1 m design strip", "#0a7f6f", text * 0.8);
    sprite.position.set(first.x, first.y + text, (b0.z0 + b0.z1) / 2);
    labels.add(sprite);
  }
  for (const l of model.loads) {
    const c = loadColor(l);
    const color = new THREE.Color(c.stroke);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const group = l.kind === "uniform" ? uniform : local;
    const radius = Math.max(
      0.004,
      model.extent * (l.kind === "uniform" ? 0.0018 : 0.0032),
    );
    let top = -Infinity;
    for (const a of l.arrows) {
      const head = Math.min(a.length * 0.3, radius * 9);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, a.length - head, 8),
        material,
      );
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 3, head, 12),
        material,
      );
      cone.rotation.x = Math.PI;
      shaft.position.set(a.x, a.y + head + (a.length - head) / 2, a.z);
      cone.position.set(a.x, a.y + head / 2, a.z);
      group.add(shaft, cone);
      top = Math.max(top, a.y + a.length);
    }
    if (l.kind !== "uniform") {
      const f = l.footprint;
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(0.02, f.x1 - f.x0),
          l.kind === "area" ? 0.004 : 0.03,
          Math.max(0.02, f.z1 - f.z0),
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: l.kind === "area",
          opacity: l.kind === "area" ? 0.35 : 1,
        }),
      );
      pad.position.set((f.x0 + f.x1) / 2, f.y + 0.005, (f.z0 + f.z1) / 2);
      local.add(pad);
      const sprite = label(l.label, c.text, text);
      sprite.position.set((f.x0 + f.x1) / 2, top + text, (f.z0 + f.z1) / 2);
      labels.add(sprite);
    } else {
      const a = l.arrows[Math.floor(l.arrows.length / 2)];
      const sprite = label(l.label, c.text, text * 0.8);
      sprite.position.set(a.x, top + text * 1.6, a.z);
      uniform.add(sprite);
    }
  }
  // Rebar layer (V3): one mesh group per bar set, coloured as in the 2-D
  // drawings; hidden unless "Rebars" is ticked.
  const rebars = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  const minR = Math.max(0.004, model.extent * 0.0012);
  for (const b of model.bars) {
    const group = new THREE.Group();
    group.name = b.set;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(stairBarColors[b.set]),
      roughness: 0.45,
      metalness: 0.2,
      transparent: true,
    });
    const r = Math.max(b.radius, minR);
    for (const [x1, y1, z1, x2, y2, z2] of b.segments) {
      const a = new THREE.Vector3(x1, y1, z1),
        c = new THREE.Vector3(x2, y2, z2);
      const len = a.distanceTo(c);
      if (len < 1e-6) continue;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, len, 6),
        material,
      );
      mesh.position.copy(a.clone().add(c).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(up, c.clone().sub(a).normalize());
      group.add(mesh);
    }
    rebars.add(group);
  }
  return { stair, supports, uniform, local, labels, rebars };
}

function frame(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  model: Stair3DModel,
  view: View,
) {
  const c = model.centre,
    target = new THREE.Vector3(c.x, c.y, c.z),
    d = model.extent * 1.45;
  const offset =
    view === "plan"
      ? new THREE.Vector3(0, d * 1.1, 0.001)
      : view === "side"
        ? new THREE.Vector3(0, d * 0.1, d)
        : view === "front"
          ? new THREE.Vector3(-d, d * 0.2, 0)
          : new THREE.Vector3(-d * 0.55, d * 0.55, d * 0.85);
  camera.position.copy(target.clone().add(offset));
  camera.near = model.extent / 500;
  camera.far = model.extent * 50;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

export default function Stair3DView({
  input,
  highlight = null,
  onSnapshot,
}: {
  input: StairsInput;
  /** PNG of the current view for the Complete PDF report. */
  onSnapshot?: (png: string) => void;
  /** Bar set being edited: shown at full strength, others dimmed (V3). */
  highlight?: StairBarSetId | null;
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
    [snapshotNote, setSnapshotNote] = useState(""),
    [show, setShow] = useState({
      uniform: true,
      local: true,
      supports: true,
      labels: true,
      rebars: false,
    });
  const model = useMemo(() => {
    try {
      return buildStair3DModel(input);
    } catch {
      return null;
    }
  }, [input]);
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
        "3D view needs WebGL, which this browser or device does not provide. The 2D section and plan remain available.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f4ee);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c6, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 10, 7);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000),
      controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth || 600,
        h = Math.max(300, Math.min(520, w * 0.62));
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
  }, [view, model?.extent, model?.centre.x, model?.centre.y, model?.centre.z]);
  useEffect(() => {
    const s = stage.current;
    if (!s?.groups) return;
    s.groups.uniform.visible = show.uniform;
    s.groups.local.visible = show.local;
    s.groups.supports.visible = show.supports;
    s.groups.labels.visible = show.labels;
    s.groups.rebars.visible = show.rebars;
    // See-through concrete while the rebar layer is on.
    s.groups.stair.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && "opacity" in m && (o as THREE.Mesh).isMesh) {
        m.transparent = show.rebars;
        m.opacity = show.rebars ? 0.28 : 1;
        m.depthWrite = !show.rebars;
        m.needsUpdate = true;
      }
    });
    for (const g of s.groups.rebars.children) {
      const active = !highlight || g.name === highlight;
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as
          THREE.MeshStandardMaterial | undefined;
        if (m && (o as THREE.Mesh).isMesh) m.opacity = active ? 1 : 0.15;
      });
    }
    s.render();
  }, [show, model, highlight]);
  if (!model)
    return (
      <p className="slabMuted">
        Complete valid inputs to view the stair in 3D.
      </p>
    );
  return (
    <figure
      className={styles.view3d}
      aria-label="3D stair view with supports and loads"
    >
      <div className="slabViewButtons">
        {(
          [
            ["iso", "Isometric"],
            ["side", "Side"],
            ["front", "Up the flight"],
            ["plan", "Plan"],
          ] as const
        ).map(([v, t]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {t}
          </button>
        ))}
        {(
          [
            ["uniform", "Uniform load"],
            ["local", "Local loads"],
            ["supports", "Supports"],
            ["labels", "Labels"],
            ["rebars", "Rebars"],
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
              const st = stage.current;
              if (!st) return;
              st.render();
              onSnapshot(st.renderer.domElement.toDataURL("image/png"));
              setSnapshotNote("3D view added to the Complete PDF report.");
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
        True scale · drag to rotate, right-drag to pan, scroll to zoom. Purple
        arrows: uniform live load and finishes on plan; red point, blue line and
        green area loads at their positions with unfactored values. Tick Rebars
        to see the bars (coloured by mark) through see-through concrete; the set
        being edited stays bright.
        {model.widthMode === "strip"
          ? " Dashed green lines mark the 1 m design strip."
          : " Full flight width is designed; point and area loads spread over their effective width."}
        {snapshotNote && ` ${snapshotNote}`}
      </figcaption>
    </figure>
  );
}
