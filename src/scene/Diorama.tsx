import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Observation } from '../shared/types';
import {
  buildBoard,
  buildEnvironment,
  buildHand,
  disposeObjects,
  railColors,
  type Engine,
  type MapSelection,
} from './tabletop';

export type { MapSelection } from './tabletop';
interface Props {
  observation: Observation;
  selection: MapSelection;
  onSelect: (selection: MapSelection) => void;
  onCardSelect?: (id: string) => void;
  topView: boolean;
  reset: number;
}

export default function Diorama({
  observation,
  selection,
  onSelect,
  onCardSelect,
  topView,
  reset,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const engine = useRef<Engine | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCardSelectRef = useRef(onCardSelect);
  onCardSelectRef.current = onCardSelect;
  const boardRef = useRef(observation);
  boardRef.current = observation;
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor('#192527', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#192527', 55, 110);
    const foreground = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180);
    const handCamera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 30);
    handCamera.position.set(0, 0, 15);
    handCamera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.enableDamping = !reducedMotion;
    controls.enablePan = false;
    controls.minDistance = 23;
    controls.maxDistance = 57;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI / 2.5;
    controls.minAzimuthAngle = -Math.PI / 3;
    controls.maxAzimuthAngle = Math.PI / 3;
    scene.add(new THREE.HemisphereLight('#b7c4c0', '#332c24', 1.5));
    const light = new THREE.DirectionalLight('#ffe0ad', 3.4);
    light.position.set(-15, 26, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -24;
    light.shadow.camera.right = 24;
    light.shadow.camera.top = 24;
    light.shadow.camera.bottom = -24;
    light.shadow.camera.far = 65;
    light.shadow.normalBias = 0.035;
    light.shadow.bias = -0.0002;
    scene.add(light);
    const lampLight = new THREE.PointLight('#ffd092', 85, 36, 2);
    lampLight.position.set(-15.3, 3.5, -12);
    scene.add(lampLight);
    const coolFill = new THREE.DirectionalLight('#8ca9c5', 0.9);
    coolFill.position.set(18, 16, -15);
    scene.add(coolFill);
    foreground.add(new THREE.HemisphereLight('#fff4da', '#554936', 2.2));
    const handLight = new THREE.DirectionalLight('#ffe9c3', 2.2);
    handLight.position.set(-3, 7, 10);
    foreground.add(handLight);
    const environment = new THREE.Group(),
      board = new THREE.Group(),
      hand = new THREE.Group();
    scene.add(environment, board);
    foreground.add(hand);
    const eng: Engine = {
      scene,
      foreground,
      renderer,
      camera,
      handCamera,
      controls,
      environment,
      board,
      hand,
      pickables: [],
      cardPickables: [],
      cards: [],
      hoveredCard: null,
      center: new THREE.Vector3(),
      scale: 1,
      reducedMotion,
    };
    engine.current = eng;
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 },
      cardDown = false;
    const setPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
    };
    const getCard = () => {
      if (!eng.hand.visible) return undefined;
      eng.foreground.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, handCamera);
      return raycaster.intersectObjects(eng.cardPickables, false)[0]?.object.userData.cardId as
        string | undefined;
    };
    const pointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
      setPointer(event);
      cardDown = Boolean(getCard());
      if (cardDown) {
        controls.enabled = false;
        event.stopPropagation();
      }
    };
    const pointerMove = (event: PointerEvent) => {
      setPointer(event);
      const cardId = getCard();
      eng.hoveredCard = cardId ?? null;
      renderer.domElement.style.cursor = cardId ? 'pointer' : 'grab';
    };
    const pointerLeave = () => {
      eng.hoveredCard = null;
      controls.enabled = true;
    };
    const pointerUp = (event: PointerEvent) => {
      controls.enabled = true;
      if (Math.hypot(down.x - event.clientX, down.y - event.clientY) > 7) return;
      setPointer(event);
      const cardId = getCard();
      if (cardId) {
        onCardSelectRef.current?.(cardId);
        return;
      }
      if (cardDown) return;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(eng.pickables, false)[0];
      if (hit?.object.userData.selection)
        onSelectRef.current(hit.object.userData.selection as MapSelection);
    };
    const lostContext = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown, true);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerleave', pointerLeave);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('webglcontextlost', lostContext);
    const resizeScene = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      handCamera.left = -(width / height) * 5;
      handCamera.right = (width / height) * 5;
      handCamera.updateProjectionMatrix();
    };
    const resize = new ResizeObserver(resizeScene);
    resize.observe(el);
    resizeScene();
    let frame = 0;
    const position = new THREE.Vector3();
    const animate = () => {
      controls.update();
      for (const card of eng.cards) {
        const hover = card.cardId === eng.hoveredCard,
          y = card.baseY + (hover ? 0.52 : 0),
          z = card.baseZ + (hover ? 1 : 0);
        card.group.position.y = reducedMotion
          ? y
          : THREE.MathUtils.lerp(card.group.position.y, y, 0.23);
        card.group.position.z = reducedMotion
          ? z
          : THREE.MathUtils.lerp(card.group.position.z, z, 0.23);
      }
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(foreground, handCamera);
      for (const station of boardRef.current.stations) {
        const label = labels.current.get(station.id);
        if (!label) continue;
        position
          .set(
            (station.x - eng.center.x) * eng.scale,
            station.height * 0.65 + 0.3,
            (station.z - eng.center.z) * eng.scale + 0.91,
          )
          .project(camera);
        label.style.left = `${(position.x * 0.5 + 0.5) * el.clientWidth}px`;
        label.style.top = `${(-position.y * 0.5 + 0.5) * el.clientHeight}px`;
        label.style.visibility = position.z > 1 ? 'hidden' : 'visible';
      }
      frame = requestAnimationFrame(animate);
    };
    animate();
    setReady(true);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown, true);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', lostContext);
      disposeObjects(scene);
      disposeObjects(foreground);
      light.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, [fallback]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    buildEnvironment(eng, observation);
    buildBoard(eng, observation, selection);
    buildHand(eng, observation);
  }, [observation, selection, ready]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    eng.camera.position.set(0, topView ? 43 : 30.5, topView ? 0.5 : 32.5);
    eng.controls.target.set(0, 0.7, topView ? 0 : 2);
    eng.hand.visible = !topView;
    eng.controls.update();
  }, [topView, reset, ready]);
  if (fallback) {
    const xs = observation.stations.map((station) => station.x),
      zs = observation.stations.map((station) => station.z);
    const minX = Math.min(...xs),
      minZ = Math.min(...zs),
      spanX = Math.max(...xs) - minX || 1,
      spanZ = Math.max(...zs) - minZ || 1;
    const xy = (id: string) => {
      const station = observation.stations.find((item) => item.id === id)!;
      return {
        x: 50 + ((station.x - minX) / spanX) * 700,
        y: 45 + ((station.z - minZ) / spanZ) * 430,
      };
    };
    return (
      <div className="map-fallback">
        <span className="fallback-note">Схема города · 3D недоступен в этом браузере</span>
        <svg viewBox="0 0 800 520" aria-label="Схема железной дороги">
          {observation.edges.map((edge) => {
            const a = xy(edge.a),
              b = xy(edge.b);
            return (
              <g
                key={edge.id}
                onClick={() => onSelect({ kind: 'edge', id: edge.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(event) =>
                  event.key === 'Enter' && onSelect({ kind: 'edge', id: edge.id })
                }
                aria-label={`Линия ${edge.id}`}
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={railColors[edge.color]}
                  strokeWidth={edge.open ? 5 : 3}
                  strokeDasharray={edge.open ? '' : '8 6'}
                />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="22" />
              </g>
            );
          })}
          {observation.stations.map((station) => {
            const p = xy(station.id);
            return (
              <g
                key={station.id}
                onClick={() => onSelect({ kind: 'station', id: station.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(event) =>
                  event.key === 'Enter' && onSelect({ kind: 'station', id: station.id })
                }
                aria-label={station.name}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={15}
                  fill={station.flooded ? '#738989' : station.safe ? '#b6a578' : '#d7cfb4'}
                />
                <text x={p.x} y={p.y + 30} textAnchor="middle" fill="#eee6d2" fontSize="12">
                  {station.name}
                </text>
                <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#283d3e" fontSize="11">
                  {station.groups.length}
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
      className="diorama tabletop-diorama"
      aria-label="Объёмный макет Речного на диспетчерском столе. Вращайте мышью, выбирайте станции и линии. Карты материалов находятся в ваших руках."
    >
      <div className="map-labels">
        {observation.stations.map((station) => (
          <button
            key={station.id}
            ref={(el) => {
              if (el) labels.current.set(station.id, el);
              else labels.current.delete(station.id);
            }}
            className={`station-label tabletop-label ${station.safe ? 'safe' : ''} ${station.flooded ? 'flooded' : ''} ${selection?.id === station.id ? 'selected' : ''}`}
            onClick={() => onSelect({ kind: 'station', id: station.id })}
            title={`${station.name}. ${station.safe ? 'Убежище' : station.flooded ? 'Затоплена' : `${station.groups.length} групп, волна после раунда ${station.floodRound}`}`}
          >
            <span className="tabletop-label__name">{station.name}</span>
            <small className="tabletop-label__status">
              {station.safe
                ? 'УБЕЖИЩЕ'
                : station.flooded
                  ? 'ЗАКРЫТА'
                  : `${station.groups.length} гр. / ${station.floodRound}`}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
