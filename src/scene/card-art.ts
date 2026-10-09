import type { CardColor } from '../shared/types';

const CARD_NAMES: Record<CardColor, string> = {
  red: 'КРАСНЫЙ',
  blue: 'СИНИЙ',
  yellow: 'ЖЁЛТЫЙ',
  green: 'ЗЕЛЁНЫЙ',
  orange: 'ОРАНЖЕВЫЙ',
  purple: 'РОЗОВЫЙ',
  black: 'ЧЁРНЫЙ',
  white: 'БЕЛЫЙ',
  wild: 'ЛОКОМОТИВ',
};
const INK = '#263936';
const PAPER = '#efe6cd';
const BRASS = '#b89b62';
const SANS = '"IBM Plex Sans", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

/** Original vector print. Uses the caller's canvas; no DOM, image requests or texture ownership. */
export function drawTrainCard(
  ctx: CanvasRenderingContext2D,
  color: CardColor,
  back: boolean,
  width: number,
  height: number,
  palette: Readonly<Record<string, string>>,
) {
  ctx.save();
  ctx.scale(width / 800, height / 1200);
  ctx.fillStyle = back ? '#263b35' : PAPER;
  ctx.fillRect(0, 0, 800, 1200);
  paperGrain(ctx, back);
  if (back) drawBack(ctx);
  else drawFront(ctx, color, palette);
  ctx.restore();
}

/** Redundant colour symbols are large enough to remain visible in the card fan. */
export function drawRailColorSymbol(
  ctx: CanvasRenderingContext2D,
  color: CardColor,
  x: number,
  y: number,
  size: number,
  ink = INK,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(3, size * 0.085);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const r = size * 0.36;
  ctx.beginPath();
  if (color === 'blue') ctx.arc(0, 0, r, 0, Math.PI * 2);
  else if (color === 'green') {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r);
    ctx.lineTo(-r, r);
    ctx.closePath();
  } else if (color === 'red') {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
  } else if (color === 'yellow') ctx.rect(-r, -r, r * 2, r * 2);
  else if (color === 'orange') {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  } else if (color === 'purple') {
    // Four-petalled flower, matching the same colour symbol in the action paper.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const cx = Math.cos(a) * r * 0.53;
      const cy = Math.sin(a) * r * 0.53;
      ctx.moveTo(cx + r * 0.46, cy);
      ctx.arc(cx, cy, r * 0.46, 0, Math.PI * 2);
    }
  } else if (color === 'wild') {
    const arms = 4;
    for (let i = 0; i < arms * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / arms;
      const radius = i % 2 === 0 ? r : r * 0.42;
      if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
      else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    ctx.closePath();
  } else if (color === 'black') {
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(-r * 0.35, -r * 0.55, -r, -r * 0.1, -r * 0.85, r * 0.35);
    ctx.bezierCurveTo(-r * 0.7, r * 0.8, -r * 0.2, r * 0.65, 0, r * 0.38);
    ctx.bezierCurveTo(r * 0.2, r * 0.65, r * 0.7, r * 0.8, r * 0.85, r * 0.35);
    ctx.bezierCurveTo(r, -r * 0.1, r * 0.35, -r * 0.55, 0, -r);
    ctx.moveTo(0, r * 0.35);
    ctx.lineTo(0, r);
    ctx.moveTo(-r * 0.4, r);
    ctx.lineTo(r * 0.4, r);
  } else {
    ctx.rect(-r, -r, r * 2, r * 2);
  }
  if (['red', 'blue', 'green', 'yellow', 'orange', 'wild'].includes(color)) ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function paperGrain(ctx: CanvasRenderingContext2D, back: boolean) {
  ctx.strokeStyle = back ? '#c7bf9c0c' : '#5b5a3512';
  ctx.lineWidth = 1;
  // Deterministic tiny fibres become a quiet paper surface rather than a noisy image.
  for (let i = 0; i < 190; i++) {
    const x = (i * 173 + 31) % 800;
    const y = (i * 359 + 73) % 1200;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3 + (i % 8), y + ((i % 3) - 1));
    ctx.stroke();
  }
}

function border(ctx: CanvasRenderingContext2D, dark = false) {
  ctx.strokeStyle = dark ? '#baa97d' : '#8b896b';
  ctx.lineWidth = 3;
  roundedRect(ctx, 24, 24, 752, 1152, 20);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundedRect(ctx, 36, 36, 728, 1128, 14);
  ctx.stroke();
}

function drawFront(
  ctx: CanvasRenderingContext2D,
  color: CardColor,
  palette: Readonly<Record<string, string>>,
) {
  const isWild = color === 'wild';
  const paint = palette[color] ?? '#97845c';
  const lightHeader = ['white', 'yellow', 'orange', 'wild'].includes(color);
  ctx.fillStyle = paint;
  ctx.fillRect(37, 37, 726, 179);
  const headerInk = lightHeader ? INK : '#fff1d4';
  ctx.textAlign = 'center';
  ctx.fillStyle = headerInk;
  ctx.font = `500 ${isWild ? 61 : color === 'orange' ? 59 : 72}px ${SANS}`;
  ctx.fillText(CARD_NAMES[color], 400, 151);
  drawRailColorSymbol(ctx, color, 89, 123, 61, headerInk);
  drawRailColorSymbol(ctx, color, 711, 123, 61, headerInk);

  ctx.fillStyle = INK;
  ctx.font = `31px ${SERIF}`;
  ctx.fillText(isWild ? 'ПАРОВАЯ ТЯГА' : 'ПАССАЖИРСКИЙ ВАГОН', 400, 280);
  ctx.strokeStyle = '#bdb08d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(108, 304);
  ctx.lineTo(692, 304);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(400, 535, 343, 183, 0, 0, Math.PI * 2);
  ctx.clip();
  const vignette = ctx.createLinearGradient(0, 354, 0, 730);
  vignette.addColorStop(0, '#f4eddc');
  vignette.addColorStop(1, '#d7d3b8');
  ctx.fillStyle = vignette;
  ctx.fillRect(45, 350, 710, 394);
  // Faint hand engraved landscape lines keep the train visually dominant.
  ctx.strokeStyle = '#bdc3a9';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(30, 494 + i * 21);
    ctx.bezierCurveTo(140, 450 + i * 12, 160, 479 + i * 21, 295, 446 + i * 22);
    ctx.bezierCurveTo(420, 450 + i * 24, 560, 397 + i * 34, 790, 460 + i * 17);
    ctx.stroke();
  }
  ctx.restore();

  if (isWild) drawLocomotive(ctx);
  else drawCoach(ctx, paint, color);

  ctx.strokeStyle = '#9a997c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(73, 752);
  ctx.lineTo(727, 752);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `500 ${isWild ? 62 : 53}px ${SANS}`;
  ctx.fillText(isWild ? 'ЛЮБОЙ ЦВЕТ' : '1 КАРТА = 1 ВАГОН', 400, 867);
  if (isWild) {
    const colors: CardColor[] = [
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'black',
      'white',
    ];
    colors.forEach((item, index) => {
      const x = 124 + index * 79;
      ctx.fillStyle = palette[item];
      roundedRect(ctx, x - 21, 909, 42, 28, 5);
      ctx.fill();
      ctx.strokeStyle = '#6b7159';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.font = `43px ${SANS}`;
    ctx.fillText('Открытый: весь добор', 400, 1017);
    ctx.font = `35px ${SANS}`;
    ctx.fillText('Вслепую: одна из двух карт', 400, 1080);
  } else {
    drawRailColorSymbol(ctx, color, 400, 960, 90);
    ctx.font = `43px ${SANS}`;
    ctx.fillText('Один цвет для маршрута', 400, 1080);
  }
  border(ctx);
}

function wheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  spokes = false,
) {
  ctx.fillStyle = '#283836';
  ctx.strokeStyle = '#182723';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#b1a88b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.73, 0, Math.PI * 2);
  ctx.stroke();
  if (spokes) {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * radius * 0.69, y + Math.sin(angle) * radius * 0.69);
      ctx.stroke();
    }
  }
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoach(ctx: CanvasRenderingContext2D, paint: string, color: CardColor) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;

  // The receding end, curved roof and paired bogies show a carriage rather than a coloured box.
  ctx.fillStyle = '#7f896b';
  ctx.beginPath();
  ctx.moveTo(90, 450);
  ctx.lineTo(131, 425);
  ctx.lineTo(705, 425);
  ctx.lineTo(669, 458);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = paint;
  roundedRect(ctx, 96, 453, 568, 163, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#657166';
  ctx.beginPath();
  ctx.moveTo(664, 455);
  ctx.lineTo(705, 430);
  ctx.lineTo(705, 589);
  ctx.lineTo(664, 615);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Arched roof with a cream highlight across the eaves.
  ctx.fillStyle = '#43534a';
  ctx.beginPath();
  ctx.moveTo(84, 460);
  ctx.bezierCurveTo(91, 416, 135, 412, 156, 412);
  ctx.lineTo(652, 412);
  ctx.bezierCurveTo(677, 412, 702, 424, 710, 446);
  ctx.lineTo(668, 467);
  ctx.bezierCurveTo(658, 437, 632, 434, 620, 434);
  ctx.lineTo(139, 434);
  ctx.bezierCurveTo(106, 434, 100, 445, 97, 460);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#dcd6b6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(99, 459);
  ctx.lineTo(665, 460);
  ctx.stroke();

  for (let i = 0; i < 6; i++) {
    const x = 117 + i * 81;
    ctx.fillStyle = '#243b37';
    roundedRect(ctx, x, 475, 61, 72, 7);
    ctx.fill();
    ctx.strokeStyle = '#caba8a';
    ctx.lineWidth = 3;
    ctx.stroke();
    const window = ctx.createLinearGradient(x, 478, x + 50, 544);
    window.addColorStop(0, '#e3e6cf');
    window.addColorStop(1, '#81998e');
    ctx.fillStyle = window;
    roundedRect(ctx, x + 6, 481, 49, 59, 4);
    ctx.fill();
    ctx.strokeStyle = '#7c876d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 31, 481);
    ctx.lineTo(x + 31, 540);
    ctx.stroke();
  }
  ctx.strokeStyle = '#e0d4aa';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(104, 558);
  ctx.lineTo(656, 558);
  ctx.moveTo(104, 600);
  ctx.lineTo(657, 600);
  ctx.stroke();
  drawRailColorSymbol(
    ctx,
    color,
    390,
    582,
    40,
    ['black', 'blue', 'green'].includes(color) ? '#e6dabc' : INK,
  );

  ctx.fillStyle = '#293a33';
  roundedRect(ctx, 89, 613, 586, 22, 5);
  ctx.fill();
  for (const x of [194, 568]) {
    ctx.fillStyle = '#425149';
    roundedRect(ctx, x - 51, 630, 102, 18, 5);
    ctx.fill();
    wheel(ctx, x - 27, 649, 25);
    wheel(ctx, x + 27, 649, 25);
  }
  ctx.fillStyle = BRASS;
  for (const x of [72, 675]) ctx.fillRect(x, 618, 18, 10);
  ctx.strokeStyle = '#647364';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(65, 685);
  ctx.lineTo(739, 685);
  ctx.moveTo(85, 696);
  ctx.lineTo(724, 696);
  ctx.stroke();
  ctx.restore();
}

function drawLocomotive(ctx: CanvasRenderingContext2D) {
  ctx.save();
  // Cream steam is printed softly behind the smokestack, away from all instructional text.
  ctx.fillStyle = '#f7f0dd';
  for (const [x, y, rx, ry] of [
    [586, 380, 48, 36],
    [529, 347, 70, 35],
    [441, 330, 73, 31],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#1c2e2b';
  ctx.lineWidth = 4;
  // Tender and coal behind the cab.
  ctx.fillStyle = '#3c5247';
  roundedRect(ctx, 71, 504, 132, 118, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#24332c';
  ctx.beginPath();
  ctx.moveTo(78, 504);
  ctx.lineTo(83, 482);
  ctx.lineTo(108, 487);
  ctx.lineTo(121, 477);
  ctx.lineTo(140, 489);
  ctx.lineTo(168, 479);
  ctx.lineTo(192, 503);
  ctx.closePath();
  ctx.fill();

  // Cab, long cylindrical boiler and round front plate.
  ctx.fillStyle = '#405448';
  roundedRect(ctx, 222, 420, 135, 190, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#273932';
  roundedRect(ctx, 347, 479, 256, 128, 26);
  ctx.fill();
  ctx.stroke();
  const boiler = ctx.createLinearGradient(0, 479, 0, 607);
  boiler.addColorStop(0, '#81907a');
  boiler.addColorStop(0.36, '#354b41');
  boiler.addColorStop(1, '#20332e');
  ctx.fillStyle = boiler;
  roundedRect(ctx, 346, 480, 254, 126, 25);
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 5;
  for (const x of [394, 489, 571]) {
    ctx.beginPath();
    ctx.moveTo(x, 482);
    ctx.lineTo(x, 603);
    ctx.stroke();
  }
  ctx.fillStyle = '#283c35';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(607, 542, 29, 62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = BRASS;
  ctx.beginPath();
  ctx.ellipse(608, 542, 21, 51, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Chimney, steam dome, bell and headlamp.
  ctx.fillStyle = '#21342d';
  ctx.beginPath();
  ctx.moveTo(561, 478);
  ctx.lineTo(565, 406);
  ctx.lineTo(609, 406);
  ctx.lineTo(612, 478);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundedRect(ctx, 552, 396, 70, 14, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BRASS;
  roundedRect(ctx, 436, 449, 45, 36, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#edddb1';
  ctx.beginPath();
  ctx.arc(642, 491, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#283e35';
  roundedRect(ctx, 209, 408, 163, 20, 8);
  ctx.fill();
  ctx.stroke();

  const glass = ctx.createLinearGradient(240, 436, 306, 501);
  glass.addColorStop(0, '#efe9ce');
  glass.addColorStop(1, '#a0b29d');
  ctx.fillStyle = glass;
  roundedRect(ctx, 241, 439, 91, 70, 8);
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(287, 442);
  ctx.lineTo(287, 507);
  ctx.stroke();
  ctx.fillStyle = BRASS;
  ctx.font = `27px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('1900', 287, 566);

  ctx.fillStyle = '#2c3e35';
  roundedRect(ctx, 73, 611, 567, 21, 4);
  ctx.fill();
  wheel(ctx, 108, 648, 24);
  wheel(ctx, 176, 648, 24);
  for (const x of [291, 388, 485]) wheel(ctx, x, 635, 47, true);
  wheel(ctx, 574, 651, 22);
  wheel(ctx, 623, 651, 22);
  ctx.strokeStyle = '#d3c6a0';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(291, 638);
  ctx.lineTo(388, 638);
  ctx.lineTo(485, 638);
  ctx.lineTo(523, 607);
  ctx.stroke();
  // Small cowcatcher and coupler balance the train's front silhouette.
  ctx.fillStyle = '#43564b';
  ctx.beginPath();
  ctx.moveTo(635, 610);
  ctx.lineTo(693, 658);
  ctx.lineTo(632, 658);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = BRASS;
  ctx.fillRect(681, 616, 25, 12);
  ctx.strokeStyle = '#647364';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(63, 690);
  ctx.lineTo(731, 690);
  ctx.moveTo(80, 701);
  ctx.lineTo(717, 701);
  ctx.stroke();
  ctx.restore();
}

function drawBack(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#71836a';
  ctx.lineWidth = 2;
  for (let row = 0; row < 13; row++) {
    for (let column = 0; column < 8; column++) {
      const x = 88 + column * 89;
      const y = 95 + row * 85;
      ctx.beginPath();
      ctx.moveTo(x, y - 15);
      ctx.lineTo(x + 17, y);
      ctx.lineTo(x, y + 15);
      ctx.lineTo(x - 17, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#263b35';
  ctx.fillRect(46, 328, 708, 530);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e6daba';
  ctx.font = `76px ${SERIF}`;
  ctx.fillText('EUROPE', 400, 436);
  ctx.strokeStyle = '#b9a77b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(400, 613, 116, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(400, 613, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#dfd2ad';
  // A wheel and parallel rails form an original railway seal.
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(400 + Math.cos(angle) * 24, 613 + Math.sin(angle) * 24);
    ctx.lineTo(400 + Math.cos(angle) * 87, 613 + Math.sin(angle) * 87);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(400, 613, 23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `49px ${SANS}`;
  ctx.fillText('ВАГОННЫЕ КАРТЫ', 400, 812);
  ctx.font = `31px ${SERIF}`;
  ctx.fillText('1900', 400, 1075);
  border(ctx, true);
}
