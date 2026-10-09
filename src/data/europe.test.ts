import { describe, expect, it } from 'vitest';
import { CITIES, COLORS, createBoard, EDGES, TICKETS } from './europe';

const routes = (a: string, b: string) =>
  EDGES.filter((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));

describe('classic Europe map and destination deck', () => {
  it('contains the full classic graph with valid connected endpoints', () => {
    expect(CITIES).toHaveLength(47);
    expect(EDGES).toHaveLength(101);
    const cityIds = new Set(CITIES.map((city) => city.id));
    expect(cityIds.size).toBe(CITIES.length);
    expect(new Set(EDGES.map((edge) => edge.id)).size).toBe(EDGES.length);
    const reached = new Set([CITIES[0].id]);
    for (let pass = 0; pass < CITIES.length; pass++) {
      for (const edge of EDGES) {
        expect(cityIds.has(edge.a) && cityIds.has(edge.b)).toBe(true);
        expect(edge.a).not.toBe(edge.b);
        expect([1, 2, 3, 4, 6, 8]).toContain(edge.length);
        if (reached.has(edge.a) || reached.has(edge.b)) {
          reached.add(edge.a);
          reached.add(edge.b);
        }
      }
    }
    expect(reached.size).toBe(47);
    for (const city of CITIES) {
      expect(Math.abs(city.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(city.z)).toBeLessThanOrEqual(7);
    }
  });

  it('encodes double routes as eleven pairs and keeps special routes distinct', () => {
    const parallelIds = new Set(EDGES.flatMap((edge) => (edge.parallel ? [edge.parallel] : [])));
    expect(parallelIds.size).toBe(11);
    for (const parallel of parallelIds) {
      const pair = EDGES.filter((edge) => edge.parallel === parallel);
      expect(pair).toHaveLength(2);
      expect([pair[0].a, pair[0].b].sort()).toEqual([pair[1].a, pair[1].b].sort());
      expect(pair[0].length).toBe(pair[1].length);
    }
    expect(EDGES.filter((edge) => edge.tunnel)).toHaveLength(18);
    expect(EDGES.filter((edge) => edge.ferries > 0)).toHaveLength(13);
    for (const edge of EDGES.filter((edge) => edge.ferries > 0)) {
      expect(edge.color).toBe('gray');
      expect(edge.tunnel).toBe(false);
      expect(edge.ferries).toBeLessThanOrEqual(edge.length);
    }
    // These entries are commonly mistranscribed in third-party map datasets.
    expect(
      routes('madrid', 'pamplona').map((edge) => [edge.color, edge.length, edge.tunnel]),
    ).toEqual([
      ['black', 3, true],
      ['white', 3, true],
    ]);
    expect(routes('barcelona', 'marseille')[0].length).toBe(4);
    expect(routes('dieppe', 'brest')[0].color).toBe('orange');
    expect(routes('berlin', 'danzig')[0].length).toBe(3);
    expect(routes('wien', 'zagrab')[0].color).toBe('gray');
    expect(routes('stockholm', 'petrograd')[0]).toMatchObject({
      length: 8,
      tunnel: true,
      ferries: 0,
    });
    expect(routes('palermo', 'smyrna')[0]).toMatchObject({ length: 6, tunnel: false, ferries: 2 });
    expect(routes('palermo', 'athina')).toHaveLength(0);
  });

  it('contains eight routes per printed color and the complete six-long forty-regular deck', () => {
    for (const color of COLORS)
      expect(EDGES.filter((edge) => edge.color === color)).toHaveLength(8);
    expect(TICKETS).toHaveLength(46);
    expect(TICKETS.filter((ticket) => ticket.long)).toHaveLength(6);
    expect(TICKETS.filter((ticket) => !ticket.long)).toHaveLength(40);
    expect(new Set(TICKETS.map((ticket) => ticket.id)).size).toBe(46);
    const cities = new Set(CITIES.map((city) => city.id));
    for (const ticket of TICKETS) {
      expect(cities.has(ticket.a) && cities.has(ticket.b)).toBe(true);
      expect(ticket.a).not.toBe(ticket.b);
      expect(ticket.points).toBeGreaterThan(0);
    }
    expect(TICKETS.find((ticket) => ticket.a === 'stockholm' && ticket.b === 'wien')?.points).toBe(
      11,
    );
    expect(
      TICKETS.filter((ticket) => ticket.long)
        .map((ticket) => ticket.points)
        .sort((a, b) => a - b),
    ).toEqual([20, 20, 20, 21, 21, 21]);
  });

  it('gives each match independent ownership and city arrays', () => {
    const first = createBoard();
    const second = createBoard();
    first.edges[0].owner = 2;
    first.cities[0].x = 999;
    expect(second.edges[0].owner).toBeNull();
    expect(EDGES[0].owner).toBeNull();
    expect(second.cities[0].x).toBe(CITIES[0].x);
  });
});
