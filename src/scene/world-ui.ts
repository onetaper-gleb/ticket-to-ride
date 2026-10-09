import * as THREE from 'three';
import type { Observation } from '../shared/types';
import type { TableControl, TableInteraction, TableView } from './interaction';
import {
  cardPrint,
  disposeObjects,
  primitiveFactory,
  textureFromCanvas,
  type Engine,
} from './tabletop';

const sans = '"IBM Plex Sans", Arial, sans-serif';
const mono = '"IBM Plex Mono", Consolas, monospace';
const paper = '#e8dfc8';
const ink = '#2a3935';

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function printLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  leading: number,
) {
  for (const line of wrapText(ctx, text, width)) {
    ctx.fillText(line, x, y, width);
    y += leading;
  }
  return y;
}

function page(
  parent: THREE.Object3D,
  width: number,
  height: number,
  texture: THREE.Texture,
  color = '#897c5f',
) {
  const group = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
  );
  back.castShadow = true;
  back.receiveShadow = true;
  group.add(back);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.04, height - 0.04),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  face.position.z = 0.054;
  group.add(face);
  parent.add(group);
  return { group, face, back };
}

function register(
  eng: Engine,
  group: THREE.Group,
  faces: THREE.Object3D[],
  interaction: TableInteraction,
  enabled: boolean,
  lift = 0.18,
) {
  faces.forEach((face) => {
    face.userData.interaction = interaction;
    face.userData.enabled = enabled;
    eng.uiPickables.push(face);
  });
  eng.animatedProps.push({ group, interaction, baseY: group.position.y, enabled, lift });
}

function caption(label: string, enabled: boolean, selected = false, danger = false) {
  return textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = selected ? '#ccb373' : enabled ? paper : '#aba695';
      ctx.fillRect(0, 0, 512, 128);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#92856c';
      ctx.strokeRect(8, 8, 496, 112);
      ctx.fillStyle = danger ? '#8d4938' : ink;
      ctx.textAlign = 'center';
      ctx.font = `52px ${sans}`;
      ctx.fillText(label, 256, 83, 470);
    },
    512,
    128,
  );
}

function buildStock(eng: Engine, observation: Observation, view: TableView) {
  const shelf = new THREE.Group();
  shelf.position.set(-13.25, -1.22, 2.75);
  eng.furniture.add(shelf);
  const { box } = primitiveFactory(shelf);
  box([8.0, 0.14, 13.3], '#303b34', [0, -0.04, 0]);
  const title = page(
    shelf,
    7.8,
    0.82,
    caption(`СКЛАД · КОЛОДА ${observation.deckCount}`, true),
    '#766b52',
  );
  title.group.rotation.x = -Math.PI / 2;
  title.group.position.set(0, 0.08, -6.0);
  const cardWidth = 2.25,
    cardHeight = 3.4;
  observation.market.forEach((card, index) => {
    const slotX = (index % 2 === 0 ? -1 : 1) * 1.69;
    const slotZ = -3.15 + Math.floor(index / 2) * 3.95;
    const item = page(shelf, cardWidth, cardHeight, cardPrint(card.color), '#bfb297');
    item.group.rotation.x = -Math.PI / 2;
    item.group.position.set(slotX, 0.12, slotZ);
    item.face.material.opacity = view.enabledMarketIndices.includes(index) ? 1 : 0.72;
    item.face.material.transparent = true;
    register(
      eng,
      item.group,
      [item.face, item.back],
      { kind: 'market', id: String(index) },
      view.enabledMarketIndices.includes(index),
      0.28,
    );
  });
  const deck = page(shelf, cardWidth, cardHeight, cardPrint('wild', true), '#c2bda7');
  deck.group.rotation.x = -Math.PI / 2;
  deck.group.position.set(1.69, 0.32, 4.75);
  // Printed edges give the deck a visible stack rather than a single flat card.
  const deckFactory = primitiveFactory(deck.group);
  for (let edge = 0; edge < 5; edge++)
    deckFactory.box([cardWidth, cardHeight, 0.055], edge % 2 ? '#bdb39b' : '#ded6be', [
      0,
      0,
      -0.08 - edge * 0.054,
    ]);
  register(
    eng,
    deck.group,
    [deck.face, deck.back],
    { kind: 'deck', id: 'deck' },
    view.deckEnabled,
    0.2,
  );
}

function buildChalkboard(eng: Engine, observation: Observation) {
  const texture = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = '#25382f';
      ctx.fillRect(0, 0, 1024, 768);
      ctx.strokeStyle = '#83917a';
      ctx.lineWidth = 2;
      ctx.strokeRect(29, 29, 966, 710);
      ctx.fillStyle = '#e2dec4';
      ctx.font = `64px ${mono}`;
      ctx.fillText(`РАУНД ${observation.round} / 12`, 60, 112);
      ctx.font = `43px ${sans}`;
      const active = observation.players.find((player) => player.id === observation.activePlayer);
      ctx.fillText(active ? `Ход: ${active.name}` : 'Диспетчерская', 60, 181, 890);
      ctx.strokeStyle = '#748474';
      ctx.beginPath();
      ctx.moveTo(60, 213);
      ctx.lineTo(963, 213);
      ctx.stroke();
      observation.players.forEach((player, index) => {
        const y = 285 + index * 80;
        ctx.fillStyle = player.color;
        ctx.fillRect(61, y - 30, 23, 23);
        ctx.fillStyle = '#e1dfc9';
        ctx.font = `46px ${sans}`;
        ctx.fillText(player.name, 108, y, 560);
        ctx.font = `52px ${mono}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(player.score), 928, y);
        ctx.textAlign = 'left';
      });
      const nextFlood = Math.min(
        ...observation.stations
          .filter((station) => !station.flooded && station.floodRound !== null)
          .map((station) => station.floodRound!),
      );
      ctx.fillStyle = '#bdbb9b';
      ctx.font = `40px ${mono}`;
      ctx.fillText(
        Number.isFinite(nextFlood) ? `ВОЛНА ПОСЛЕ РАУНДА ${nextFlood}` : 'ВЫСОКИЕ ПУТИ ОСТАЛИСЬ',
        60,
        655,
        904,
      );
      const phaseNames = {
        setup: 'ВЫБОР ЗАДАНИЙ',
        action: 'МАТЕРИАЛЫ И РЕМОНТ',
        draw: `ДОБОР: ${observation.drawsRemaining}`,
        discard: 'СБРОС ЛИШНЕЙ КАРТЫ',
        orders: 'ПРИКАЗЫ ПОЕЗДАМ',
        finished: 'ОПЕРАЦИЯ ЗАВЕРШЕНА',
      };
      ctx.fillStyle = '#ddd4af';
      ctx.font = `38px ${mono}`;
      ctx.fillText(phaseNames[observation.phase], 60, 711, 904);
    },
    1024,
    768,
  );
  const board = page(eng.furniture, 9.0, 6.3, texture, '#504836');
  board.group.position.set(-13.4, 2.15, -7.75);
  board.group.rotation.x = -0.38;
  const { box } = primitiveFactory(board.group);
  box([0.17, 7.1, 0.24], '#594831', [-3.7, -1.53, -0.16]);
  box([0.17, 7.1, 0.24], '#594831', [3.7, -1.53, -0.16]);
  box([9.5, 0.15, 0.66], '#675b40', [0, -3.21, 0.08]);
  box([0.5, 0.07, 0.09], '#ddd7ba', [2.6, -3.09, 0.31]);
}

function buildPaper(eng: Engine, view: TableView) {
  const paperControls = view.controls.filter(
    (control) => !control.placement || control.placement === 'paper',
  );
  const buttonRows = Math.ceil(paperControls.length / 2);
  const texture = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, 1024, 1408);
      ctx.strokeStyle = '#b6ab92';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 964, 1348);
      ctx.fillStyle = '#807c66';
      ctx.font = `34px ${mono}`;
      ctx.fillText('РЕЧНОЙ / ЛИСТ ОПЕРАЦИИ', 59, 98);
      ctx.fillStyle = ink;
      ctx.font = `66px ${sans}`;
      let y = printLines(ctx, view.headline, 59, 205, 906, 75);
      y += 30;
      ctx.font = `44px ${sans}`;
      ctx.fillStyle = '#665940';
      y = printLines(ctx, view.notice, 59, y, 906, 55) + 38;
      ctx.fillStyle = ink;
      // Reserve the physical stamps before fitting the contextual text.
      const textBottom = paperControls.length ? 1240 - (buttonRows - 1) * 123 : 1260;
      let size = 46;
      for (; size > 28; size -= 2) {
        ctx.font = `${size}px ${sans}`;
        const height = view.detailLines.reduce(
          (sum, line) => sum + wrapText(ctx, line, 906).length * size * 1.26 + 13,
          0,
        );
        if (y + height <= textBottom) break;
      }
      ctx.font = `${size}px ${sans}`;
      for (const line of view.detailLines) y = printLines(ctx, line, 59, y, 906, size * 1.26) + 13;
      if (!paperControls.length) {
        ctx.fillStyle = '#9b927b';
        ctx.font = `32px ${mono}`;
        ctx.fillText('ВЫБЕРИТЕ ПРЕДМЕТ НА СТОЛЕ', 59, 1314, 906);
      }
    },
    1024,
    1408,
  );
  const clipboard = page(eng.furniture, 8.6, 11.8, texture, '#6e5c3c');
  clipboard.group.position.set(13.5, 3.2, 5.7);
  clipboard.group.rotation.x = -Math.PI / 4;
  const { box } = primitiveFactory(clipboard.group);
  box([2.5, 0.3, 0.18], '#6e7770', [0, 5.74, 0.11]);
  box([0.86, 0.12, 0.19], '#adb19d', [0, 5.82, 0.19]);
  paperControls.forEach((control, index) => {
    const button = page(
      clipboard.group,
      3.95,
      0.85,
      caption(control.label, control.enabled, false, control.danger),
      control.enabled ? '#7b6a4b' : '#777363',
    );
    button.group.position.set(
      index % 2 ? 2.05 : -2.05,
      -5.25 + (buttonRows - 1 - Math.floor(index / 2)) * 1.03,
      0.13,
    );
    register(
      eng,
      button.group,
      [button.face, button.back],
      { kind: 'control', id: control.id },
      control.enabled,
      0.035,
    );
  });
}

function buildGoals(eng: Engine, view: TableView) {
  const goals = view.goals;
  goals.forEach((goal, index) => {
    const texture = textureFromCanvas(
      (ctx) => {
        ctx.fillStyle = goal.selected ? '#ded2a5' : '#d2c8b0';
        ctx.fillRect(0, 0, 512, 448);
        ctx.strokeStyle = '#91846a';
        ctx.lineWidth = 3;
        ctx.strokeRect(15, 15, 482, 418);
        ctx.fillStyle = '#6d6755';
        ctx.font = `34px ${mono}`;
        ctx.fillText('РАЙОННАЯ ЗАЯВКА', 33, 67, 445);
        ctx.fillStyle = ink;
        ctx.font = `54px ${sans}`;
        let y = printLines(ctx, goal.label, 33, 159, 445, 64);
        ctx.font = `42px ${mono}`;
        ctx.fillStyle = '#645c45';
        y = printLines(ctx, goal.progress, 33, y + 52, 445, 50);
        ctx.fillStyle = goal.selected ? '#536a4d' : '#887b5c';
        ctx.font = `37px ${mono}`;
        ctx.fillText(goal.selected ? 'ПРИНЯТО' : goal.enabled ? 'ВЫБРАТЬ' : 'ЗАЯВКА', 33, 408, 445);
      },
      512,
      448,
    );
    const card = page(eng.furniture, 2.62, 2.38, texture);
    card.group.position.set(-16.5 + index * 2.95, -1.16, 12.5);
    card.group.rotation.x = -Math.PI / 2;
    card.group.rotation.z = (index - 1) * 0.025;
    register(
      eng,
      card.group,
      [card.face, card.back],
      { kind: 'objective', id: goal.id },
      goal.enabled,
      0.24,
    );
  });
}

function buildDockControl(eng: Engine, control: TableControl, index: number) {
  const book = page(eng.furniture, 2.55, 2.05, caption(control.label, control.enabled), '#465145');
  book.group.rotation.x = -Math.PI / 2;
  book.group.rotation.z = (index - 1) * 0.07;
  book.group.position.set(11.1 + index * 2.83, -1.08, 14.05);
  const { box } = primitiveFactory(book.group);
  box([0.2, 2.05, 0.22], '#54604b', [-1.2, 0, -0.04]);
  box([2.3, 1.83, 0.12], '#b9b298', [0.07, 0, -0.11]);
  register(
    eng,
    book.group,
    [book.face, book.back],
    { kind: 'control', id: control.id },
    control.enabled,
    0.12,
  );
}

function buildBell(eng: Engine, control: TableControl, index: number) {
  const group = new THREE.Group();
  group.position.set(control.id === 'endTurn' ? 8.9 : 5.6 + index * 3.3, -1.12, 12.25);
  eng.furniture.add(group);
  const { mesh, box } = primitiveFactory(group);
  box([2.55, 0.18, 2.65], '#303c36', [0, 0, 0]);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.76, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: control.enabled ? '#b69a53' : '#696954',
      roughness: 0.52,
      metalness: 0.42,
    }),
  );
  dome.position.y = 0.14;
  dome.castShadow = true;
  group.add(dome);
  const button = mesh('cylinder', [0.21, 0.11, 0.21], '#a79765', [0, 0.87, 0]);
  const label = page(group, 2.5, 0.8, caption(control.label, control.enabled), '#746647');
  label.group.rotation.x = -Math.PI / 2;
  label.group.position.set(0, 0.1, 1.18);
  register(
    eng,
    group,
    [dome, button, label.face, label.back],
    { kind: 'control', id: control.id },
    control.enabled,
    0.04,
  );
}

export function buildTableInterface(eng: Engine, observation: Observation, view: TableView) {
  disposeObjects(eng.furniture);
  eng.furniture.clear();
  eng.uiPickables = [];
  eng.animatedProps = [];
  buildStock(eng, observation, view);
  buildChalkboard(eng, observation);
  buildPaper(eng, view);
  buildGoals(eng, view);
  view.controls
    .filter((control) => control.placement === 'dock')
    .forEach((control, index) => buildDockControl(eng, control, index));
  view.controls
    .filter((control) => control.placement === 'bell')
    .forEach((control, index) => buildBell(eng, control, index));
}

const same = (a: TableInteraction | null | undefined, b: TableInteraction | null | undefined) =>
  Boolean(a && b && a.kind === b.kind && a.id === b.id);

// Only presentation state changes here: raising stock cards cannot draw or spend them.
export function updateTableHover(eng: Engine, pressed = eng.pressedInteraction) {
  for (const item of eng.animatedProps) {
    const hovered = item.enabled && same(eng.hoveredInteraction, item.interaction);
    const target =
      item.baseY +
      (hovered ? item.lift : 0) -
      (item.enabled && same(pressed, item.interaction) ? 0.09 : 0);
    item.group.position.y = eng.reducedMotion
      ? target
      : THREE.MathUtils.lerp(item.group.position.y, target, 0.22);
  }
  eng.board.traverse((object) => {
    if (object.userData.highlightForTable)
      object.visible = Boolean(
        object.userData.selected ||
        same(eng.hoveredInteraction, object.userData.highlightForTable as TableInteraction),
      );
  });
}
