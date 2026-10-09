import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Observation } from '../shared/types';

export type MapSelection = { kind: 'station' | 'edge'; id: string } | null;
interface Props {
  observation: Observation;
  selection: MapSelection;
  onSelect: (selection: MapSelection) => void;
  topView: boolean;
  reset: number;
}
const railColors: Record<string, string> = {
  red: '#f07b70',
  blue: '#75b6df',
  green: '#8cbba1',
  yellow: '#e7c878',
  gray: '#b5bec1',
};
const districtSymbols: Record<string, string> = {
  harbor: '⚓',
  'old-town': '⌂',
  industrial: '⚙',
  garden: '✿',
};

export default function Diorama({ observation, selection, onSelect, topView, reset }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const engine = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    objects: THREE.Group;
    pickables: THREE.Object3D[];
    center: THREE.Vector3;
    scale: number;
  } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const boardRef = useRef(observation);
  boardRef.current = observation;
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor('#142e35', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#142e35', 30, 95);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.enablePan = false;
    controls.minDistance = 14;
    controls.maxDistance = 65;
    controls.maxPolarAngle = Math.PI / 2.15;
    scene.add(new THREE.HemisphereLight('#d6f1ed', '#233d45', 2.6));
    const light = new THREE.DirectionalLight('#ffdfb2', 3);
    light.position.set(-12, 25, 10);
    scene.add(light);
    const objects = new THREE.Group();
    scene.add(objects);
    engine.current = {
      scene,
      renderer,
      camera,
      controls,
      objects,
      pickables: [],
      center: new THREE.Vector3(),
      scale: 1,
    };
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(down.x - e.clientX, down.y - e.clientY) > 7) return;
      const box = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - box.left) / box.width) * 2 - 1,
          (-(e.clientY - box.top) / box.height) * 2 + 1,
        ),
        camera,
      );
      const hits = raycaster.intersectObjects(engine.current?.pickables ?? [], false);
      if (hits[0]?.object.userData.selection)
        onSelectRef.current(hits[0].object.userData.selection as MapSelection);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      const eng = engine.current;
      if (eng)
        for (const station of boardRef.current.stations) {
          const label = labels.current.get(station.id);
          if (!label) continue;
          const position = new THREE.Vector3(
            (station.x - eng.center.x) * eng.scale,
            station.height * 0.6 + 1.25,
            (station.z - eng.center.z) * eng.scale,
          ).project(camera);
          label.style.left = `${(position.x * 0.5 + 0.5) * el.clientWidth}px`;
          label.style.top = `${(-position.y * 0.5 + 0.5) * el.clientHeight}px`;
          label.style.opacity = position.z > 1 ? '0' : '1';
        }
      frame = requestAnimationFrame(animate);
    };
    animate();
    setReady(true);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    eng.objects.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        mats.forEach((m) => m.dispose());
      }
    });
    eng.objects.clear();
    eng.pickables = [];
    const xs = observation.stations.map((s) => s.x),
      zs = observation.stations.map((s) => s.z);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
    eng.center.set(
      (Math.max(...xs) + Math.min(...xs)) / 2,
      0,
      (Math.max(...zs) + Math.min(...zs)) / 2,
    );
    eng.scale = 22 / span;
    const point = (s: Observation['stations'][number]) =>
      new THREE.Vector3(
        (s.x - eng.center.x) * eng.scale,
        s.height * 0.6,
        (s.z - eng.center.z) * eng.scale,
      );
    const mat = (color: string, roughness = 0.8) =>
      new THREE.MeshStandardMaterial({ color, roughness });
    const box = (
      w: number,
      h: number,
      d: number,
      color: string,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      eng.objects.add(m);
      return m;
    };
    box(29, 1.1, 26, '#254f50', 0, -1.1, 0);
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(31, 0.14, 28),
      new THREE.MeshStandardMaterial({
        color: '#54b5b6',
        transparent: true,
        opacity: 0.35,
        metalness: 0.25,
        roughness: 0.25,
      }),
    );
    const floodedHeights = observation.stations.filter((s) => s.flooded).map((s) => s.height * 0.6);
    water.position.y = floodedHeights.length ? Math.max(...floodedHeights) + 0.33 : -0.55;
    eng.objects.add(water);
    for (const station of observation.stations) {
      const p = point(station);
      const level = station.height * 0.6;
      box(
        3.25,
        Math.max(0.35, level + 0.9),
        3.2,
        station.flooded ? '#39686a' : station.safe ? '#51785b' : '#426c61',
        p.x,
        (level - 0.9) / 2,
        p.z,
      );
      const platform = box(
        1.4,
        0.2,
        0.85,
        station.flooded ? '#41676c' : station.safe ? '#d3b176' : '#bbd2c3',
        p.x,
        level + 0.15,
        p.z,
      );
      platform.userData.selection = { kind: 'station', id: station.id };
      eng.pickables.push(platform);
      if (selection?.kind === 'station' && selection.id === station.id) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.93, 0.055, 6, 36),
          new THREE.MeshBasicMaterial({ color: '#ffdd9c' }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, level + 0.3, p.z);
        eng.objects.add(ring);
      }
      if (!station.flooded) {
        for (let i = 0; i < (station.safe ? 3 : 2); i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const x = p.x + side * 0.95,
            z = p.z - 0.7 + i * 0.5,
            h = 0.45 + (i % 3) * 0.16;
          box(
            0.48,
            h,
            0.48,
            station.safe ? '#e3c9a0' : ['#a7b6a2', '#cfb48e', '#b8c4ae'][i % 3],
            x,
            level + h / 2 + 0.1,
            z,
          );
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 4), mat('#725f4d'));
          roof.rotation.y = Math.PI / 4;
          roof.position.set(x, level + h + 0.2, z);
          eng.objects.add(roof);
        }
        if (!station.safe) {
          const tree = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), mat('#83a987'));
          tree.position.set(p.x + 1.15, level + 0.55, p.z + 0.85);
          eng.objects.add(tree);
        }
      }
    }
    for (const edge of observation.edges) {
      const a = observation.stations.find((s) => s.id === edge.a),
        b = observation.stations.find((s) => s.id === edge.b);
      if (!a || !b) continue;
      const pa = point(a),
        pb = point(b);
      pa.y += 0.27;
      pb.y += 0.27;
      const direction = pb.clone().sub(pa),
        distance = direction.length();
      const closed = a.flooded || b.flooded;
      const color =
        selection?.kind === 'edge' && selection.id === edge.id
          ? '#fff0c2'
          : closed
            ? '#386569'
            : edge.open
              ? '#dec38f'
              : railColors[edge.color];
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(
          edge.open ? 0.055 : 0.075,
          edge.open ? 0.055 : 0.075,
          distance,
          6,
        ),
        mat(color),
      );
      rail.position.copy(pa.clone().add(pb).multiplyScalar(0.5));
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      eng.objects.add(rail);
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, distance, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.position.copy(rail.position);
      hit.quaternion.copy(rail.quaternion);
      hit.userData.selection = { kind: 'edge', id: edge.id };
      eng.objects.add(hit);
      eng.pickables.push(hit);
      const count = Math.max(2, Math.floor(distance * 1.8));
      for (let i = 0; i < count; i++) {
        if (!edge.open && i % 2) continue;
        const t = (i + 0.5) / count,
          p = pa.clone().lerp(pb, t);
        const tie = box(
          0.32,
          0.07,
          0.15,
          closed ? '#42686b' : edge.open ? '#665e4d' : railColors[edge.color],
          p.x,
          p.y - 0.025,
          p.z,
        );
        tie.rotation.y = -Math.atan2(pb.z - pa.z, pb.x - pa.x);
      }
    }
    for (const train of observation.trains) {
      const station = observation.stations.find((s) => s.id === train.stationId);
      if (!station) continue;
      const p = point(station);
      const own = observation.trains.filter((t) => t.stationId === station.id);
      const i = own.findIndex((t) => t.id === train.id);
      const row = Math.floor(i / 4);
      p.x += ((i % 4) - 1.5) * 0.38;
      p.z += 0.35 + row * 0.45;
      const color = train.disabled
        ? '#355b62'
        : (observation.players.find((p) => p.id === train.playerId)?.color ?? '#fafafa');
      box(0.3, 0.25, 0.5, color, p.x, p.y + 0.45, p.z);
      box(0.22, 0.17, 0.2, train.disabled ? '#355b62' : '#deede4', p.x, p.y + 0.65, p.z - 0.1);
      for (let j = 0; j < train.cargo.length; j++)
        box(
          0.11,
          0.1,
          0.1,
          train.cargo[j].priority ? '#f0c972' : '#e1e4cd',
          p.x + (j - 0.5) * 0.14,
          p.y + 0.65,
          p.z + 0.12,
        );
    }
  }, [observation, selection, ready]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    eng.camera.position.set(topView ? 0 : 22, topView ? 39 : 29, topView ? 0.01 : 31);
    eng.controls.target.set(0, 0, 0);
    eng.controls.update();
  }, [topView, reset, ready]);
  if (fallback) {
    const xs = observation.stations.map((s) => s.x),
      zs = observation.stations.map((s) => s.z);
    const minX = Math.min(...xs),
      minZ = Math.min(...zs),
      spanX = Math.max(...xs) - minX || 1,
      spanZ = Math.max(...zs) - minZ || 1;
    const xy = (id: string) => {
      const s = observation.stations.find((s) => s.id === id)!;
      return { x: 50 + ((s.x - minX) / spanX) * 700, y: 45 + ((s.z - minZ) / spanZ) * 430 };
    };
    return (
      <div className="map-fallback">
        <span className="fallback-note">Схема города · 3D недоступен в этом браузере</span>
        <svg viewBox="0 0 800 520" aria-label="Схема железной дороги">
          {observation.edges.map((e) => {
            const a = xy(e.a),
              b = xy(e.b);
            return (
              <g
                key={e.id}
                onClick={() => onSelect({ kind: 'edge', id: e.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => ev.key === 'Enter' && onSelect({ kind: 'edge', id: e.id })}
                aria-label={`Линия ${e.id}`}
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={railColors[e.color]}
                  strokeWidth={e.open ? 5 : 3}
                  strokeDasharray={e.open ? '' : '8 6'}
                />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="22" />
              </g>
            );
          })}
          {observation.stations.map((s) => {
            const p = xy(s.id);
            return (
              <g
                key={s.id}
                onClick={() => onSelect({ kind: 'station', id: s.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => ev.key === 'Enter' && onSelect({ kind: 'station', id: s.id })}
                aria-label={s.name}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={15}
                  fill={s.flooded ? '#32545b' : s.safe ? '#ddbc7f' : '#d7e5d5'}
                />
                <text x={p.x} y={p.y + 31} textAnchor="middle" fill="#eef1e4" fontSize="12">
                  {s.name}
                </text>
                <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#1c3b40" fontSize="11">
                  {s.groups.length}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }
  return (
    <div
      ref={host}
      className="diorama"
      aria-label="3D-макет Речного. Вращайте мышью, выбирайте станции и линии."
    >
      <div className="map-labels">
        {observation.stations.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              if (el) labels.current.set(s.id, el);
              else labels.current.delete(s.id);
            }}
            className={`station-label ${s.safe ? 'safe' : ''} ${s.flooded ? 'flooded' : ''} ${selection?.id === s.id ? 'selected' : ''}`}
            onClick={() => onSelect({ kind: 'station', id: s.id })}
            title={`${s.name}. ${s.safe ? 'Убежище' : s.flooded ? 'Затоплена' : `${s.groups.length} групп, волна после раунда ${s.floodRound}`}`}
          >
            <span>
              {s.safe ? '⚑' : districtSymbols[s.district ?? '']} {s.name}
            </span>
            <small>
              {s.safe
                ? 'УБЕЖИЩЕ'
                : s.flooded
                  ? 'ЗАКРЫТА'
                  : `${s.groups.length} гр. · до ${s.floodRound}`}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
