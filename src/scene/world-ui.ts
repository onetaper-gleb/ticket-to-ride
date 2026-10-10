import * as THREE from 'three';
import { getGameResult } from '../core';
import type { Observation } from '../shared/types';
import type { TableControl, TableInteraction, TableView } from './interaction';
import { TABLE_LAYOUT } from './table-layout';
import {
  cardPrint,
  disposeObjects,
  primitiveFactory,
  roundedShape,
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
    ctx.fillText(line, x, y);
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
  const radius = Math.min(0.11, height * 0.12);
  const backingGeometry = new THREE.ExtrudeGeometry(roundedShape(width, height, radius), {
    depth: 0.08,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 1,
    curveSegments: 3,
  });
  backingGeometry.translate(0, 0, -0.05);
  const back = new THREE.Mesh(
    backingGeometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
  );
  back.castShadow = true;
  back.receiveShadow = true;
  group.add(back);
  const faceGeometry = new THREE.ShapeGeometry(
    roundedShape(width - 0.04, height - 0.04, radius),
    5,
  );
  // ShapeGeometry uses world coordinates for UVs. Paper artwork fills its actual face.
  const uv = faceGeometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++)
    uv.setXY(index, uv.getX(index) / (width - 0.04) + 0.5, uv.getY(index) / (height - 0.04) + 0.5);
  const face = new THREE.Mesh(
    faceGeometry,
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  face.position.z = 0.054;
  face.userData.pageWidth = width - 0.04;
  face.userData.pageHeight = height - 0.04;
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
  // A clear physical rim makes logical selection visible without a hidden cursor.
  const face = faces.find((item) => item.userData.pageWidth !== undefined);
  let marker: THREE.Group | undefined;
  if (face?.parent) {
    marker = new THREE.Group();
    marker.position.copy(face.position);
    marker.rotation.copy(face.rotation);
    marker.position.z += 0.012;
    const width = face.userData.pageWidth as number;
    const height = face.userData.pageHeight as number;
    const material = new THREE.MeshBasicMaterial({
      color: enabled ? '#efb648' : '#aaa28b',
      toneMapped: false,
    });
    for (const side of [-1, 1]) {
      const horizontal = new THREE.Mesh(
        new THREE.BoxGeometry(width - 0.16, 0.065, 0.025),
        material,
      );
      horizontal.position.y = (side * height) / 2;
      marker.add(horizontal);
      const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.065, height - 0.16, 0.025), material);
      vertical.position.x = (side * width) / 2;
      marker.add(vertical);
    }
    marker.visible = false;
    face.parent.add(marker);
  }
  eng.animatedProps.push({ group, interaction, baseY: group.position.y, enabled, lift, marker });
}

function caption(label: string, enabled: boolean, selected = false, danger = false, aspect = 4) {
  const width = Math.round(128 * aspect);
  return textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = selected ? '#ccb373' : enabled ? paper : '#aba695';
      ctx.fillRect(0, 0, width, 128);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#92856c';
      ctx.strokeRect(8, 8, width - 16, 112);
      ctx.fillStyle = danger ? '#8d4938' : ink;
      ctx.textAlign = 'center';
      let size = 52;
      ctx.font = `${size}px ${sans}`;
      while (size > 30 && ctx.measureText(label).width > width - 36) {
        size -= 2;
        ctx.font = `${size}px ${sans}`;
      }
      ctx.fillText(label, width / 2, 83, width - 36);
    },
    width,
    128,
  );
}

function buildStock(eng: Engine, observation: Observation, view: TableView) {
  const layout = TABLE_LAYOUT.stock;
  const shelf = new THREE.Group();
  shelf.position.set(layout.x, -1.22, layout.z);
  eng.furniture.add(shelf);
  const { box } = primitiveFactory(shelf);
  box([layout.width, 0.14, layout.depth], '#263d35', [0, -0.04, 0]);
  for (const side of [-1, 1]) {
    box([0.045, 0.035, layout.depth - 0.16], '#ad9a6f', [
      side * (layout.width / 2 - 0.08),
      0.05,
      0,
    ]);
    box([layout.width - 0.16, 0.035, 0.045], '#ad9a6f', [
      0,
      0.05,
      side * (layout.depth / 2 - 0.08),
    ]);
  }
  const title = page(
    shelf,
    6.0,
    0.72,
    caption(`ВАГОНЫ · В КОЛОДЕ ${observation.deckCount}`, true, false, false, 6 / 0.72),
    '#766b52',
  );
  title.group.rotation.x = -Math.PI / 2;
  title.group.position.set(0, 0.1, -5.7);
  const cardWidth = 2.25,
    cardHeight = 3.3;
  observation.market.forEach((card, index) => {
    const slotX = (index % 2 === 0 ? -1 : 1) * 1.4;
    const slotZ = -3.4 + Math.floor(index / 2) * 3.75;
    const item = page(
      shelf,
      cardWidth,
      cardHeight,
      cardPrint(card.color, false, eng.renderer.capabilities.getMaxAnisotropy()),
      '#bfb297',
    );
    item.group.rotation.x = -Math.PI / 2;
    item.group.position.set(slotX, 0.12, slotZ);
    const enabled = view.enabledMarketIndices.includes(index);
    item.face.material.opacity = enabled ? 1 : 0.8;
    item.face.material.transparent = true;
    register(
      eng,
      item.group,
      [item.face, item.back],
      { kind: 'market', id: String(index) },
      enabled,
      0.32,
    );
    if (
      !enabled &&
      card.color === 'wild' &&
      observation.phase === 'draw' &&
      observation.activePlayer === observation.self.id
    ) {
      const blocked = page(
        item.group,
        2.15,
        0.58,
        caption('× ВТОРОЙ ДОБОР', false, false, true, 2.15 / 0.58),
        '#744735',
      );
      blocked.group.position.set(0, -1.1, 0.11);
    }
  });
  const deck = page(
    shelf,
    cardWidth,
    cardHeight,
    cardPrint('wild', true, eng.renderer.capabilities.getMaxAnisotropy()),
    '#c2bda7',
  );
  deck.group.rotation.x = -Math.PI / 2;
  deck.group.position.set(1.4, 0.37, 4.1);
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

function buildChalkboard(eng: Engine, observation: Observation, view: TableView) {
  const layout = TABLE_LAYOUT.score;
  const result = observation.phase === 'finished' ? getGameResult(observation) : null;
  const texture = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = '#22382e';
      ctx.fillRect(0, 0, 1024, 744);
      ctx.strokeStyle = '#768470';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, 976, 696);
      ctx.fillStyle = '#f1ead4';
      ctx.font = `58px ${mono}`;
      ctx.fillText(`EUROPE · ХОД ${observation.turn - (view.awaitingHandoff ? 1 : 0)}`, 54, 100);
      const active = observation.players.find((player) => player.id === observation.activePlayer);
      ctx.font = `42px ${sans}`;
      ctx.fillText(
        observation.phase === 'finished'
          ? 'Партия завершена'
          : view.awaitingHandoff
            ? 'Подтвердите конец хода'
            : `Ход: ${active?.name ?? ''}`,
        54,
        158,
        916,
      );
      ctx.fillStyle = '#b8c5ad';
      ctx.font = `29px ${mono}`;
      ctx.fillText('ВАГ.', 592, 216);
      ctx.fillText('СТ.', 726, 216);
      ctx.textAlign = 'right';
      ctx.fillText(observation.phase === 'finished' ? 'ИТОГ' : 'ОЧКИ', 953, 216);
      ctx.textAlign = 'left';
      observation.players.forEach((player, index) => {
        const y = 280 + index * 64;
        if (
          player.id === (view.awaitingHandoff ? observation.self.id : observation.activePlayer) &&
          observation.phase !== 'finished'
        ) {
          ctx.fillStyle = '#3a5040';
          ctx.fillRect(44, y - 45, 936, 58);
          ctx.fillStyle = '#f0d590';
          ctx.beginPath();
          ctx.moveTo(57, y - 29);
          ctx.lineTo(74, y - 17);
          ctx.lineTo(57, y - 5);
          ctx.fill();
        }
        ctx.fillStyle = player.color;
        ctx.fillRect(90, y - 29, 25, 25);
        ctx.fillStyle = '#ece8d5';
        ctx.font = `44px ${sans}`;
        ctx.fillText(player.name, 134, y, 408);
        ctx.font = `39px ${mono}`;
        ctx.fillText(String(player.trainsRemaining), 605, y);
        ctx.fillText(String(player.stationsRemaining), 735, y);
        ctx.font = `53px ${mono}`;
        ctx.textAlign = 'right';
        ctx.fillText(
          String(
            result?.standings.find((item) => item.playerId === player.id)?.score ?? player.score,
          ),
          953,
          y,
        );
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = '#b8c5ad';
      ctx.font = `32px ${sans}`;
      const names = {
        setup: 'ВЫБОР БИЛЕТОВ',
        action: 'ОДНО ДЕЙСТВИЕ ЗА ХОД',
        draw: 'ДОБЕРИТЕ ВТОРУЮ КАРТУ',
        tickets: 'ОСТАВЬТЕ ХОТЯ БЫ ОДИН БИЛЕТ',
        tunnel: 'ПРОВЕРКА ТОННЕЛЯ',
        finished: 'БИЛЕТЫ + СТАНЦИИ + ЭКСПРЕСС',
      };
      ctx.fillText(names[observation.phase], 54, 630, 916);
      ctx.fillStyle = observation.finalTurnsRemaining !== null ? '#f0d590' : '#a8b49b';
      ctx.font = `30px ${mono}`;
      ctx.fillText(
        observation.finalTurnsRemaining !== null
          ? `ПОСЛЕДНИХ ХОДОВ: ${observation.finalTurnsRemaining}`
          : '≤2 ВАГОНА → ПОСЛЕДНИЙ КРУГ',
        54,
        684,
        916,
      );
    },
    1024,
    744,
  );
  const board = page(eng.furniture, layout.width, layout.height, texture, '#514a38');
  board.group.position.set(layout.x, layout.y, layout.z);
  board.group.rotation.x = -0.38;
  const { box } = primitiveFactory(board.group);
  for (const side of [-1, 1])
    box([0.15, 5.0, 0.2], '#594831', [side * (layout.width / 2 - 0.45), -0.7, -0.16]);
  box([layout.width + 0.3, 0.15, 0.48], '#675b40', [0, -layout.height / 2 - 0.06, 0.08]);
  box([0.42, 0.07, 0.09], '#e4dec5', [1.8, -layout.height / 2 + 0.03, 0.2]);
}

function buildPaper(eng: Engine, view: TableView) {
  const layout = TABLE_LAYOUT.paper;
  const paperControls = view.controls.filter(
    (control) => !control.placement || control.placement === 'paper',
  );
  const buttonRows = Math.ceil(paperControls.length / 2);
  const texture = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, 1024, 1408);
      ctx.strokeStyle = '#c2b69b';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 964, 1348);
      ctx.fillStyle = '#7a7765';
      ctx.font = `32px ${mono}`;
      ctx.fillText('EUROPE · ЛИСТ ПУТИ', 62, 96);
      ctx.fillStyle = ink;
      let headingSize = 86;
      for (; headingSize > 60; headingSize -= 2) {
        ctx.font = `${headingSize}px ${sans}`;
        if (wrapText(ctx, view.headline, 900).length <= 2) break;
      }
      ctx.font = `${headingSize}px ${sans}`;
      let y = printLines(ctx, view.headline, 62, 210, 900, headingSize * 1.13) + 39;
      ctx.font = `50px ${sans}`;
      ctx.fillStyle = '#565c4a';
      y = printLines(ctx, view.notice, 62, y, 900, 61) + 33;
      ctx.strokeStyle = '#b4a788';
      ctx.beginPath();
      ctx.moveTo(62, y - 15);
      ctx.lineTo(962, y - 15);
      ctx.stroke();
      y += 18;
      ctx.fillStyle = ink;
      // Reserve the physical stamps before fitting the contextual text.
      const textBottom = paperControls.length ? 1230 - (buttonRows - 1) * 147 : 1265;
      let size = 46;
      for (; size > 28; size -= 2) {
        ctx.font = `${size}px ${sans}`;
        const height = view.detailLines.reduce(
          (sum, line) => sum + wrapText(ctx, line, 900).length * size * 1.28 + 24,
          0,
        );
        if (y + height <= textBottom) break;
      }
      ctx.font = `${size}px ${sans}`;
      for (const line of view.detailLines) y = printLines(ctx, line, 62, y, 900, size * 1.28) + 24;
      if (!paperControls.length) {
        ctx.fillStyle = '#9b927b';
        ctx.font = `32px ${mono}`;
        ctx.fillText('ПРОБЕЛ — ПОЛЕ · ESC — К СТОЛУ', 62, 1320, 900);
      }
    },
    1024,
    1408,
  );
  const clipboard = page(eng.furniture, layout.width, layout.height, texture, '#796344');
  clipboard.group.position.set(layout.x, layout.y, layout.z);
  clipboard.group.rotation.x = -Math.PI / 4;
  register(
    eng,
    clipboard.group,
    [clipboard.face, clipboard.back],
    { kind: 'control', id: 'inspectPaper' },
    false,
    0.045,
  );
  const { box } = primitiveFactory(clipboard.group);
  box([2.05, 0.25, 0.18], '#777d6f', [0, layout.height / 2 - 0.17, 0.11]);
  box([0.73, 0.11, 0.19], '#bcc1ad', [0, layout.height / 2 - 0.1, 0.19]);
  paperControls.forEach((control, index) => {
    const width = paperControls.length === 1 ? layout.width - 0.55 : 3.02;
    const button = page(
      clipboard.group,
      width,
      0.8,
      caption(control.label, control.enabled, false, control.danger, width / 0.8),
      control.enabled ? '#7b6a4b' : '#777363',
    );
    button.group.position.set(
      paperControls.length === 1 ? 0 : index % 2 ? 1.63 : -1.63,
      -layout.height / 2 + 0.54 + (buttonRows - 1 - Math.floor(index / 2)) * 0.96,
      0.13,
    );
    register(
      eng,
      button.group,
      [button.face, button.back],
      { kind: 'control', id: control.id },
      control.enabled,
      0.045,
    );
  });
}

function buildGoals(eng: Engine, observation: Observation, view: TableView) {
  const layout = TABLE_LAYOUT.goals;
  const goals = view.goals;
  const spacing = Math.min(2.9, 10.5 / Math.max(1, goals.length - 1));
  const choosing = observation.phase === 'setup' || observation.phase === 'tickets';
  goals.forEach((goal, index) => {
    const texture = textureFromCanvas(
      (ctx) => {
        ctx.fillStyle = goal.completed ? '#dde3ce' : goal.selected ? '#eddfb5' : '#eee5cf';
        ctx.fillRect(0, 0, 640, 880);
        ctx.strokeStyle = '#b9aa89';
        ctx.lineWidth = 2;
        ctx.strokeRect(22, 22, 596, 836);
        ctx.fillStyle = '#79705c';
        ctx.font = `36px ${mono}`;
        ctx.fillText(goal.long ? 'ДЛИННЫЙ БИЛЕТ' : 'БИЛЕТ', 45, 89);
        ctx.fillStyle = ink;
        const endpoints = goal.label.split(/\s*[→—]\s*/);
        endpoints.forEach((endpoint, endpointIndex) => {
          let size = 76;
          for (; size > 50; size -= 2) {
            ctx.font = `${size}px ${sans}`;
            if (ctx.measureText(endpoint).width <= 550) break;
          }
          ctx.font = `${size}px ${sans}`;
          printLines(ctx, endpoint, 45, endpointIndex ? 366 : 205, 550, size * 1.15);
        });
        ctx.strokeStyle = '#a99c7b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(47, 277);
        ctx.lineTo(113, 277);
        ctx.lineTo(101, 268);
        ctx.moveTo(113, 277);
        ctx.lineTo(101, 286);
        ctx.stroke();
        ctx.fillStyle = '#476148';
        ctx.font = `108px ${mono}`;
        ctx.fillText(`+${goal.points}`, 45, 595);
        ctx.fillStyle = '#7f7156';
        ctx.font = `38px ${sans}`;
        ctx.fillText('ОЧКОВ ЗА СОЕДИНЕНИЕ', 48, 648, 540);
        ctx.fillStyle = goal.completed ? '#637251' : '#96624b';
        ctx.font = `36px ${sans}`;
        if (!goal.completed) ctx.fillText(`Без соединения: −${goal.points}`, 45, 718, 550);
        ctx.fillStyle = goal.completed ? '#3d5c3a' : goal.selected ? '#485f35' : '#77705b';
        ctx.font = `39px ${sans}`;
        ctx.fillText(
          goal.completed
            ? 'СОЕДИНЁН'
            : choosing
              ? goal.selected
                ? '✓ ОСТАВИТЬ'
                : 'ВЫБРАТЬ БИЛЕТ'
              : 'ЦЕЛЬ ПАРТИИ',
          45,
          818,
          550,
        );
      },
      640,
      880,
    );
    const card = page(eng.furniture, 2.72, 3.75, texture);
    card.group.position.set(
      layout.x + (index - (goals.length - 1) / 2) * spacing,
      -1.16 + index * 0.012,
      layout.z,
    );
    card.group.rotation.x = -Math.PI / 2;
    card.group.rotation.z = (index - (goals.length - 1) / 2) * 0.015;
    register(
      eng,
      card.group,
      [card.face, card.back],
      { kind: 'objective', id: goal.id },
      goal.enabled,
      0.65,
    );
  });
}

function buildRevealed(eng: Engine, view: TableView) {
  if (!view.revealedCards?.length) return;
  const layout = TABLE_LAYOUT.paper;
  const tray = new THREE.Group();
  tray.position.set(layout.x, -1.2, -5.25);
  eng.furniture.add(tray);
  const { box } = primitiveFactory(tray);
  box([6.15, 0.13, 3.85], '#34473c', [0, -0.01, -0.24]);
  const title = page(
    tray,
    5.9,
    0.6,
    caption('ПРОВЕРКА ТОННЕЛЯ', true, false, false, 5.9 / 0.6),
    '#776744',
  );
  title.group.rotation.x = -Math.PI / 2;
  title.group.position.set(0, 0.08, -1.75);
  view.revealedCards?.forEach((card, index) => {
    const item = page(
      tray,
      1.8,
      2.65,
      cardPrint(card.color, false, eng.renderer.capabilities.getMaxAnisotropy()),
    );
    item.group.rotation.x = -Math.PI / 2;
    item.group.position.set((index - 1) * 2.05, 0.13, 0.1);
  });
}

function buildDockControl(eng: Engine, control: TableControl, index: number) {
  const layout = TABLE_LAYOUT.dock;
  const cover = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = control.enabled ? '#344c3f' : '#556254';
      ctx.fillRect(0, 0, 512, 412);
      ctx.strokeStyle = '#b5a777';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 20, 464, 372);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c4bea3';
      ctx.font = `28px ${mono}`;
      ctx.fillText('EUROPE', 256, 74);
      const [label, shortcut] = control.label.split('·').map((part) => part.trim());
      let size = 64;
      for (; size > 44; size -= 2) {
        ctx.font = `${size}px ${sans}`;
        if (wrapText(ctx, label!, 420).length <= 2) break;
      }
      ctx.fillStyle = '#f0e5c9';
      ctx.font = `${size}px ${sans}`;
      printLines(ctx, label!, 256, 198, 420, size * 1.14);
      ctx.fillStyle = '#c4bea3';
      ctx.font = `30px ${mono}`;
      ctx.fillText(shortcut?.toUpperCase() ?? 'ЧИТАТЬ', 256, 348);
    },
    512,
    412,
  );
  const book = page(eng.furniture, 2.55, 2.05, cover, '#435542');
  book.group.rotation.x = -Math.PI / 2;
  book.group.rotation.z = (index - 1) * 0.07;
  book.group.position.set(layout.x + index * layout.spacing, -1.08, layout.z);
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
  const layout = TABLE_LAYOUT.bell;
  const group = new THREE.Group();
  group.position.set(layout.x, -1.12, layout.z + index * 3.1);
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
  const label = page(
    group,
    2.5,
    0.8,
    caption(control.label, control.enabled, false, false, 2.5 / 0.8),
    '#746647',
  );
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
  buildChalkboard(eng, observation, view);
  buildPaper(eng, view);
  buildGoals(eng, observation, view);
  buildRevealed(eng, view);
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
    const hovered = same(eng.hoveredInteraction, item.interaction);
    if (item.marker) item.marker.visible = hovered;
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
