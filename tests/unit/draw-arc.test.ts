import { describe, expect, it } from "vitest";
import { arcGeometry, arcPointAt, boundsOf, project, segmentLength, subSegment, sagittaThrough, type Segment } from "../../src/core/draw/geometry";
import { intersect } from "../../src/core/draw/intersect";

const arc = (a: { x: number; y: number }, b: { x: number; y: number }, sagitta: number): Extract<Segment, { kind: "arc" }> => ({
  id: "a",
  kind: "arc",
  a,
  b,
  sagitta,
});

describe("arc", () => {
  it("un demi-cercle de A à B a son centre au milieu de AB", () => {
    for (const sign of [1, -1]) {
      const g = arcGeometry({ x: 1, y: 2 }, { x: 5, y: 2 }, sign * 2);
      expect(g.center.x).toBeCloseTo(3, 9);
      expect(g.center.y).toBeCloseTo(2, 9);
      expect(g.radius).toBeCloseTo(2, 9);
      expect(Math.abs(g.sweep)).toBeCloseTo(Math.PI, 9);
      expect(g.length).toBeCloseTo(2 * Math.PI, 9);
    }
  });

  it("changer la flèche garde les extrémités et passe par le sommet", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    for (const s of [0.5, 1, 1.9, 2, 3, -1, -2.5]) {
      const g = arcGeometry(a, b, s);
      const start = arcPointAt(g, 0);
      const end = arcPointAt(g, 1);
      const mid = arcPointAt(g, 0.5);
      expect(start.x).toBeCloseTo(0, 9);
      expect(start.y).toBeCloseTo(0, 9);
      expect(end.x).toBeCloseTo(4, 9);
      expect(end.y).toBeCloseTo(0, 9);
      expect(mid.x).toBeCloseTo(g.apex.x, 9);
      expect(mid.y).toBeCloseTo(g.apex.y, 9);
      expect(Math.hypot(mid.x - g.center.x, mid.y - g.center.y)).toBeCloseTo(g.radius, 9);
      expect(sagittaThrough(a, b, g.apex)).toBeCloseTo(s, 9);
    }
  });

  it("longueur et boîte englobante exactes", () => {
    // Demi-cercle de centre (3, 2), rayon 2, bombé du côté des y croissants (flèche positive, A → B vers +x).
    const half = arc({ x: 1, y: 2 }, { x: 5, y: 2 }, 2);
    expect(segmentLength(half)).toBeCloseTo(2 * Math.PI, 9);
    const box = boundsOf(half);
    expect(box.x0).toBeCloseTo(1, 9);
    expect(box.x1).toBeCloseTo(5, 9);
    expect(box.y0).toBeCloseTo(2, 9);
    expect(box.y1).toBeCloseTo(4, 9);
    // Plus d'un demi-cercle : la boîte déborde de la corde de chaque côté.
    const major = arc({ x: 0, y: 0 }, { x: 2, y: 0 }, 1.5);
    const mb = boundsOf(major);
    const r = (1 + 1.5 * 1.5) / (2 * 1.5);
    expect(mb.x0).toBeCloseTo(1 - r, 9);
    expect(mb.x1).toBeCloseTo(1 + r, 9);
    expect(mb.y1).toBeCloseTo(1.5, 9);
    expect(segmentLength(major)).toBeCloseTo(r * (2 * Math.PI - 2 * Math.asin(1 / r)), 9);
  });

  it("projection et sous-arc", () => {
    const a = arc({ x: 0, y: 0 }, { x: 4, y: 0 }, 2);
    const pr = project(a, { x: 2, y: 5 });
    expect(pr.point.x).toBeCloseTo(2, 9);
    expect(pr.point.y).toBeCloseTo(2, 9);
    const half = subSegment(a, 0, 0.5, "b");
    expect(half.kind).toBe("arc");
    expect(segmentLength(half)).toBeCloseTo(segmentLength(a) / 2, 9);
    const other = subSegment(a, 0.5, 1, "c");
    expect(other.a.x).toBeCloseTo(half.b.x, 9);
    expect(other.a.y).toBeCloseTo(half.b.y, 9);
  });
});

describe("intersections", () => {
  it("droite-droite", () => {
    const [c] = intersect({ id: "1", kind: "line", a: { x: 0, y: 0 }, b: { x: 6, y: 6 } }, { id: "2", kind: "line", a: { x: 0, y: 6 }, b: { x: 6, y: 0 } });
    expect(c?.point).toEqual({ x: 3, y: 3 });
    expect(c?.t).toBeCloseTo(0.5, 12);
    expect(intersect({ id: "1", kind: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { id: "2", kind: "line", a: { x: 0, y: 1 }, b: { x: 1, y: 1 } })).toHaveLength(0);
  });

  it("droite-arc : deux croisements, un seul sur l'arc", () => {
    const half = arc({ x: 0, y: 0 }, { x: 4, y: 0 }, 2); // demi-cercle de centre (2, 0), y ≥ 0
    const vertical: Segment = { id: "v", kind: "line", a: { x: 1, y: -3 }, b: { x: 1, y: 3 } };
    const found = intersect(vertical, half);
    expect(found).toHaveLength(1);
    expect(found[0]?.point.x).toBeCloseTo(1, 9);
    expect(found[0]?.point.y).toBeCloseTo(Math.sqrt(3), 9);
    const horizontal: Segment = { id: "h", kind: "line", a: { x: -1, y: 1 }, b: { x: 5, y: 1 } };
    expect(intersect(horizontal, half)).toHaveLength(2);
    // Dans l'autre ordre, les paramètres sont échangés.
    const reversed = intersect(half, vertical);
    expect(reversed[0]?.u).toBeCloseTo(found[0]?.t ?? NaN, 12);
  });

  it("arc-arc", () => {
    const a = arc({ x: 0, y: 0 }, { x: 4, y: 0 }, 2);
    const b = arc({ x: 2, y: -1 }, { x: 2, y: 3 }, 2); // demi-cercle de centre (2, 1)
    const found = intersect(a, b);
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const c of found) {
      expect(Math.hypot(c.point.x - 2, c.point.y - 0)).toBeCloseTo(2, 9);
      expect(Math.hypot(c.point.x - 2, c.point.y - 1)).toBeCloseTo(2, 9);
    }
  });
});
