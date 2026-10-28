import { describe, expect, it } from 'vitest';
import type { VisualDieLabelMode, VisualDieSides } from './diceVisualEvent';
import { closestTargetQuaternionForFace, getDieDefinition, getDieFaceLabel, targetQuaternionForFace } from './dieDefinitions';

type Vector3Tuple = readonly [number, number, number];
type QuaternionTuple = readonly [number, number, number, number];

function rotate([vx, vy, vz]: Vector3Tuple, [qx, qy, qz, qw]: QuaternionTuple): Vector3Tuple {
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function quaternionAngle(left: QuaternionTuple, right: QuaternionTuple): number {
  const dot = Math.abs(left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3]);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

describe('procedural die definitions', () => {
  it.each([
    [4, 'tetrahedron'],
    [6, 'cube'],
    [8, 'octahedron'],
    [10, 'pentagonal-trapezohedron'],
    [12, 'dodecahedron'],
    [20, 'icosahedron'],
  ] as const)('defines one numbered face for every d%i value', (sides, geometryKind) => {
    const definition = getDieDefinition(sides);

    expect(definition.geometryKind).toBe(geometryKind);
    expect(definition.faces).toHaveLength(sides);
    expect(definition.faces.map((face) => face.value).sort((a, b) => a - b)).toEqual(
      Array.from({ length: sides }, (_, index) => index + 1),
    );
    for (const face of definition.faces) {
      expect(Math.hypot(...face.normal)).toBeCloseTo(1, 5);
      expect(face.center.every(Number.isFinite)).toBe(true);
    }
  });

  it('uses a d20-specific 1.4x scale while leaving every other supported die at its existing scale', () => {
    expect(getDieDefinition(20).scale).toBe(1.4);
    for (const sides of [4, 6, 8, 10, 12] as const) {
      expect(getDieDefinition(sides).scale).toBe(1);
    }
  });

  it('uses local labels for standard and percentile d10 faces', () => {
    const cases: readonly [number, VisualDieLabelMode, string][] = [
      [1, 'standard', '1'],
      [10, 'standard', '10'],
      [1, 'percentile-ones', '1'],
      [10, 'percentile-ones', '0'],
      [1, 'percentile-tens', '10'],
      [9, 'percentile-tens', '90'],
      [10, 'percentile-tens', '00'],
    ];

    for (const [value, mode, expected] of cases) {
      expect(getDieFaceLabel(10, value, mode)).toBe(expected);
    }
  });

  it.each([4, 6, 8, 10, 12, 20] as const)('rotates every d%i authoritative face normal to world-up', (sides: VisualDieSides) => {
    const definition = getDieDefinition(sides);
    for (const face of definition.faces) {
      const quaternion = targetQuaternionForFace(definition, face.value, Math.PI * 0.37);
      const rotated = rotate(face.normal, quaternion);
      expect(rotated[0]).toBeCloseTo(0, 5);
      expect(rotated[1]).toBeCloseTo(1, 5);
      expect(rotated[2]).toBeCloseTo(0, 5);
      expect(Math.hypot(...quaternion)).toBeCloseTo(1, 5);
    }
  });

  it.each([4, 6, 8, 10, 12, 20] as const)('chooses the closest equivalent authoritative face-up yaw for d%i', (sides: VisualDieSides) => {
    const definition = getDieDefinition(sides);
    const value = Math.max(1, sides - 1);
    const current = targetQuaternionForFace(definition, Math.min(sides, value + 1), 1.13);
    const closest = closestTargetQuaternionForFace(definition, value, current);
    const rotated = rotate(definition.faces[value - 1].normal, closest);

    expect(rotated[0]).toBeCloseTo(0, 5);
    expect(rotated[1]).toBeCloseTo(1, 5);
    expect(rotated[2]).toBeCloseTo(0, 5);

    for (const yaw of [0, 0.6, 1.7, 3.2, 5.4]) {
      const candidate = targetQuaternionForFace(definition, value, yaw);
      expect(quaternionAngle(current, closest)).toBeLessThanOrEqual(quaternionAngle(current, candidate) + 1e-8);
    }
  });

  it('rejects unsupported sides and out-of-range authoritative values', () => {
    expect(() => getDieDefinition(100 as VisualDieSides)).toThrow(/unsupported/i);
    expect(() => targetQuaternionForFace(getDieDefinition(6), 0, 0)).toThrow(/face/i);
    expect(() => targetQuaternionForFace(getDieDefinition(20), 21, 0)).toThrow(/face/i);
  });
});
