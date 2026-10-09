import {
  EUROPE_GEOGRAPHIC_BOUNDS,
  EUROPE_LAND_RINGS,
  EUROPE_MAP_SIZE,
  projectEurope,
} from '../data/europe-geography';

function traceLand(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  for (const ring of EUROPE_LAND_RINGS) {
    ring.forEach(([lon, lat], index) => {
      const point = projectEurope(lon, lat);
      if (index === 0) ctx.moveTo(point.x, point.z);
      else ctx.lineTo(point.x, point.z);
    });
    ctx.closePath();
  }
}

function geographicLine(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
) {
  ctx.beginPath();
  points.forEach(([lon, lat], index) => {
    const point = projectEurope(lon, lat);
    if (index === 0) ctx.moveTo(point.x, point.z);
    else ctx.lineTo(point.x, point.z);
  });
  ctx.stroke();
}

function seaLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  lon: number,
  lat: number,
  angle = 0,
) {
  const point = projectEurope(lon, lat);
  ctx.save();
  ctx.translate(point.x, point.z);
  ctx.rotate(angle);
  ctx.fillStyle = '#5e7975';
  ctx.font = 'italic 0.22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function compass(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(-10.1, -4.9);
  ctx.strokeStyle = '#648079';
  ctx.fillStyle = '#648079';
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.arc(0, 0, 0.39, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i += 1) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -0.54);
    ctx.lineTo(0.075, 0);
    ctx.lineTo(0, -0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -0.54);
    ctx.lineTo(-0.075, 0);
    ctx.lineTo(0, -0.1);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  ctx.font = '0.15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -0.7);
  ctx.restore();
}

/** Prints a geographic atlas onto the 24 × 16 physical map, without route rules. */
export function renderEuropeAtlas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(width / EUROPE_MAP_SIZE.width, height / EUROPE_MAP_SIZE.height);
  ctx.fillStyle = '#a8bfb6';
  ctx.fillRect(-12, -8, 24, 16);

  ctx.strokeStyle = '#97b1a9';
  ctx.lineWidth = 0.009;
  for (let z = -8; z <= 8; z += 0.13) {
    ctx.beginPath();
    ctx.moveTo(-12, z);
    ctx.lineTo(12, z);
    ctx.stroke();
  }

  traceLand(ctx);
  ctx.strokeStyle = '#819b90';
  ctx.lineWidth = 0.1;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#e4d6b6';
  ctx.fill('evenodd');
  ctx.strokeStyle = '#7b8872';
  ctx.lineWidth = 0.021;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(77, 96, 82, 0.11)';
  ctx.lineWidth = 0.009;
  ctx.setLineDash([0.03, 0.08]);
  const bounds = EUROPE_GEOGRAPHIC_BOUNDS;
  for (let lon = -10; lon <= 40; lon += 10) {
    geographicLine(ctx, [
      [lon, bounds.south],
      [lon, bounds.north],
    ]);
  }
  for (let lat = 35; lat <= 60; lat += 5) {
    geographicLine(ctx, [
      [bounds.west, lat],
      [bounds.east, lat],
    ]);
  }
  ctx.setLineDash([]);

  for (let i = 0; i < 1100; i += 1) {
    const x = ((i * 171) % 2399) / 100 - 12;
    const z = ((i * 83) % 1599) / 100 - 8;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(78, 63, 37, 0.035)' : 'rgba(255, 251, 230, 0.10)';
    ctx.fillRect(x, z, 0.01, 0.006);
  }

  seaLabel(ctx, 'АТЛАНТИЧЕСКИЙ ОКЕАН', -10.2, 43.4, -Math.PI / 2);
  seaLabel(ctx, 'СЕВЕРНОЕ МОРЕ', 3.5, 57.8);
  seaLabel(ctx, 'БАЛТИЙСКОЕ МОРЕ', 20.8, 56.9, -0.48);
  seaLabel(ctx, 'СРЕДИЗЕМНОЕ МОРЕ', 5.8, 37.7);
  seaLabel(ctx, 'ЧЁРНОЕ МОРЕ', 34.4, 42.15);

  ctx.strokeStyle = '#667f70';
  ctx.lineWidth = 0.018;
  ctx.strokeRect(-11.75, -7.75, 23.5, 15.5);
  ctx.lineWidth = 0.006;
  ctx.strokeRect(-11.62, -7.62, 23.24, 15.24);
  ctx.fillStyle = '#536c60';
  ctx.font = '0.42px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('EUROPE', -10.95, -6.92);
  ctx.font = '0.15px Georgia, serif';
  ctx.fillText('ATLAS DES CHEMINS DE FER', -10.93, -6.62);
  ctx.font = '0.13px Georgia, serif';
  ctx.fillText('1900', -10.92, -6.35);
  compass(ctx);
  ctx.restore();
}
