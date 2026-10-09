import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  red: 'Красный материал',
  blue: 'Синий материал',
  green: 'Зелёный материал',
  yellow: 'Жёлтый материал',
  wild: 'Универсальный материал',
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
      label: 'Взять материал вслепую',
      enabled: view.deckEnabled,
    },
    ...observation.market.map((card, index) => ({
      interaction: { kind: 'market' as const, id: String(index) },
      label: `Открытая карта ${index + 1}: ${materialNames[card.color]}`,
      enabled: view.enabledMarketIndices.includes(index),
    })),
    ...observation.trains
      .filter((train) => train.playerId === observation.self.id)
      .map((train) => ({
        interaction: { kind: 'train' as const, id: train.id },
        label: `Поезд ${train.id}. ${train.disabled ? 'Потерян' : `${train.cargo.length} групп на борту`}`,
        enabled: !train.disabled,
      })),
    ...observation.stations.map((station) => ({
      interaction: { kind: 'station' as const, id: station.id },
      label: `${station.name}. ${station.safe ? 'Убежище' : station.flooded ? 'Закрыта водой' : `${station.groups.length} групп, закрытие после раунда ${station.floodRound}`}`,
      enabled: true,
    })),
    ...observation.edges.map((edge) => ({
      interaction: { kind: 'edge' as const, id: edge.id },
      label: `Линия ${observation.stations.find((station) => station.id === edge.a)?.name} — ${observation.stations.find((station) => station.id === edge.b)?.name}. ${edge.open ? 'Открыта' : `${edge.cost} карт на ремонт`}`,
      enabled: true,
    })),
    ...observation.self.hand.map((card, index) => ({
      interaction: { kind: 'card' as const, id: card.id },
      label: `${view.discardEnabled ? 'Сбросить' : 'Осмотреть'} карту ${index + 1}: ${materialNames[card.color]}`,
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
  const activate = (kind: 'station' | 'edge', id: string) => onInteract({ kind, id });
  return (
    <div className="map-fallback tabletop-fallback">
      <span className="fallback-note">Схема города · 3D недоступен в этом браузере</span>
      <h2>{view.headline}</h2>
      <p>{view.notice}</p>
      {view.detailLines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
      <svg viewBox="0 0 800 520" aria-label="Схема железной дороги">
        {observation.edges.map((edge) => {
          const a = xy(edge.a),
            b = xy(edge.b);
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor('#192527', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.cursor = 'none';
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
    controls.enabled = false;
    controls.enableDamping = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;
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
    const boardMode = () => topViewRef.current && !viewRef.current.discardEnabled;
    const activeZone = (): FocusZone =>
      viewRef.current.discardEnabled ? 'hand' : focusZone.current;
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
      if (viewRef.current.discardEnabled && active) return;
      topViewRef.current = active;
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
      } else if (!viewRef.current.discardEnabled) {
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
          : interaction.kind === 'train'
            ? observationRef.current.trains.some(
                (train) => train.id === interaction.id && !train.disabled,
              )
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
      const hit = raycaster.intersectObjects(eng.pickables, false)[0];
      if (!hit) return null;
      const interaction = (hit.object.userData.interaction ?? hit.object.userData.selection) as
        TableInteraction | undefined;
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
      pointerInside = true;
      keyboardObject.current = null;
      if (down && Math.hypot(down.x - event.clientX, down.y - event.clientY) > 6)
        down.dragged = true;
      if (!boardMode()) {
        const previous = activeZone();
        const zone = viewRef.current.discardEnabled
          ? 'hand'
          : pointerZone((pointer.x + 1) / 2, (1 - pointer.y) / 2, previous);
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
        if (!event.repeat && !viewRef.current.discardEnabled) changeBoardMode(!boardMode());
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
      if (plan) {
        // The city, rather than the whole table, occupies the close planning view.
        cameraGoal.set(0, 25, 11);
        targetGoal.set(0, 0.7, -1.8);
      } else if (zone === 'deck') {
        cameraGoal.set(-13.25, 19.5, 13);
        targetGoal.set(-13.25, 0, 2.75);
      } else if (zone === 'paper') {
        cameraGoal.set(13.5, 13.8, 18.2);
        targetGoal.set(13.5, 2.8, 5.7);
      } else if (zone === 'goals') {
        cameraGoal.set(-13.6, 7.5, 19.2);
        targetGoal.set(-13.6, -1.1, 12.5);
      } else if (zone === 'dock') {
        cameraGoal.set(11.5, 9.8, 22);
        targetGoal.set(11.5, -1.1, 13.3);
      } else if (zone === 'hand') {
        cameraGoal.set(0, 25, 31);
        targetGoal.set(0, 0.7, 1.8);
      } else {
        cameraGoal.set(0, 28.5, 34);
        targetGoal.set(0, 0.7, 0.7);
      }
      const blend = reducedMotion ? 1 : 0.085;
      if (!down) {
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
          y = card.baseY + (hover ? 0.5 : 0),
          z = card.baseZ + (hover ? 1 : 0);
        card.group.position.y = reducedMotion
          ? y
          : THREE.MathUtils.lerp(card.group.position.y, y, 0.23);
        card.group.position.z = reducedMotion
          ? z
          : THREE.MathUtils.lerp(card.group.position.z, z, 0.23);
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
    camera.position.set(0, boardMode() ? 25 : 28.5, boardMode() ? 11 : 34);
    controls.target.set(0, 0.7, boardMode() ? -1.8 : 0.7);
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
      window.removeEventListener('keydown', keyDown);
      disposeObjects(scene);
      disposeObjects(foreground);
      light.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
      focusObject.current = () => {};
    };
  }, [fallback]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    buildEnvironment(eng, observation);
    buildBoard(eng, observation, selection, view, topView);
    buildHand(eng, observation);
    buildTableInterface(eng, observation, view);
  }, [observation, selection, view, ready, fontRevision, topView]);
  useEffect(() => {
    if (view.discardEnabled) {
      focusZone.current = 'hand';
      keyboardObject.current = null;
      if (topView) onBoardModeChangeRef.current(false);
    }
  }, [view.discardEnabled, topView]);
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    const resetChanged = previousReset.current !== reset;
    previousReset.current = reset;
    if (
      resetChanged ||
      (!topView && ['station', 'edge', 'train'].includes(keyboardObject.current?.kind ?? ''))
    )
      keyboardObject.current = null;
    if (viewRef.current.discardEnabled) focusZone.current = 'hand';
    else if (!keyboardObject.current) focusZone.current = 'neutral';
    eng.hoveredInteraction = null;
    eng.hoveredCard = null;
    if (eng.reducedMotion) {
      const plan = topView && !viewRef.current.discardEnabled;
      eng.camera.position.set(0, plan ? 25 : 28.5, plan ? 11 : 34);
      eng.controls.target.set(0, 0.7, plan ? -1.8 : 0.7);
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
      className={`diorama tabletop-diorama${topView && !view.discardEnabled ? ' board-mode' : ''}`}
      style={{ cursor: topView && !view.discardEnabled ? 'crosshair' : 'none' }}
      data-input-mode={topView && !view.discardEnabled ? 'board' : 'seated'}
      data-focus-zone={focusZone.current}
      role="group"
      aria-label="Диспетчерский стол. Наведите мышь в область материалов слева, заявок снизу слева, руки снизу, листа справа или управления снизу справа. Двигайте мышь на одну опцию в нужную сторону. Нажатие на пустом столе или пробел приближает поле и показывает курсор; пробел или Escape возвращает к столу. Tab выбирает предметы, стрелки меняют опцию, Enter действует."
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
