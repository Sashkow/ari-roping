// The street in side view: two wires at y = 0, the road below, one trolleybus on her pair of wires.
// x runs along the wire, y is height above the wires. Everything that can end a run is here.

export function makeWorld(physics, level) {
  const WIRE_H = physics.street.wire_height, B = physics.bus, SPAN = physics.street.span;
  const roofY = B.roof_height - WIRE_H, floorY = -WIRE_H + 0.35, roadY = -WIRE_H;
  const bus = { shoes: level.bus.first_gap, v: level.bus.speed, on: true };      // on: false is free practice, no trolleybus on her wires
  const geom = () => { const rear = bus.shoes + B.shoe_overhang; return { shoes: bus.shoes, rear, front: rear + B.length, poleBase: rear + 4.5, roofY, floorY }; };

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, t = Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0), 1);
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }

  /** points: [[x, y], ...] of her body. Returns a failure message or null. */
  function hit(points) {
    const g = geom();
    for (const [x, y] of points) {
      if (y < roadY + 0.12) return 'She hit the road.';
      if (!bus.on) continue;
      if (x > g.rear && x < g.front && y > g.floorY && y < g.roofY) return y > g.roofY - 0.6 ? 'She came down on the roof of the trolleybus.' : 'She flew into the trolleybus.';
      if (distToSegment(x, y, g.poleBase, g.roofY + 0.2, g.shoes, 0) < 0.18) return "She flew into the trolleybus's poles.";
    }
    return null;
  }

  /** Switch the trolleybus off, or back on first_gap ahead of where her tips are now. */
  function setBus(on, tipsX = 0) { bus.on = on; if (on) bus.shoes = tipsX + level.bus.first_gap; }

  return { bus, geom, hit, setBus, step(dt) { if (bus.on) bus.shoes += bus.v * dt; }, WIRE_H, SPAN, roadY, roofY };
}
