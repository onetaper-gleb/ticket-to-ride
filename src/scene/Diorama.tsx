import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TABLE_CAMERA, tableOverviewFit } from './table-layout';
import { chooseBoardHit, interactionForHit } from './board-picking';
import { presentationCities, routeLayouts, cityLabels } from './board-layout';
import { EUROPE_LAND_RINGS, projectEurope } from '../data/europe-geography';
import type { Observation } from '../shared/types';
import type { TableInteraction, TableView } from './interaction';
import {
  buildBoard,
  buildEnvironment,
  buildHand,
  disposeObjects,
  railColors,
  type Engine,
  type MapSelection,
} from './tabletop';
import { buildTableInterface, updateTableHover } from './world-ui';
import {
  accumulateMovement,
  buildZoneLayouts,
  canReleasePress,
  emptyMovement,
  interactionKey,
  pointerZone,
  reconcileOption,
  stepOption,
  type Direction,
  type FocusZone,
  type OptionZone,
  type ZoneOption,
} from './zone-input';

export type { MapSelection } from './tabletop';
interface Props {
  observation: Observation;
  selection: MapSelection;
  onInteract: (interaction: TableInteraction) => void;
  view: TableView;
  topView: boolean;
  onBoardModeChange: (active: boolean) => void;
  reset: number;
  guidance?: { key: string; target: TableInteraction };
}
const materialNames = {
  red: 'Красный вагон',
  blue: 'Синий вагон',
  green: 'Зелёный вагон',
  yellow: 'Жёлтый вагон',
  orange: 'Оранжевый вагон',
  purple: 'Розовый вагон',
  black: 'Чёрный вагон',
  white: 'Белый вагон',
  wild: 'Локомотив',
};
type TableHit = { interaction: TableInteraction; enabled: boolean };
const sameInteraction = (a: TableInteraction | null, b: TableInteraction | null) =>
  a?.kind === b?.kind && a?.id === b?.id;
const hiddenControls: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

function AccessibleObjects({
  observation,
  view,
  onInteract,
  onFocusObject,
  visible = false,
}: {
  observation: Observation;
  view: TableView;
  onInteract: (interaction: TableInteraction) => void;
  onFocusObject?: (interaction: TableInteraction | null) => void;
  visible?: boolean;
}) {
  const objects: Array<{ interaction: TableInteraction; label: string; enabled: boolean }> = [
    ...view.controls.map((control) => ({
      interaction: { kind: 'control' as const, id: control.id },
      label: control.label,
      enabled: control.enabled,
    })),
    ...view.goals.map((goal) => ({
      interaction: { kind: 'objective' as const, id: goal.id },
      label: `${goal.selected ? 'Выбрано. ' : ''}${goal.label}. ${goal.progress}`,
      enabled: goal.enabled,
    })),
    {
      interaction: { kind: 'deck', id: 'deck' },
      label: 'Взять карту вслепую',
      enabled: view.deckEnabled,
    },
    ...observation.market.map((card, index) => ({
      interaction: { kind: 'market' as const, id: String(index) },
      label: `Открытая карта ${index + 1}: ${materialNames[card.color]}`,
      enabled: view.enabledMarketIndices.includes(index),
    })),
    ...observation.cities.map((city) => ({
      interaction: { kind: 'station' as const, id: city.id },
      label: `Город ${city.name}`,
      enabled: true,
    })),
    ...observation.edges.map((edge) => ({
      interaction: { kind: 'edge' as const, id: edge.id },
      label: `Маршрут ${observation.cities.find((city) => city.id === edge.a)?.name} — ${observation.cities.find((city) => city.id === edge.b)?.name}. ${edge.length} вагонов${edge.tunnel ? '. Тоннель' : ''}${edge.ferries ? `. Паром: ${edge.ferries} локомотивов` : ''}${edge.owner !== null ? `. Занят: ${observation.players[edge.owner]?.name}` : view.enabledEdgeIds.includes(edge.id) ? '. Можно занять' : '. Свободен'}`,
      enabled: true,
    })),
    ...observation.self.hand.map((card, index) => ({
      interaction: { kind: 'card' as const, id: card.id },
      label: `Карта в руке ${index + 1}: ${materialNames[card.color]}`,
      enabled: true,
    })),
  ];
  return (
    <div
      className={visible ? 'fallback-actions' : 'scene-accessibility'}
      style={visible ? undefined : hiddenControls}
      aria-label="Предметы и действия на столе"
    >
      {objects.map(({ interaction, label, enabled }) => (
        <button
          key={`${interaction.kind}-${interaction.id}`}
          data-table-kind={interaction.kind}
          data-table-id={interaction.id}
          disabled={!enabled}
          onFocus={() => onFocusObject?.(interaction)}
          onBlur={() => onFocusObject?.(null)}
          onClick={() => onInteract(interaction)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Fallback({
  observation,
  view,
  onInteract,
}: Pick<Props, 'observation' | 'view' | 'onInteract'>) {
  const cities = presentationCities(observation.cities);
  const routes = routeLayouts(observation.edges, cities);
  const labels = cityLabels(cities, routes);
  const pixel = (point: { x: number; z: number }) => ({
    x: 400 + point.x * 31.25,
    y: 260 + point.z * 31.25,
  });
  const xy = (id: string) => pixel(cities.find((city) => city.id === id)!);
  const land = EUROPE_LAND_RINGS.map(
    (ring) =>
      ring
        .map(([lon, lat], i) => {
          const p = pixel(projectEurope(lon, lat));
          return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        })
        .join(' ') + 'Z',
  ).join(' ');
  const activate = (kind: 'station' | 'edge', id: string) => onInteract({ kind, id });
  return (
    <div className="map-fallback tabletop-fallback">
      <span className="fallback-note">Карта Европы · 3D недоступен в этом браузере</span>
      <h2>{view.headline}</h2>
      <p>{view.notice}</p>
      {view.detailLines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
      <svg viewBox="0 0 800 520" aria-label="Схема железной дороги">
        <rect x="25" y="10" width="750" height="500" rx="3" fill="#a8bfb6" />
        <path d={land} fill="#e4d6b6" fillRule="evenodd" stroke="#819b90" strokeWidth="1" />
        {routes.map(({ edge, points }) => {
          const polyline = points
            .map((point) => {
              const p = pixel(point);
              return `${p.x},${p.y}`;
            })
            .join(' ');
          return (
            <g
              key={edge.id}
              onClick={() => activate('edge', edge.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  activate('edge', edge.id);
                }
              }}
              aria-label={`Линия ${edge.id}`}
            >
              <polyline
                points={polyline}
                stroke={
                  edge.owner !== null
                    ? observation.players.find((player) => player.id === edge.owner)?.color
                    : railColors[edge.color]
                }
                fill="none"
                strokeWidth={edge.owner !== null ? 5 : 3}
                strokeDasharray={edge.owner !== null ? '' : '8 6'}
              />
              <polyline points={polyline} fill="none" stroke="transparent" strokeWidth="10" />
            </g>
          );
        })}
        {labels.map((label) => {
          const station = label.city;
          const name = pixel(label);
          const p = xy(station.id);
          return (
            <g
              key={station.id}
              onClick={() => activate('station', station.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  activate('station', station.id);
                }
              }}
              aria-label={station.name}
            >
              <circle cx={p.x} cy={p.y} r={5} fill="#eee5ce" stroke="#aa9265" strokeWidth="2" />
              <text
                x={name.x}
                y={name.y + 3}
                textAnchor="middle"
                fill="#283b36"
                fontSize="9"
                paintOrder="stroke"
                stroke="#e4d6b6"
                strokeWidth="3"
              >
                {station.name}
              </text>
            </g>
          );
        })}
      </svg>
      <AccessibleObjects observation={observation} view={view} onInteract={onInteract} visible />
    </div>
  );
}

export default function Diorama({
  observation,
  selection,
  onInteract,
  view,
  topView,
  onBoardModeChange,
  reset,
  guidance,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const observationRef = useRef(observation);
  observationRef.current = observation;
  const viewRef = useRef(view);
  viewRef.current = view;
  const topViewRef = useRef(topView);
  topViewRef.current = topView;
  const onBoardModeChangeRef = useRef(onBoardModeChange);
  onBoardModeChangeRef.current = onBoardModeChange;
  const layoutsRef = useRef(buildZoneLayouts(observation, view));
  layoutsRef.current = buildZoneLayouts(observation, view);
  const focusZone = useRef<FocusZone>('neutral');
  const memories = useRef<Partial<Record<OptionZone, ZoneOption>>>({});
  const focusObject = useRef<(interaction: TableInteraction | null) => void>(() => {});
  const resetBoardView = useRef<() => void>(() => {});
  const keyboardObject = useRef<TableInteraction | null>(null);
  const previousReset = useRef(reset);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [fontRevision, setFontRevision] = useState(0);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      document.fonts.load('14px "IBM Plex Sans"'),
      document.fonts.load('14px "IBM Plex Mono"'),
    ])
      .then(() => {
        if (mounted) setFontRevision((revision) => revision + 1);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el || fallback) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor('#192527', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.cursor = 'none';
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const reflections = pmrem.fromScene(room, 0.04);
    scene.environment = reflections.texture;
    scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    scene.fog = new THREE.Fog('#192527', 55, 110);
    const foreground = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180);
    const handCamera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 30);
    handCamera.position.set(0, 0, 15);
    handCamera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.enabled = false;
    controls.enableDamping = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;
    scene.add(new THREE.HemisphereLight('#b7c4c0', '#332c24', 1.0));
    const light = new THREE.DirectionalLight('#ffe0ad', 2.2);
    light.position.set(-15, 26, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -26;
    light.shadow.camera.right = 26;
    light.shadow.camera.top = 26;
    light.shadow.camera.bottom = -26;
    light.shadow.camera.far = 65;
    light.shadow.normalBias = 0.035;
    light.shadow.bias = -0.0002;
    scene.add(light);
    const lampLight = new THREE.PointLight('#ffd092', 85, 36, 2);
    lampLight.position.set(-15.3, 3.5, -12);
    scene.add(lampLight);
    const coolFill = new THREE.DirectionalLight('#8ca9c5', 0.65);
    coolFill.position.set(18, 16, -15);
    scene.add(coolFill);
    foreground.add(new THREE.HemisphereLight('#fff4da', '#554936', 2.2));
    const handLight = new THREE.DirectionalLight('#ffe9c3', 2.2);
    handLight.position.set(-3, 7, 10);
    foreground.add(handLight);
    const environment = new THREE.Group(),
      board = new THREE.Group(),
      hand = new THREE.Group(),
      furniture = new THREE.Group();
    scene.add(environment, board, furniture);
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
      furniture,
      pickables: [],
      routePickCenters: new Map(),
      cardPickables: [],
      uiPickables: [],
      cards: [],
      hoveredCard: null,
      hoveredInteraction: null,
      animatedProps: [],
      pressedInteraction: null,
      center: new THREE.Vector3(),
      scale: 1,
      reducedMotion,
    };
    engine.current = eng;
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let pointerInside = false,
      lastPointer: { x: number; y: number } | null = null,
      movement = emptyMovement(),
      displayKey = '',
      down: {
        x: number;
        y: number;
        interaction: TableInteraction | null;
        dragged: boolean;
        revision: number;
        enabled: boolean;
        mode: 'seated' | 'board';
        zone: FocusZone;
      } | null = null;
    const boardMode = () => topViewRef.current;
    let boardZoom = 1;
    const boardPan = new THREE.Vector3();
    resetBoardView.current = () => {
      boardZoom = 1;
      boardPan.set(0, 0, 0);
    };
    const activeZone = (): FocusZone => focusZone.current;
    const selectedOption = (): ZoneOption | null => {
      const zone = activeZone();
      if (zone === 'neutral') return null;
      const selected = reconcileOption(layoutsRef.current[zone], memories.current[zone]);
      if (selected) memories.current[zone] = selected;
      return selected;
    };
    const publishInput = () => {
      const mode = boardMode() ? 'board' : 'seated';
      const zone = activeZone();
      const selected = eng.hoveredInteraction ? interactionKey(eng.hoveredInteraction) : '';
      const key = `${mode}/${zone}/${selected}`;
      if (key === displayKey) return;
      displayKey = key;
      el.dataset.inputMode = mode;
      el.dataset.focusZone = zone;
      el.dataset.selectedObject = selected;
      el.classList.toggle('board-mode', mode === 'board');
      el.style.cursor = renderer.domElement.style.cursor = mode === 'board' ? 'crosshair' : 'none';
    };
    const changeBoardMode = (active: boolean) => {
      topViewRef.current = active;
      resetBoardView.current();
      focusZone.current = 'neutral';
      keyboardObject.current = null;
      movement = emptyMovement();
      lastPointer = null;
      down = null;
      eng.hoveredInteraction = null;
      eng.hoveredCard = null;
      eng.pressedInteraction = null;
      onBoardModeChangeRef.current(active);
      publishInput();
    };
    const showLogicalSelection = () => {
      const selected = selectedOption();
      eng.hoveredInteraction = selected?.interaction ?? null;
      eng.hoveredCard = selected?.interaction.kind === 'card' ? selected.interaction.id : null;
      publishInput();
    };
    const navigate = (direction: Direction) => {
      const zone = activeZone(),
        selected = selectedOption();
      if (zone === 'neutral' || !selected) return;
      memories.current[zone] = stepOption(layoutsRef.current[zone], selected, direction);
      keyboardObject.current = null;
      showLogicalSelection();
    };
    const interactionZone = (interaction: TableInteraction): OptionZone | null => {
      if (interaction.kind === 'card') return 'hand';
      if (interaction.kind === 'market' || interaction.kind === 'deck') return 'deck';
      if (interaction.kind === 'objective') return 'goals';
      if (interaction.kind === 'control') {
        const control = viewRef.current.controls.find((item) => item.id === interaction.id);
        return control?.placement === 'dock' || control?.placement === 'bell' ? 'dock' : 'paper';
      }
      return null;
    };
    focusObject.current = (interaction) => {
      if (!interaction) {
        keyboardObject.current = null;
        return;
      }
      const zone = interactionZone(interaction);
      if (zone) {
        if (boardMode()) changeBoardMode(false);
        focusZone.current = zone;
        const option = layoutsRef.current[zone].find((item) =>
          sameInteraction(item.interaction, interaction),
        );
        if (option) memories.current[zone] = option;
      } else {
        if (!boardMode()) changeBoardMode(true);
      }
      keyboardObject.current = interaction;
      eng.hoveredInteraction = interaction;
      eng.hoveredCard = interaction.kind === 'card' ? interaction.id : null;
      movement = emptyMovement();
      lastPointer = null;
      publishInput();
    };
    const setPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
    };
    const currentHit = (): TableHit | null => {
      if (keyboardObject.current) {
        const interaction = keyboardObject.current;
        const zone = interactionZone(interaction);
        const enabled = zone
          ? layoutsRef.current[zone].find((item) => sameInteraction(item.interaction, interaction))
              ?.enabled === true
          : true;
        return { interaction, enabled };
      }
      if (!boardMode()) {
        const selected = selectedOption();
        return selected ? { interaction: selected.interaction, enabled: selected.enabled } : null;
      }
      // A visible pointer exists only in the enlarged city. Furniture is never raycast here.
      eng.scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(eng.pickables, false);
      const hit = chooseBoardHit(hits, camera, pointer, eng.routePickCenters);
      if (!hit) return null;
      const interaction = interactionForHit(hit);
      return interaction ? { interaction, enabled: hit.object.userData.enabled !== false } : null;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      keyboardObject.current = null;
      setPointer(event);
      const hit = currentHit();
      down = {
        x: event.clientX,
        y: event.clientY,
        interaction: hit?.interaction ?? null,
        dragged: false,
        revision: observationRef.current.revision,
        enabled: hit?.enabled ?? false,
        mode: boardMode() ? 'board' : 'seated',
        zone: activeZone(),
      };
      eng.pressedInteraction = hit?.enabled ? hit.interaction : null;
    };
    const pointerMove = (event: PointerEvent) => {
      setPointer(event);
      if (boardMode() && down && lastPointer) {
        const bounds = renderer.domElement.getBoundingClientRect();
        boardPan.x = THREE.MathUtils.clamp(
          boardPan.x - ((event.clientX - lastPointer.x) / bounds.width) * 24 * boardZoom,
          -7,
          7,
        );
        boardPan.z = THREE.MathUtils.clamp(
          boardPan.z - ((event.clientY - lastPointer.y) / bounds.height) * 18 * boardZoom,
          -6,
          6,
        );
      }
      pointerInside = true;
      keyboardObject.current = null;
      if (down && Math.hypot(down.x - event.clientX, down.y - event.clientY) > 6)
        down.dragged = true;
      if (!boardMode()) {
        const previous = activeZone();
        const zone = pointerZone((pointer.x + 1) / 2, (1 - pointer.y) / 2, previous, camera.aspect);
        focusZone.current = zone;
        if (zone !== previous || !lastPointer) movement = emptyMovement();
        else if (zone !== 'neutral') {
          const next = accumulateMovement(
            movement,
            event.clientX - lastPointer.x,
            event.clientY - lastPointer.y,
          );
          movement = next.movement;
          if (next.direction) navigate(next.direction);
        }
      }
      lastPointer = { x: event.clientX, y: event.clientY };
      const hit = currentHit();
      eng.hoveredInteraction = hit?.interaction ?? null;
      eng.hoveredCard = hit?.interaction.kind === 'card' ? hit.interaction.id : null;
      publishInput();
    };
    const pointerLeave = () => {
      pointerInside = false;
      focusZone.current = 'neutral';
      keyboardObject.current = null;
      lastPointer = null;
      movement = emptyMovement();
      eng.hoveredCard = null;
      eng.hoveredInteraction = null;
      eng.pressedInteraction = null;
      down = null;
      publishInput();
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || !down) return;
      const started = down;
      down = null;
      eng.pressedInteraction = null;
      if (!canReleasePress(started, event.clientX, event.clientY, observationRef.current.revision))
        return;
      if (started.mode !== (boardMode() ? 'board' : 'seated')) return;
      setPointer(event);
      if (started.mode === 'seated' && started.zone === 'neutral' && activeZone() === 'neutral') {
        changeBoardMode(true);
        return;
      }
      if (!started.enabled) return;
      const hit = currentHit();
      if (hit?.enabled && sameInteraction(started.interaction, hit.interaction))
        onInteractRef.current(hit.interaction);
    };
    const pointerCancel = () => {
      down = null;
      eng.pressedInteraction = null;
      movement = emptyMovement();
      lastPointer = null;
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (boardMode()) changeBoardMode(false);
        else onInteractRef.current({ kind: 'control', id: 'menu' });
      } else if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) changeBoardMode(!boardMode());
      } else if (!boardMode() && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
        event.preventDefault();
        navigate(event.key.slice(5).toLowerCase() as Direction);
      } else if (
        event.key === 'Enter' &&
        !event.repeat &&
        target instanceof Node &&
        el.contains(target)
      ) {
        event.preventDefault();
        const hit = currentHit();
        if (hit?.enabled) onInteractRef.current(hit.interaction);
      }
    };
    const wheel = (event: WheelEvent) => {
      if (!boardMode()) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      boardZoom = THREE.MathUtils.clamp(
        boardZoom * Math.exp(event.deltaY * unit * 0.001),
        0.62,
        1.15,
      );
    };
    const lostContext = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerleave', pointerLeave);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointercancel', pointerCancel);
    renderer.domElement.addEventListener('webglcontextlost', lostContext);
    renderer.domElement.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keyDown);
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
    const cameraGoal = new THREE.Vector3(),
      targetGoal = new THREE.Vector3();
    let frame = 0;
    const animate = () => {
      const plan = boardMode(),
        zone = activeZone();
      const cameraView = plan
        ? TABLE_CAMERA.board
        : zone === 'neutral'
          ? TABLE_CAMERA.overview
          : TABLE_CAMERA[zone];
      cameraGoal.fromArray(cameraView.position);
      targetGoal.fromArray(cameraView.target);
      if (plan) {
        cameraGoal.multiplyScalar(boardZoom).add(boardPan);
        targetGoal.add(boardPan);
      }
      if (plan || zone === 'goals' || zone === 'dock' || zone === 'neutral' || zone === 'hand') {
        const fit =
          zone === 'neutral' || zone === 'hand'
            ? tableOverviewFit(camera.aspect)
            : Math.max(1, (plan ? 1.48 : 1.35) / camera.aspect);
        cameraGoal.sub(targetGoal).multiplyScalar(fit).add(targetGoal);
      }
      const blend = reducedMotion ? 1 : 0.085;
      if (!down || plan) {
        camera.position.lerp(cameraGoal, blend);
        controls.target.lerp(targetGoal, blend);
        camera.lookAt(controls.target);
      }
      eng.hand.visible = !plan;
      eng.hand.position.y = reducedMotion
        ? zone === 'hand'
          ? 0.65
          : -1.1
        : THREE.MathUtils.lerp(eng.hand.position.y, zone === 'hand' ? 0.65 : -1.1, 0.16);
      eng.hand.scale.setScalar(zone === 'hand' ? 1.16 : 1);
      for (const card of eng.cards) {
        const hover = card.cardId === eng.hoveredCard && zone === 'hand',
          selected = viewRef.current.selectedCardIds.includes(card.cardId),
          y = card.baseY + (hover ? 0.95 : selected ? 0.25 : 0),
          z = card.baseZ + (hover ? 1 : 0);
        card.group.position.y = reducedMotion
          ? y
          : THREE.MathUtils.lerp(card.group.position.y, y, 0.23);
        card.group.position.z = reducedMotion
          ? z
          : THREE.MathUtils.lerp(card.group.position.z, z, 0.23);
        const cardScale = hover ? 1.65 : 1;
        card.group.scale.setScalar(
          reducedMotion ? cardScale : THREE.MathUtils.lerp(card.group.scale.x, cardScale, 0.23),
        );
      }
      if (keyboardObject.current) {
        eng.hoveredInteraction = keyboardObject.current;
        eng.hoveredCard = keyboardObject.current.kind === 'card' ? keyboardObject.current.id : null;
      } else if (!plan) {
        showLogicalSelection();
      } else if (pointerInside && !down) {
        const hit = currentHit();
        eng.hoveredInteraction = hit?.interaction ?? null;
        eng.hoveredCard = hit?.interaction.kind === 'card' ? hit.interaction.id : null;
      }
      publishInput();
      updateTableHover(eng, eng.pressedInteraction ?? null);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(foreground, handCamera);
      frame = requestAnimationFrame(animate);
    };
    const initialView = boardMode() ? TABLE_CAMERA.board : TABLE_CAMERA.overview;
    camera.position.fromArray(initialView.position);
    controls.target.fromArray(initialView.target);
    camera.lookAt(controls.target);
    animate();
    setReady(true);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerCancel);
      renderer.domElement.removeEventListener('webglcontextlost', lostContext);
      renderer.domElement.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keyDown);
      disposeObjects(scene);
      disposeObjects(foreground);
      light.shadow.map?.dispose();
      reflections.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
      focusObject.current = () => {};
      resetBoardView.current = () => {};
    };
  }, [fallback]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    buildEnvironment(eng, observation);
  }, [observation, ready, fontRevision]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    buildBoard(eng, observation, selection, view, topView);
    buildHand(eng, observation, view.selectedCardIds);
    buildTableInterface(eng, observation, view);
  }, [observation, selection, view, ready, fontRevision, topView]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    resetBoardView.current();
    const resetChanged = previousReset.current !== reset;
    previousReset.current = reset;
    if (
      resetChanged ||
      (!topView && ['station', 'edge'].includes(keyboardObject.current?.kind ?? ''))
    )
      keyboardObject.current = null;
    if (!keyboardObject.current) focusZone.current = 'neutral';
    eng.hoveredInteraction = null;
    eng.hoveredCard = null;
    if (eng.reducedMotion) {
      const cameraView = topView ? TABLE_CAMERA.board : TABLE_CAMERA.overview;
      eng.camera.position.fromArray(cameraView.position);
      eng.controls.target.fromArray(cameraView.target);
      eng.camera.lookAt(eng.controls.target);
    }
  }, [topView, reset, ready]);
  useEffect(() => {
    if (ready && guidance) focusObject.current(guidance.target);
  }, [guidance?.key, ready]);
  if (fallback) return <Fallback observation={observation} view={view} onInteract={onInteract} />;
  return (
    <div
      ref={host}
      className={`diorama tabletop-diorama${topView ? ' board-mode' : ''}`}
      style={{ cursor: topView ? 'crosshair' : 'none' }}
      data-input-mode={topView ? 'board' : 'seated'}
      data-focus-zone={focusZone.current}
      role="group"
      aria-label="Железнодорожный стол. Наведите мышь в область вагонов слева, билетов снизу слева, руки снизу, листа справа или управления снизу справа. Двигайте мышь на одну опцию в нужную сторону. Нажатие на пустом столе или пробел приближает поле и показывает курсор; пробел или Escape возвращает к столу. На поле колесо меняет масштаб, перетаскивание двигает карту. Tab выбирает предметы, стрелки меняют опцию, Enter действует."
    >
      <AccessibleObjects
        observation={observation}
        view={view}
        onInteract={onInteract}
        onFocusObject={(interaction) => focusObject.current(interaction)}
      />
    </div>
  );
}
