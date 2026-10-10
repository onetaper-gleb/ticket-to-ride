import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TABLE_CAMERA, tableOverviewFit } from './table-layout';
import {
  addMouseLook,
  advanceMouseLook,
  cameraFocusReady,
  emptyMouseLook,
  motionBlend,
} from './camera-motion';
import { emptyGesture, feedGesture } from './vector-motion';
import {
  createPointerLockController,
  measureRelativePress,
  type PointerLockState,
} from './pointer-lock';
import { chooseBoardHit, interactionForHit } from './board-picking';
import { presentationCities, routeLayouts, cityLabels } from './board-layout';
import { EUROPE_LAND_RINGS, projectEurope } from '../data/europe-geography';
import type { Observation } from '../shared/types';
import type { TableInteraction, TableView } from './interaction';
import {
  buildBoard,
  buildEnvironment,
  buildHand,
  updateHandGrips,
  disposeObjects,
  railColors,
  type Engine,
  type MapSelection,
} from './tabletop';
import { buildTableInterface, updateTableHover } from './world-ui';
import {
  buildZoneLayouts,
  canReleasePress,
  gestureThresholds,
  interactionKey,
  interactionAllowed,
  interactionZone,
  neighborFocusZone,
  permittedPointerZone,
  reconcileOption,
  returnFocusZone,
  stepOption,
  zoneAllowed,
  type Direction,
  type FocusZone,
  type InputPolicy,
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
  inputPolicy?: InputPolicy;
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
  inputPolicy,
  visible = false,
}: {
  observation: Observation;
  view: TableView;
  onInteract: (interaction: TableInteraction) => void;
  onFocusObject?: (interaction: TableInteraction | null) => void;
  inputPolicy?: InputPolicy;
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
          disabled={!enabled || !interactionAllowed(interaction, view, inputPolicy)}
          onFocus={() => onFocusObject?.(interaction)}
          onBlur={() => onFocusObject?.(null)}
          onClick={() => {
            if (enabled && interactionAllowed(interaction, view, inputPolicy))
              onInteract(interaction);
          }}
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
  inputPolicy,
}: Pick<Props, 'observation' | 'view' | 'onInteract' | 'inputPolicy'>) {
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
  const boardAllowed = inputPolicy?.boardAllowed !== false;
  const activate = (kind: 'station' | 'edge', id: string) => {
    if (boardAllowed) onInteract({ kind, id });
  };
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
        {routes.map((route) => {
          const { edge, points, inkPaths, slots } = route;
          const color =
            edge.owner !== null
              ? observation.players.find((player) => player.id === edge.owner)?.color
              : edge.color === 'white'
                ? '#a59f8c'
                : railColors[edge.color];
          return (
            <g
              key={edge.id}
              onClick={() => activate('edge', edge.id)}
              role="button"
              tabIndex={boardAllowed ? 0 : -1}
              aria-disabled={!boardAllowed}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  activate('edge', edge.id);
                }
              }}
              aria-label={`Линия ${edge.id}`}
            >
              {(inkPaths ?? [points]).map((path, index) => (
                <polyline
                  key={index}
                  points={path
                    .map((point) => {
                      const p = pixel(point);
                      return `${p.x},${p.y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.03 * 31.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="stroke"
                />
              ))}
              {slots.map((slot, index) => {
                const p = pixel(slot.position);
                const width = route.width * 0.93 * 31.25;
                const length = route.coachLength * 0.93 * 31.25;
                return (
                  <rect
                    key={index}
                    transform={`translate(${p.x} ${p.y}) rotate(${(-slot.angle * 180) / Math.PI})`}
                    x={-width / 2}
                    y={-length / 2}
                    width={width}
                    height={length}
                    rx={0.018 * (route.width / 0.3) * 31.25}
                    fill={color}
                    stroke="#66756b"
                    strokeWidth="0.3"
                  />
                );
              })}
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
              tabIndex={boardAllowed ? 0 : -1}
              aria-disabled={!boardAllowed}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  activate('station', station.id);
                }
              }}
              aria-label={station.name}
            >
              <polyline
                points={(label.leader ?? [station, label])
                  .map((point) => {
                    const vertex = pixel(point);
                    return `${vertex.x},${vertex.y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#696d59"
                strokeWidth="0.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
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
      <AccessibleObjects
        observation={observation}
        view={view}
        onInteract={onInteract}
        inputPolicy={inputPolicy}
        visible
      />
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
  inputPolicy,
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
  const synchronizeView = useRef<(resetChanged?: boolean) => void>(() => {});
  const applyInputPolicy = useRef<() => void>(() => {});
  const inputPolicyRef = useRef(inputPolicy);
  inputPolicyRef.current = inputPolicy;
  const inputPolicyKey = inputPolicy
    ? `${inputPolicy.allowedZones.join(',')}/${inputPolicy.boardAllowed}/${inputPolicy.returnZone ?? ''}`
    : '';
  const keyboardObject = useRef<TableInteraction | null>(null);
  const previousReset = useRef(reset);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [lockState, setLockState] = useState<PointerLockState>('released');
  const acquirePointer = useRef<() => void>(() => {});
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
    renderer.domElement.style.cursor = 'auto';
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
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;
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
      grips: [],
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
      movement = emptyGesture(),
      mouseLook = emptyMouseLook(),
      lastLookTime = performance.now(),
      renderedLook = { x: 0, y: 0 },
      displayKey = '',
      inputEpoch = 0,
      cameraReady = true,
      down: {
        x: number;
        y: number;
        interaction: TableInteraction | null;
        dragged: boolean;
        revision: number;
        enabled: boolean;
        mode: 'seated' | 'board';
        zone: FocusZone;
        inputEpoch: number;
        cameraReady: boolean;
        pointerId: number;
        relativeDistance: number;
      } | null = null;
    const boardMode = () => topViewRef.current;
    const ownsPointerLock = () => document.pointerLockElement === renderer.domElement;
    let acquisition: { pointerId: number; x: number; y: number; dragged: boolean } | null = null;
    let rulesReturnZone: FocusZone | null = null;
    let previousRulesOpen = viewRef.current.rulesOpen === true;
    let boardZoom = 1;
    const boardPan = new THREE.Vector3();
    resetBoardView.current = () => {
      boardZoom = 1;
      boardPan.set(0, 0, 0);
    };
    const activeZone = (): FocusZone => {
      focusZone.current = permittedPointerZone(
        focusZone.current,
        focusZone.current,
        inputPolicyRef.current,
      );
      return focusZone.current;
    };
    let lastNonRulesZone = focusZone.current;
    let previousSeatedZone = activeZone();
    let previousBoardMode = boardMode();
    const setFocusZone = (zone: FocusZone) => {
      acquisition = null;
      if (focusZone.current === zone) return;
      focusZone.current = zone;
      inputEpoch++;
      cameraReady = false;
      movement = emptyGesture();
      mouseLook = emptyMouseLook();
      lastLookTime = performance.now();
      down = null;
      eng.pressedInteraction = null;
    };
    const selectedOption = (): ZoneOption | null => {
      const zone = activeZone();
      if (zone === 'neutral') return null;
      const selected = reconcileOption(layoutsRef.current[zone], memories.current[zone]);
      if (selected) memories.current[zone] = selected;
      return selected;
    };
    const publishInput = () => {
      const mode = boardMode() ? 'board' : 'seated';
      if (!viewRef.current.rulesOpen) lastNonRulesZone = focusZone.current;
      const zone = activeZone();
      const selected = eng.hoveredInteraction ? interactionKey(eng.hoveredInteraction) : '';
      const key = `${mode}/${zone}/${selected}/${cameraReady}/${ownsPointerLock()}`;
      if (key === displayKey) return;
      displayKey = key;
      el.dataset.inputMode = mode;
      el.dataset.focusZone = zone;
      el.dataset.selectedObject = selected;
      el.dataset.cameraReady = String(cameraReady);
      if (cameraReady) delete el.dataset.waitingForCamera;
      el.classList.toggle('board-mode', mode === 'board');
      el.dataset.pointerLock = ownsPointerLock() ? 'locked' : lock.state;
      el.style.cursor = renderer.domElement.style.cursor = mode === 'board' ? 'crosshair' : 'auto';
    };
    const invalidateGesture = () => {
      acquisition = null;
      inputEpoch++;
      cameraReady = false;
      keyboardObject.current = null;
      movement = emptyGesture();
      mouseLook = emptyMouseLook();
      lastLookTime = performance.now();
      lastPointer = null;
      down = null;
      eng.hoveredInteraction = null;
      eng.hoveredCard = null;
      eng.pressedInteraction = null;
    };
    synchronizeView.current = (resetChanged = false) => {
      const active = boardMode();
      if (!resetChanged && previousBoardMode === active) return;
      if (resetChanged) {
        memories.current = {};
        previousSeatedZone = returnFocusZone('neutral', inputPolicyRef.current);
      } else if (active) previousSeatedZone = activeZone();
      if (!active) setFocusZone(returnFocusZone(previousSeatedZone, inputPolicyRef.current));
      previousBoardMode = active;
      lock.release();
      resetBoardView.current();
      invalidateGesture();
      publishInput();
    };
    const changeBoardMode = (active: boolean) => {
      if (active && inputPolicyRef.current?.boardAllowed === false) return;
      if (boardMode() === active) return;
      topViewRef.current = active;
      synchronizeView.current();
      onBoardModeChangeRef.current(active);
    };
    applyInputPolicy.current = () => {
      const rulesOpen = viewRef.current.rulesOpen === true;
      if (rulesOpen && !previousRulesOpen) rulesReturnZone = lastNonRulesZone;
      const restoredZone = !rulesOpen && previousRulesOpen ? rulesReturnZone : null;
      previousRulesOpen = rulesOpen;
      const policy = inputPolicyRef.current;
      const initialZone = policy
        ? returnFocusZone(policy.allowedZones[0] ?? 'neutral', policy)
        : activeZone();
      const nextZone = restoredZone ? returnFocusZone(restoredZone, policy) : initialZone;
      previousSeatedZone = nextZone;
      setFocusZone(nextZone);
      invalidateGesture();
      if (boardMode() && policy?.boardAllowed === false) changeBoardMode(false);
      publishInput();
    };
    const showLogicalSelection = () => {
      const selected = selectedOption();
      eng.hoveredInteraction = selected?.interaction ?? null;
      eng.hoveredCard = selected?.interaction.kind === 'card' ? selected.interaction.id : null;
      publishInput();
    };
    const navigate = (direction: Direction, switchCollection = false) => {
      const zone = activeZone(),
        selected = selectedOption();
      const next =
        zone !== 'neutral' && selected
          ? stepOption(layoutsRef.current[zone], selected, direction)
          : null;
      if (next && next !== selected && zone !== 'neutral') memories.current[zone] = next;
      else if (switchCollection)
        setFocusZone(neighborFocusZone(zone, direction, inputPolicyRef.current));
      keyboardObject.current = null;
      showLogicalSelection();
    };
    focusObject.current = (interaction) => {
      lock.release();
      if (!interaction) {
        keyboardObject.current = null;
        return;
      }
      if (!interactionAllowed(interaction, viewRef.current, inputPolicyRef.current)) return;
      const zone = interactionZone(interaction, viewRef.current);
      if (zone && zoneAllowed(zone, inputPolicyRef.current)) {
        if (boardMode()) changeBoardMode(false);
        setFocusZone(zone);
        const option = layoutsRef.current[zone].find((item) =>
          sameInteraction(item.interaction, interaction),
        );
        if (option) memories.current[zone] = option;
      } else if (!zone) {
        if (!boardMode()) changeBoardMode(true);
      }
      keyboardObject.current = interaction;
      eng.hoveredInteraction = interaction;
      eng.hoveredCard = interaction.kind === 'card' ? interaction.id : null;
      movement = emptyGesture();
      lastPointer = null;
      publishInput();
    };
    const advanceLook = (now: number) => {
      now = Math.max(now, lastLookTime);
      if (!down)
        mouseLook = advanceMouseLook(
          mouseLook,
          Math.max(0, now - lastLookTime) / 1000,
          reducedMotion,
        );
      lastLookTime = now;
    };
    const setPointer = (event: MouseEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
    };
    const currentHit = (): TableHit | null => {
      if (keyboardObject.current) {
        const interaction = keyboardObject.current;
        if (!interactionAllowed(interaction, viewRef.current, inputPolicyRef.current)) return null;
        const zone = interactionZone(interaction, viewRef.current);
        const enabled = zone
          ? layoutsRef.current[zone].find((item) => sameInteraction(item.interaction, interaction))
              ?.enabled === true
          : true;
        return { interaction, enabled };
      }
      if (!boardMode()) {
        if (!zoneAllowed(activeZone(), inputPolicyRef.current)) return null;
        const selected = selectedOption();
        return selected ? { interaction: selected.interaction, enabled: selected.enabled } : null;
      }
      if (inputPolicyRef.current?.boardAllowed === false) return null;
      if (!cameraReady) return null;
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
      if (event.button !== 0 || event.pointerType !== 'mouse') return;
      if (!boardMode()) {
        if (!ownsPointerLock() && lock.state !== 'requesting')
          acquisition = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            dragged: false,
          };
        return;
      }
      down = null;
      eng.pressedInteraction = null;
      keyboardObject.current = null;
      setPointer(event);
      movement = emptyGesture();
      lastPointer = { x: event.clientX, y: event.clientY };
      if (!boardMode()) showLogicalSelection();
      const hit = currentHit();
      mouseLook = { ...emptyMouseLook(), ...renderedLook };
      lastLookTime = performance.now();
      if (!cameraReady) el.dataset.waitingForCamera = 'true';
      down = {
        x: event.clientX,
        y: event.clientY,
        interaction: hit?.interaction ?? null,
        dragged: false,
        revision: observationRef.current.revision,
        enabled: hit?.enabled ?? false,
        mode: boardMode() ? 'board' : 'seated',
        zone: activeZone(),
        inputEpoch,
        cameraReady,
        pointerId: event.pointerId,
        relativeDistance: 0,
      };
      eng.pressedInteraction = hit?.enabled && cameraReady ? hit.interaction : null;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!boardMode()) {
        if (
          acquisition &&
          Math.hypot(event.clientX - acquisition.x, event.clientY - acquisition.y) > 6
        )
          acquisition.dragged = true;
        return;
      }
      setPointer(event);
      pointerInside = true;
      keyboardObject.current = null;
      const dx = lastPointer ? event.clientX - lastPointer.x : 0;
      const dy = lastPointer ? event.clientY - lastPointer.y : 0;
      const now = performance.now();
      if (down && Math.hypot(down.x - event.clientX, down.y - event.clientY) > 6)
        down.dragged = true;
      if (boardMode() && down?.dragged && lastPointer) {
        const bounds = renderer.domElement.getBoundingClientRect();
        boardPan.x = THREE.MathUtils.clamp(
          boardPan.x - (dx / bounds.width) * 24 * boardZoom,
          -7,
          7,
        );
        boardPan.z = THREE.MathUtils.clamp(
          boardPan.z - (dy / bounds.height) * 18 * boardZoom,
          -6,
          6,
        );
      }
      advanceLook(now);
      if (!down && lastPointer) {
        mouseLook = addMouseLook(mouseLook, dx, dy, reducedMotion);
      }
      lastPointer = { x: event.clientX, y: event.clientY };
      const hit = currentHit();
      eng.hoveredInteraction = hit?.interaction ?? null;
      eng.hoveredCard = hit?.interaction.kind === 'card' ? hit.interaction.id : null;
      publishInput();
    };
    const pointerLeave = () => {
      if (ownsPointerLock()) return;
      acquisition = null;
      pointerInside = false;
      keyboardObject.current = null;
      lastPointer = null;
      movement = emptyGesture();
      mouseLook = emptyMouseLook();
      lastLookTime = performance.now();
      eng.hoveredCard = null;
      eng.hoveredInteraction = null;
      eng.pressedInteraction = null;
      down = null;
      publishInput();
    };
    const pointerUp = (event: PointerEvent) => {
      if (!boardMode()) {
        const entered = acquisition;
        acquisition = null;
        if (
          event.button === 0 &&
          entered &&
          entered.pointerId === event.pointerId &&
          !entered.dragged &&
          Math.hypot(event.clientX - entered.x, event.clientY - entered.y) <= 6
        )
          acquirePointer.current();
        return;
      }
      if (event.button !== 0 || !down || event.pointerId !== down.pointerId) return;
      const started = down;
      down = null;
      eng.pressedInteraction = null;
      lastLookTime = performance.now();
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      if (
        !canReleasePress(
          started,
          event.clientX,
          event.clientY,
          observationRef.current.revision,
          inputEpoch,
        )
      )
        return;
      if (started.mode !== (boardMode() ? 'board' : 'seated')) return;
      if (!cameraReady || started.zone !== activeZone()) return;
      setPointer(event);
      if (started.mode === 'seated' && started.zone === 'neutral' && activeZone() === 'neutral') {
        changeBoardMode(true);
        return;
      }
      if (!started.enabled) return;
      const hit = currentHit();
      if (
        hit?.enabled &&
        interactionAllowed(hit.interaction, viewRef.current, inputPolicyRef.current) &&
        sameInteraction(started.interaction, hit.interaction)
      )
        onInteractRef.current(hit.interaction);
    };
    const pointerCancel = () => {
      acquisition = null;
      const capturedId = down?.pointerId;
      down = null;
      eng.pressedInteraction = null;
      movement = emptyGesture();
      mouseLook = emptyMouseLook();
      lastLookTime = performance.now();
      lastPointer = null;
      if (
        capturedId !== undefined &&
        capturedId >= 0 &&
        renderer.domElement.hasPointerCapture(capturedId)
      )
        renderer.domElement.releasePointerCapture(capturedId);
    };
    const resetPointerInput = () => {
      pointerInside = false;
      acquisition = null;
      pointerCancel();
      inputEpoch++;
      keyboardObject.current = null;
    };
    const lock = createPointerLockController(
      {
        isLocked: ownsPointerLock,
        request: () => {
          delete el.dataset.pointerLockError;
          try {
            const pending = renderer.domElement.requestPointerLock();
            return pending?.catch((error: unknown) => {
              el.dataset.pointerLockError = error instanceof Error ? error.name : 'Error';
              throw error;
            });
          } catch (error) {
            el.dataset.pointerLockError = error instanceof Error ? error.name : 'Error';
            throw error;
          }
        },
        exit: () => document.exitPointerLock(),
      },
      (state) => {
        resetPointerInput();
        setLockState(state);
        publishInput();
      },
    );
    acquirePointer.current = () => {
      if (boardMode() || document.hidden || !document.hasFocus()) return;
      el.focus({ preventScroll: true });
      resetPointerInput();
      lock.request();
    };
    const lockChanged = () => lock.changed();
    const lockError = () => lock.failed();
    const releasePointerInput = () => {
      lock.release();
      resetPointerInput();
    };
    const focusChanged = (event: FocusEvent) => {
      if (event.target instanceof Node && !el.contains(event.target)) releasePointerInput();
    };
    const mouseDown = (event: MouseEvent) => {
      if (boardMode() || lock.state !== 'locked' || !ownsPointerLock() || event.button !== 0)
        return;
      pointerCancel();
      keyboardObject.current = null;
      showLogicalSelection();
      const hit = currentHit();
      mouseLook = { ...emptyMouseLook(), ...renderedLook };
      down = {
        x: 0,
        y: 0,
        interaction: hit?.interaction ?? null,
        dragged: false,
        relativeDistance: 0,
        revision: observationRef.current.revision,
        enabled: hit?.enabled ?? false,
        mode: 'seated',
        zone: activeZone(),
        inputEpoch,
        cameraReady,
        pointerId: -1,
      };
      eng.pressedInteraction = hit?.enabled && cameraReady ? hit.interaction : null;
      if (!cameraReady) el.dataset.waitingForCamera = 'true';
    };
    const mouseMove = (event: MouseEvent) => {
      if (boardMode() || lock.state !== 'locked' || !ownsPointerLock()) return;
      const dx = event.movementX,
        dy = event.movementY;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      keyboardObject.current = null;
      if (down) {
        const press = measureRelativePress(
          { distance: down.relativeDistance, dragged: down.dragged },
          dx,
          dy,
        );
        down.relativeDistance = press.distance;
        down.dragged = press.dragged;
        return;
      }
      const now = performance.now();
      advanceLook(now);
      mouseLook = addMouseLook(mouseLook, dx, dy, reducedMotion);
      if (cameraReady) {
        const time = event.timeStamp > 0 ? event.timeStamp : now;
        let next = feedGesture(
          movement,
          dx,
          dy,
          time,
          gestureThresholds(
            activeZone(),
            selectedOption(),
            layoutsRef.current,
            inputPolicyRef.current,
          ),
        );
        const maxSteps =
          Math.max(...Object.values(layoutsRef.current).map((options) => options.length)) + 1;
        for (let steps = 0; steps < maxSteps; steps++) {
          movement = next.state;
          if (!next.direction) break;
          const before = activeZone();
          navigate(next.direction, true);
          if (activeZone() !== before) break;
          next = feedGesture(
            movement,
            0,
            0,
            time,
            gestureThresholds(
              activeZone(),
              selectedOption(),
              layoutsRef.current,
              inputPolicyRef.current,
            ),
          );
        }
      } else movement = emptyGesture();
      showLogicalSelection();
    };
    const mouseUp = (event: MouseEvent) => {
      if (
        boardMode() ||
        lock.state !== 'locked' ||
        !ownsPointerLock() ||
        event.button !== 0 ||
        !down ||
        down.pointerId !== -1
      )
        return;
      const started = down;
      down = null;
      eng.pressedInteraction = null;
      lastLookTime = performance.now();
      if (
        !canReleasePress(started, 0, 0, observationRef.current.revision, inputEpoch) ||
        !cameraReady ||
        started.zone !== activeZone()
      )
        return;
      if (started.zone === 'neutral') {
        changeBoardMode(true);
        return;
      }
      const hit = currentHit();
      if (
        started.enabled &&
        hit?.enabled &&
        sameInteraction(started.interaction, hit.interaction) &&
        interactionAllowed(hit.interaction, viewRef.current, inputPolicyRef.current)
      )
        onInteractRef.current(hit.interaction);
    };
    const lostPointerCapture = () => {
      if (down) pointerCancel();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        releasePointerInput();
        return;
      }
      if (event.key === 'Tab') releasePointerInput();
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('.pointer-lock-hint')) return;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (
        target instanceof HTMLElement &&
        /^(BUTTON|A|SUMMARY)$/.test(target.tagName) &&
        !el.contains(target)
      )
        return;
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) changeBoardMode(!boardMode());
      } else if (!boardMode() && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
        event.preventDefault();
        navigate(event.key.slice(5).toLowerCase() as Direction, true);
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
      pointerCancel();
      inputEpoch++;
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
    document.addEventListener('pointerlockchange', lockChanged);
    document.addEventListener('pointerlockerror', lockError);
    document.addEventListener('focusin', focusChanged);
    renderer.domElement.addEventListener('mousedown', mouseDown);
    renderer.domElement.addEventListener('mousemove', mouseMove);
    renderer.domElement.addEventListener('mouseup', mouseUp);
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerleave', pointerLeave);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointercancel', pointerCancel);
    renderer.domElement.addEventListener('lostpointercapture', lostPointerCapture);
    renderer.domElement.addEventListener('webglcontextlost', lostContext);
    renderer.domElement.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keyDown);
    const visibilityChanged = () => {
      if (document.hidden) releasePointerInput();
    };
    const motionPreferenceChanged = () => {
      reducedMotion = motionPreference.matches;
      eng.reducedMotion = reducedMotion;
      resetPointerInput();
    };
    window.addEventListener('blur', releasePointerInput);
    document.addEventListener('visibilitychange', visibilityChanged);
    motionPreference.addEventListener('change', motionPreferenceChanged);
    const resizeScene = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (!width || !height) return;
      releasePointerInput();
      cameraReady = false;
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
      targetGoal = new THREE.Vector3(),
      basePosition = new THREE.Vector3(),
      baseTarget = new THREE.Vector3(),
      lookRight = new THREE.Vector3(),
      lookUp = new THREE.Vector3(),
      lookOffset = new THREE.Vector3();
    let frame = 0,
      previousFrame: number | null = null;
    const animate = (timestamp = performance.now()) => {
      const elapsedSeconds = previousFrame === null ? 1 / 60 : (timestamp - previousFrame) / 1000;
      previousFrame = timestamp;
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
      const blend = motionBlend(elapsedSeconds, 0.12, reducedMotion);
      basePosition.lerp(cameraGoal, blend);
      baseTarget.lerp(targetGoal, blend);
      cameraReady = cameraFocusReady(
        basePosition.distanceToSquared(cameraGoal),
        baseTarget.distanceToSquared(targetGoal),
      );
      if (cameraReady) {
        basePosition.copy(cameraGoal);
        baseTarget.copy(targetGoal);
      }
      advanceLook(timestamp);
      renderedLook = { x: mouseLook.x, y: mouseLook.y };
      camera.position.copy(basePosition);
      controls.target.copy(baseTarget);
      camera.lookAt(baseTarget);
      camera.updateMatrixWorld(true);
      lookRight.setFromMatrixColumn(camera.matrixWorld, 0);
      lookUp.setFromMatrixColumn(camera.matrixWorld, 1);
      const amplitude = plan
        ? 0.075 * boardZoom
        : zone === 'neutral' || zone === 'hand'
          ? 0.38
          : 0.16;
      lookOffset
        .copy(lookRight)
        .multiplyScalar(mouseLook.x * amplitude)
        .addScaledVector(lookUp, -mouseLook.y * amplitude * 0.65);
      camera.position.add(lookOffset);
      controls.target.add(lookOffset);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld(true);
      const handBlend = motionBlend(elapsedSeconds, 0.095, reducedMotion);
      const handY = plan ? -3.6 : zone === 'hand' ? 0.65 : -1.1;
      eng.hand.position.y = THREE.MathUtils.lerp(eng.hand.position.y, handY, handBlend);
      eng.hand.visible = !plan || eng.hand.position.y > -2.8;
      eng.hand.scale.setScalar(
        THREE.MathUtils.lerp(eng.hand.scale.x, !plan && zone === 'hand' ? 1.16 : 1, handBlend),
      );
      const cardBlend = motionBlend(elapsedSeconds, 0.063, reducedMotion);
      for (const card of eng.cards) {
        const hover = card.cardId === eng.hoveredCard && zone === 'hand',
          selected = viewRef.current.selectedCardIds.includes(card.cardId),
          y = card.baseY + (hover ? 0.95 : selected ? 0.25 : 0),
          z = card.baseZ + (hover ? 1 : 0);
        card.group.position.y = THREE.MathUtils.lerp(card.group.position.y, y, cardBlend);
        card.group.position.z = THREE.MathUtils.lerp(card.group.position.z, z, cardBlend);
        const cardScale = hover ? 1.65 : 1;
        card.group.scale.setScalar(THREE.MathUtils.lerp(card.group.scale.x, cardScale, cardBlend));
      }
      updateHandGrips(eng);
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
    basePosition.copy(camera.position);
    baseTarget.copy(controls.target);
    camera.lookAt(controls.target);
    animate();
    setReady(true);
    return () => {
      const pendingLock = lock.pending;
      lock.dispose();
      if (pendingLock) {
        const finishPending = (event: Event) => {
          if (event.type === 'pointerlockerror') lock.failed();
          else lock.changed();
          if (!lock.pending) {
            document.removeEventListener('pointerlockchange', finishPending);
            document.removeEventListener('pointerlockerror', finishPending);
          }
        };
        document.addEventListener('pointerlockchange', finishPending);
        document.addEventListener('pointerlockerror', finishPending);
      }
      acquirePointer.current = () => {};
      document.removeEventListener('pointerlockchange', lockChanged);
      document.removeEventListener('pointerlockerror', lockError);
      document.removeEventListener('focusin', focusChanged);
      renderer.domElement.removeEventListener('mousedown', mouseDown);
      renderer.domElement.removeEventListener('mousemove', mouseMove);
      renderer.domElement.removeEventListener('mouseup', mouseUp);
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerCancel);
      renderer.domElement.removeEventListener('lostpointercapture', lostPointerCapture);
      renderer.domElement.removeEventListener('webglcontextlost', lostContext);
      renderer.domElement.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('blur', releasePointerInput);
      document.removeEventListener('visibilitychange', visibilityChanged);
      motionPreference.removeEventListener('change', motionPreferenceChanged);
      disposeObjects(scene);
      disposeObjects(foreground);
      light.shadow.map?.dispose();
      reflections.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
      focusObject.current = () => {};
      resetBoardView.current = () => {};
      synchronizeView.current = () => {};
      applyInputPolicy.current = () => {};
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
    const resetChanged = previousReset.current !== reset;
    previousReset.current = reset;
    synchronizeView.current(resetChanged);
  }, [topView, reset, ready]);
  useEffect(() => {
    if (ready) applyInputPolicy.current();
  }, [inputPolicyKey, view.rulesOpen, ready]);
  useEffect(() => {
    if (ready && guidance) focusObject.current(guidance.target);
  }, [guidance?.key, ready]);
  if (fallback)
    return (
      <Fallback
        observation={observation}
        view={view}
        onInteract={onInteract}
        inputPolicy={inputPolicy}
      />
    );
  return (
    <div
      ref={host}
      className={`diorama tabletop-diorama${topView ? ' board-mode' : ''}`}
      style={{ cursor: topView ? 'crosshair' : 'auto' }}
      tabIndex={0}
      data-pointer-lock={lockState}
      data-input-mode={topView ? 'board' : 'seated'}
      data-focus-zone={focusZone.current}
      role="group"
      aria-label="Железнодорожный стол. Небольшое движение мыши сдвигает взгляд; направленный жест переключает выделенную опцию. Длинный жест на границе коллекции переходит к соседним предметам. В обучении это работает по всей игровой области. Первый клик захватывает мышь; следующий ЛКМ активирует выделенный предмет. Escape только освобождает мышь. Пробел приближает поле и показывает курсор; повторный пробел возвращает к столу, следующий клик снова захватывает мышь. На поле колесо меняет масштаб, перетаскивание двигает карту. Tab выбирает предметы, стрелки меняют опцию, Enter действует."
    >
      {!topView && lockState !== 'locked' && (
        <div className="pointer-lock-hint" role="status">
          <span>
            {lockState === 'error'
              ? 'Браузер не захватил мышь. Повторите клик или используйте Tab и Enter.'
              : lockState === 'requesting'
                ? 'Включаем управление мышью…'
                : 'Кликните, чтобы управлять столом. Esc освобождает мышь.'}
          </span>
          <button
            type="button"
            disabled={lockState === 'requesting'}
            onClick={() => acquirePointer.current()}
          >
            Управлять мышью
          </button>
        </div>
      )}
      <AccessibleObjects
        observation={observation}
        view={view}
        onInteract={onInteract}
        inputPolicy={inputPolicy}
        onFocusObject={(interaction) => focusObject.current(interaction)}
      />
    </div>
  );
}
