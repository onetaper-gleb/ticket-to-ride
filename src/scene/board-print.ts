import type { CityLabel, MapPoint, RouteLayout } from './board-layout';
import { BOARD_ROUTE_LINK_WIDTH } from './board-pick-targets';
import type { TableView } from './interaction';

type Selection = { kind: 'station' | 'edge'; id: string } | null;

function fallbackLeader(label: CityLabel): MapPoint[] {
  const dx = label.x - label.city.x;
  const dz = label.z - label.city.z;
  const length = Math.hypot(dx, dz);
  if (!length) return [];
  const trim = Math.min(
    Math.abs(dx) > 1e-9 ? label.width / 2 / Math.abs(dx) : Infinity,
    Math.abs(dz) > 1e-9 ? label.height / 2 / Math.abs(dz) : Infinity,
  );
  return [
    { x: label.city.x + (dx / length) * 0.16, z: label.city.z + (dz / length) * 0.16 },
    { x: label.x - dx * trim, z: label.z - dz * trim },
  ];
}

/** Print links and leaders before every nameplate, using the same paths as picking. */
export function printBoardLayout(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  boardWidth: number,
  boardDepth: number,
  routes: RouteLayout[],
  labels: CityLabel[],
  colors: Record<string, string>,
  selection: Selection,
  view?: TableView,
) {
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(canvasWidth / boardWidth, canvasHeight / boardDepth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const route of routes) {
    ctx.strokeStyle = route.edge.color === 'white' ? '#a59f8c' : colors[route.edge.color]!;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = BOARD_ROUTE_LINK_WIDTH;
    ctx.beginPath();
    for (const path of route.inkPaths ?? [route.points]) {
      path.forEach((point, index) =>
        index ? ctx.lineTo(point.x, point.z) : ctx.moveTo(point.x, point.z),
      );
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const marked = (label: CityLabel) =>
    view?.routeStationIds.includes(label.city.id) ||
    (selection?.kind === 'station' && selection.id === label.city.id);
  for (const label of labels) {
    const leader = label.leader ?? fallbackLeader(label);
    ctx.strokeStyle = marked(label) ? '#8b622d' : '#696d59';
    ctx.lineWidth = (marked(label) ? 3.8 : 2.5) / (canvasWidth / boardWidth);
    ctx.beginPath();
    leader.forEach((point, index) =>
      index ? ctx.lineTo(point.x, point.z) : ctx.moveTo(point.x, point.z),
    );
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const label of labels) {
    ctx.fillStyle = marked(label) ? '#e5c479' : '#ede6cc';
    ctx.globalAlpha = 0.97;
    ctx.beginPath();
    ctx.roundRect(
      label.x - label.width / 2,
      label.z - label.height / 2,
      label.width,
      label.height,
      0.04,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.009;
    ctx.strokeStyle = '#758068';
    ctx.stroke();
    ctx.fillStyle = '#283b36';
    ctx.font = `500 ${label.height * 0.7}px "IBM Plex Sans", Arial, sans-serif`;
    ctx.fillText(label.city.name, label.x, label.z + 0.008, label.width - 0.07);
  }
  ctx.restore();
}
