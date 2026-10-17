"use client";
/**
 * 3D storey view (panel 01, 17 Oct 2026): column, upper slab and N/S/E/W
 * beams, drop panel, lower slab and footing offset, with H, ℓu,x and ℓu,y.
 * Same viewer conventions as the slab and base-plate 3D views.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ColumnStorey } from "@nola/calc-core";
import {
  buildStorey3DModel,
  type Storey3DModel,
  type StoreyPiece,
} from "@/lib/column-storey-3d-model";

type View = "iso" | "front" | "side" | "plan";
/** Engineering (x east, y north, z up) → three.js (x, y up, z south). */
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

const COLOR: Record<StoreyPiece["kind"], number> = {
  column: 0xb9c7cf,
  slab: 0xe6e1d6,
  beam: 0xcfd9dd,
  capital: 0xd9d2c3,
  lowerSlab: 0xe6e1d6,
  footing: 0xc9c2b2,
};
const OPACITY: Record<StoreyPiece["kind"], number> = {
  column: 1,
  slab: 0.55,
  beam: 0.92,
  capital: 0.9,
  lowerSlab: 0.4,
  footing: 0.9,
};

function boxMesh(p: StoreyPiece) {
  const b = p.box,
    g = new THREE.BoxGeometry(b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0);
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color: COLOR[p.kind],
      roughness: 0.9,
      transparent: OPACITY[p.kind] < 1,
      opacity: OPACITY[p.kind],
      depthWrite: OPACITY[p.kind] >= 0.9,
    }),
  );
  mesh.position.copy(v3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2));
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(g),
      new THREE.LineBasicMaterial({ color: 0x3d4a55, transparent: true, opacity: 0.6 }),
    ),
  );
  mesh.name = p.id;
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
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0, 0, w, 64);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, 60);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 14, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false }));
  sprite.scale.set((height * w) / 64, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}
function buildGroups(model: Storey3DModel) {
  const structure = new THREE.Group(),
    floors = new THREE.Group(),
    labels = new THREE.Group(),
    dims = new THREE.Group();
  for (const p of model.pieces)
    (p.kind === "slab" || p.kind === "beam" || p.kind === "capital" || p.kind === "lowerSlab"
      ? floors
      : structure
    ).add(boxMesh(p));
  const th = Math.max(0.1, model.extent * 0.03);
  for (const p of model.pieces) {
    if (p.kind === "slab" || p.kind === "lowerSlab") continue;
    const b = p.box;
    const s = label(p.label, "#263d4d", th * 0.8);
    const cx = (b.x0 + b.x1) / 2,
      cy = (b.y0 + b.y1) / 2;
    // Beams: label at the outer end; others beside the piece.
    const at =
      p.kind === "beam"
        ? v3(
            p.id === "east" ? b.x1 : p.id === "west" ? b.x0 : cx,
            p.id === "north" ? b.y1 : p.id === "south" ? b.y0 : cy,
            b.z0 - th * 0.8,
          )
        : v3(cx, cy, p.kind === "column" ? (b.z0 + b.z1) / 2 : b.z0 - th);
    s.position.copy(at);
    labels.add(s);
  }
  // North arrow on the slab.
  const n = label("N ↑", "#263d4d", th);
  n.position.copy(v3(0, model.reach + th * 2, model.height + th));
  labels.add(n);
  for (const d of model.dims) {
    const color = new THREE.Color(d.color),
      tick = th * 0.6;
    const pts = [
      v3(d.x, d.y, d.z0),
      v3(d.x, d.y, d.z1),
      v3(d.x - tick, d.y, d.z0),
      v3(d.x + tick, d.y, d.z0),
      v3(d.x - tick, d.y, d.z1),
      v3(d.x + tick, d.y, d.z1),
    ];
    dims.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, depthTest: false }),
      ),
    );
    const s = label(d.label, d.color, th);
    s.position.copy(v3(d.x, d.y, (d.z0 + d.z1) / 2));
    dims.add(s);
  }
  return { structure, floors, labels, dims };
}
function frame(camera: THREE.PerspectiveCamera, controls: OrbitControls, model: Storey3DModel, view: View) {
  const target = v3(0, 0, model.height / 2),
    d = model.extent * 1.5;
  const offset =
    view === "plan"
      ? v3(0, -0.001, d * 1.2)
      : view === "front"
        ? v3(0, -d, 0) // from the south, looking north: X across
        : view === "side"
          ? v3(d, 0, 0) // from the east, looking west: Y across
          : v3(d * 0.75, -d * 0.85, d * 0.15);
  camera.position.copy(target.clone().add(offset));
  camera.near = model.extent / 500;
  camera.far = model.extent * 50;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

export default function ColumnStorey3DView({
  storey,
  column,
  onSnapshot,
  onUnavailable,
}: {
  storey: ColumnStorey;
  column: { width: number; depth: number };
  onSnapshot?: (png: string) => void;
  /** WebGL missing: the parent shows the 2D sketch instead. */
  onUnavailable?: () => void;
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
  const [view, setView] = useState<View>("iso"),
    [show, setShow] = useState({ floors: true, labels: true, dims: true }),
    [note, setNote] = useState("");
  const model = useMemo(() => {
    try {
      return buildStorey3DModel(storey, column);
    } catch {
      return null;
    }
    // column is passed inline: depend on its numbers, not its identity.
  }, [storey, column.width, column.depth]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      onUnavailable?.();
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f4ee);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c6, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(5, 10, 7);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000),
      controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth || 360,
        h = Math.max(300, Math.min(460, w * 0.9));
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
    if (s.groups) for (const g of Object.values(s.groups)) s.scene.remove(g);
    s.groups = buildGroups(model);
    for (const g of Object.values(s.groups)) s.scene.add(g);
    s.render();
  }, [model]);
  useEffect(() => {
    const s = stage.current;
    if (!s || !model) return;
    frame(s.camera, s.controls, model, view);
    s.render();
    // Re-frame on a view change or a new storey size only.
  }, [view, model?.extent]);
  useEffect(() => {
    const s = stage.current;
    if (!s?.groups) return;
    s.groups.floors.visible = show.floors;
    s.groups.labels.visible = show.labels;
    s.groups.dims.visible = show.dims;
    s.render();
  }, [show, model]);
  if (!model) return <p className="rcMuted">Complete valid storey inputs to view in 3D.</p>;
  return (
    <figure className="storey3d" aria-label="3D storey view: column, slab and beams">
      <div className="slabViewButtons">
        {(
          [
            ["iso", "3D"],
            ["front", "Front (X)"],
            ["side", "Side (Y)"],
            ["plan", "Plan"],
          ] as const
        ).map(([v, text]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {text}
          </button>
        ))}
        {(
          [
            ["floors", "Slab & beams"],
            ["dims", "Dimensions"],
            ["labels", "Labels"],
          ] as const
        ).map(([k, text]) => (
          <label key={k} className="slab3dToggle">
            <input
              type="checkbox"
              checked={show[k]}
              onChange={(e) => setShow({ ...show, [k]: e.target.checked })}
            />{" "}
            {text}
          </label>
        ))}
        {onSnapshot && (
          <button
            className="suiteSecondary"
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
      <div ref={host} className="slab3dCanvas storey3dCanvas" />
      <figcaption className="rcMuted">
        True scale · drag to rotate, right-drag to pan, scroll to zoom. N/S beams run along Y
        (ℓu,x, Mux); E/W beams along X (ℓu,y, Muy).
        {model.assumedWidth && " Beam widths assumed 300 mm (older draft): enter them above."}
        {note && ` ${note}`}
      </figcaption>
    </figure>
  );
}
