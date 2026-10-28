import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Color, Material, Mesh, MeshBasicMaterial, Texture } from 'three';
import type { VisualDie } from './diceVisualEvent';
import { createVisualDieObject } from './threeDiceFactory';

function die(overrides: Partial<VisualDie> = {}): VisualDie {
  return {
    id: 'die-1',
    sides: 6,
    value: 4,
    emphasis: 'normal',
    labelMode: 'standard',
    ...overrides,
  };
}

function expectColorClose(actual: Color, expected: Color): void {
  expect(actual.r).toBeCloseTo(expected.r, 8);
  expect(actual.g).toBeCloseTo(expected.g, 8);
  expect(actual.b).toBeCloseTo(expected.b, 8);
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => vi.restoreAllMocks());

describe('Three.js procedural dice factory', () => {
  it.each([4, 6, 8, 10, 12, 20] as const)('creates a d%i body plus one local number plane per face', (sides) => {
    const object = createVisualDieObject(die({ sides, value: sides }));
    const body = object.group.children.find((child) => child.name === 'die-body');
    const labels = object.group.children.filter((child) => child.name.startsWith('die-face-'));

    expect(body).toBeInstanceOf(Mesh);
    expect(labels).toHaveLength(sides);
    expect(labels.map((label) => label.userData.label)).toContain(String(sides));
    expect(object.colliderVertices.length).toBeGreaterThanOrEqual(12);
    expect([...object.colliderVertices].every(Number.isFinite)).toBe(true);
    expect(object.resultFaceValue).toBe(sides);

    const positions = (body as Mesh).geometry.getAttribute('position');
    const renderedMaximum = Math.max(...Array.from({ length: positions.count }, (_, index) =>
      Math.max(Math.abs(positions.getX(index)), Math.abs(positions.getY(index)), Math.abs(positions.getZ(index))),
    ));
    const colliderMaximum = Math.max(...object.colliderVertices.map((value) => Math.abs(value)));
    expect(colliderMaximum).toBeCloseTo(renderedMaximum, 5);

    object.dispose();
  });

  it.each([4, 6, 8, 10, 12, 20] as const)('highlights only the authoritative numeral for d%i', (sides) => {
    const value = Math.max(1, sides - 1);
    const object = createVisualDieObject(die({ sides, value }));
    const result = object.group.children.find((child) => child.userData.faceValue === value) as Mesh;
    const other = object.group.children.find((child) => child.userData.faceValue !== value && child.userData.faceValue) as Mesh;
    const ivory = new Color('#f0dfbd');

    expect((result.material as MeshBasicMaterial).color.equals(ivory)).toBe(true);
    expect((other.material as MeshBasicMaterial).color.equals(ivory)).toBe(true);

    object.setResultEmphasis(1);

    expectColorClose((result.material as MeshBasicMaterial).color, new Color('#cda65d'));
    expect((other.material as MeshBasicMaterial).color.equals(ivory)).toBe(true);
    object.dispose();
  });

  it('renders local percentile labels and highlights both authoritative d100 component numerals only when requested', () => {
    const tens = createVisualDieObject(die({ sides: 10, value: 10, labelMode: 'percentile-tens' }));
    const ones = createVisualDieObject(die({ sides: 10, value: 10, labelMode: 'percentile-ones' }));

    expect(tens.group.children.filter((child) => child.name.startsWith('die-face-')).map((child) => child.userData.label)).toContain('00');
    expect(ones.group.children.filter((child) => child.name.startsWith('die-face-')).map((child) => child.userData.label)).toContain('0');
    expect(tens.resultFaceValue).toBe(10);
    expect(ones.resultFaceValue).toBe(10);

    const tensResult = tens.group.children.find((child) => child.userData.faceValue === 10) as Mesh;
    const tensOther = tens.group.children.find((child) => child.userData.faceValue === 1) as Mesh;
    const onesResult = ones.group.children.find((child) => child.userData.faceValue === 10) as Mesh;
    const ivory = new Color('#f0dfbd');
    expect((tensResult.material as MeshBasicMaterial).color.equals(ivory)).toBe(true);
    expect((onesResult.material as MeshBasicMaterial).color.equals(ivory)).toBe(true);

    tens.setResultEmphasis(1);
    ones.setResultEmphasis(1);

    expectColorClose((tensResult.material as MeshBasicMaterial).color, new Color('#cda65d'));
    expectColorClose((onesResult.material as MeshBasicMaterial).color, new Color('#cda65d'));
    expect((tensOther.material as MeshBasicMaterial).color.equals(ivory)).toBe(true);

    tens.dispose();
    ones.dispose();
  });

  it('uses kept/discarded material treatment without changing face values', () => {
    const kept = createVisualDieObject(die({ emphasis: 'kept' }));
    const discarded = createVisualDieObject(die({ emphasis: 'discarded' }));
    const keptBody = kept.group.getObjectByName('die-body') as Mesh;
    const discardedBody = discarded.group.getObjectByName('die-body') as Mesh;
    const keptMaterial = keptBody.material as Material & { opacity: number };
    const discardedMaterial = discardedBody.material as Material & { opacity: number };

    expect(kept.group.userData.authoritativeValue).toBe(4);
    expect(discarded.group.userData.authoritativeValue).toBe(4);
    expect(keptMaterial.opacity).toBe(1);
    expect(discardedMaterial.opacity).toBeLessThan(1);

    kept.setResultEmphasis(1);
    discarded.setResultEmphasis(1);
    const keptResult = kept.group.children.find((child) => child.userData.faceValue === 4) as Mesh;
    const discardedResult = discarded.group.children.find((child) => child.userData.faceValue === 4) as Mesh;
    expectColorClose((keptResult.material as MeshBasicMaterial).color, new Color('#e6bd68'));
    expectColorClose((discardedResult.material as MeshBasicMaterial).color, new Color('#9b7b45'));
    expect((discardedResult.material as MeshBasicMaterial).opacity).toBeLessThan(1);

    kept.dispose();
    discarded.dispose();
  });

  it('disposes geometry, material, and generated textures exactly once', () => {
    const object = createVisualDieObject(die({ sides: 8, value: 7 }));
    const geometryDisposals: ReturnType<typeof vi.spyOn>[] = [];
    const materialDisposals: ReturnType<typeof vi.spyOn>[] = [];
    const textureDisposals: ReturnType<typeof vi.spyOn>[] = [];

    object.group.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      geometryDisposals.push(vi.spyOn(child.geometry, 'dispose'));
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        materialDisposals.push(vi.spyOn(material, 'dispose'));
        const map = (material as Material & { map?: Texture }).map;
        if (map) textureDisposals.push(vi.spyOn(map, 'dispose'));
      }
    });

    object.dispose();

    expect(geometryDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(textureDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});
