"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SlabInput } from "@nola/calc-core";

import {
  buildSlab3DModel,
  watercolorConcretePixels,
  type Box3,
  type Slab3DModel,
} from "@/lib/slab-3d-model";
import { loadStyles } from "@/lib/load-styles";

type View = "iso" | "plan" | "alongX" | "alongY";
/** Engineering (x east, y north, z up) → three.js (x, y up, z south). */
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

let concreteTexture: THREE.CanvasTexture | null = null;
function concrete() {
  if (concreteTexture) return concreteTexture;
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(
    new ImageData(watercolorConcretePixels(size, 7), size, size),
    0,
    0,
  );
  concreteTexture = new THREE.CanvasTexture(canvas);
  concreteTexture.wrapS = concreteTexture.wrapT = THREE.RepeatWrapping;
  concreteTexture.colorSpace = THREE.SRGBColorSpace;
  return concreteTexture;
}
/** Concrete box with the watercolour texture tiled about once per metre. */
function concreteBox(b: Box3, tint = 0xffffff) {
  const w = b.x1 - b.x0,
    d = b.y1 - b.y0,
    t = b.z1 - b.z0,
    geometry = new THREE.BoxGeometry(w, t, d);
  const map = concrete().clone();
  map.needsUpdate = true;
  // One texture tile per ~2.5 m keeps the washes broad.
  map.repeat.set(Math.max(1, w / 2.5), Math.max(1, d / 2.5));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map,
      color: tint,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  mesh.position.copy(
    v3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2),
  );
  const ink = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: 0x3d4a55,
      transparent: true,
      opacity: 0.55,
    }),
  );
  mesh.add(ink);
  return mesh;
}
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
function buildGroups(model: Slab3DModel) {
  const { lx, ly, h } = model.slab,
    slab = new THREE.Group(),
    supports = new THREE.Group(),
    loads = new THREE.Group(),
    labels = new THREE.Group();
  slab.add(concreteBox({ x0: 0, x1: lx, y0: 0, y1: ly, z0: 0, z1: h }));
  for (const s of model.supports) {
    if (s.kind === "Fixed") supports.add(concreteBox(s.box, 0xd9d4cc));
    else {
      // Knife-edge prism along the edge (simple support).
      const b = s.box,
        alongY = s.edge === "west" || s.edge === "east",
        length = alongY ? b.y1 - b.y0 : b.x1 - b.x0,
        width = alongY ? b.x1 - b.x0 : b.y1 - b.y0,
        height = b.z1 - b.z0,
        shape = new THREE.Shape();
      shape.moveTo(-width / 2, -height);
      shape.lineTo(width / 2, -height);
      shape.lineTo(0, 0);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: length,
        bevelEnabled: false,
      });
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x8a96a3, roughness: 0.6 }),
      );
      // Extrusion runs along local +z; orient it along the edge.
      // alongY: extrude from three z = −ly to 0 (engineering y = ly → 0).
      if (alongY) mesh.position.copy(v3((b.x0 + b.x1) / 2, b.y1, 0));
      else {
        mesh.rotation.y = Math.PI / 2;
        mesh.position.copy(v3(0, (b.y0 + b.y1) / 2, 0));
      }
      mesh.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x3d4a55 }),
        ),
      );
      supports.add(mesh);
    }
  }
  const textHeight = Math.max(0.12, model.extent * 0.035);
  for (const [edge, x, y] of [
    ["WEST", -0.06 * model.extent, ly / 2],
    ["EAST", lx + 0.06 * model.extent, ly / 2],
    ["SOUTH", lx / 2, -0.06 * model.extent],
    ["NORTH", lx / 2, ly + 0.06 * model.extent],
  ] as const) {
    const e = edge.toLowerCase() as "west" | "east" | "south" | "north";
    const sprite = label(
      `${edge} · ${model.supportKinds[e]}`,
      "#263d4d",
      textHeight * 0.8,
    );
    sprite.position.copy(v3(x, y, h));
    labels.add(sprite);
  }
  for (const l of model.loads) {
    const color = new THREE.Color(l.color),
      f = l.footprint,
      pad =
        l.kind === "area"
          ? new THREE.Mesh(
              new THREE.BoxGeometry(f.x1 - f.x0, 0.004, f.y1 - f.y0),
              new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.35,
              }),
            )
          : new THREE.Mesh(
              new THREE.BoxGeometry(
                Math.max(0.02, f.x1 - f.x0),
                Math.max(0.02, Math.min(0.05, h * 0.3)),
                Math.max(0.02, f.y1 - f.y0),
              ),
              new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
            );
    pad.position.copy(v3((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, h + 0.003));
    loads.add(pad);
    let top = h;
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
      radius = Math.max(0.006, model.extent * 0.0035);
    for (const a of l.arrows) {
      // Solid arrow: shaft cylinder + cone, tip touching the top surface.
      const head = Math.min(a.length * 0.3, radius * 9),
        shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, a.length - head, 10),
          material,
        ),
        cone = new THREE.Mesh(
          new THREE.ConeGeometry(radius * 3, head, 14),
          material,
        );
      cone.rotation.x = Math.PI;
      shaft.position.copy(v3(a.x, a.y, h + head + (a.length - head) / 2));
      cone.position.copy(v3(a.x, a.y, h + head / 2));
      loads.add(shaft, cone);
      top = Math.max(top, h + a.length);
    }
    const sprite = label(l.label, loadStyles[l.kind].text, textHeight);
    sprite.position.copy(
      v3((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, top + textHeight),
    );
    labels.add(sprite);
  }
  return { slab, supports, loads, labels };
}
function frame(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  model: Slab3DModel,
  view: View,
) {
  const { lx, ly, h } = model.slab,
    target = v3(lx / 2, ly / 2, h / 2),
    d = model.extent * 1.6,
    k = model.supportKinds,
    // Isometric from the side that shows a Fixed edge (e.g. a cantilever
    // root); default from the south-east.
    sx = k.west === "Fixed" && k.east !== "Fixed" ? -1 : 1,
    sy = k.north === "Fixed" && k.south !== "Fixed" ? 1 : -1;
  const offset =
    view === "plan"
      ? v3(0, -0.001, d * 1.1)
      : view === "alongX"
        ? v3(-d, 0, d * 0.25) // from the west, looking along +X
        : view === "alongY"
          ? v3(0, -d, d * 0.25) // from the south, looking along +Y
          : v3(sx * d * 0.7, sy * d * 0.85, d * 0.7);
  camera.position.copy(target.clone().add(offset));
  camera.near = model.extent / 500;
  camera.far = model.extent * 50;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

export default function Slab3DView({
  input,
  onSnapshot,
}: {
  input: SlabInput;
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
    [show, setShow] = useState({ loads: true, supports: true, labels: true }),
    [snapshotNote, setSnapshotNote] = useState("");
  const model = useMemo(() => {
    try {
      return buildSlab3DModel(input);
    } catch {
      return null;
    }
  }, [input]);
  // Renderer, camera and controls: created once.
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
        "3D view needs WebGL, which this browser or device does not provide. The 2D plans and sections remain available.",
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
    sun.position.set(5, 10, 7);
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
  // Scene content: rebuilt when the slab or loads change.
  useEffect(() => {
    const s = stage.current;
    if (!s || !model) return;
    if (s.groups)
      for (const g of Object.values(s.groups)) {
        s.scene.remove(g);
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          mesh.geometry?.dispose?.();
        });
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
    // Re-frame only on view change or new geometry extent.
  }, [view, model?.extent, model?.slab.lx, model?.slab.ly]);
  useEffect(() => {
    const s = stage.current;
    if (!s?.groups) return;
    s.groups.loads.visible = show.loads;
    s.groups.supports.visible = show.supports;
    s.groups.labels.visible = show.labels;
    s.render();
  }, [show, model]);
  if (!model)
    return (
      <p className="slabMuted">Complete valid inputs to view the slab in 3D.</p>
    );
  return (
    <figure
      className="slab3d"
      aria-label="3D slab view with supports and loads"
    >
      <div className="slabViewButtons">
        {(
          [
            ["iso", "Isometric"],
            ["plan", "Plan"],
            ["alongX", "Along X"],
            ["alongY", "Along Y"],
          ] as const
        ).map(([v, text]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {text}
          </button>
        ))}
        {(["loads", "supports", "labels"] as const).map((k) => (
          <label key={k} className="slab3dToggle">
            <input
              type="checkbox"
              checked={show[k]}
              onChange={(e) => setShow({ ...show, [k]: e.target.checked })}
            />{" "}
            {k[0].toUpperCase() + k.slice(1)}
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
        True scale · drag to rotate, right-drag to pan, scroll to zoom. Arrow
        length scales with the governing factored intensity within each load
        type; labels show the factored value and combination.
        {model.loads.length > 0 &&
          ` Legend: ${(["point", "line", "area"] as const)
            .filter((k) => model.loads.some((l) => l.kind === k))
            .map(
              (k) =>
                `${loadStyles[k].label} ${k === "point" ? "red" : k === "line" ? "blue" : "green"}`,
            )
            .join(", ")}.`}
        {snapshotNote && ` ${snapshotNote}`}
      </figcaption>
    </figure>
  );
}
