import {
  BoxGeometry,
  BufferGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import type { VisualDieLabelMode, VisualDieSides } from './diceVisualEvent';

export type Vector3Tuple = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];

export type DieGeometryKind =
  | 'tetrahedron'
  | 'cube'
  | 'octahedron'
  | 'pentagonal-trapezohedron'
  | 'dodecahedron'
  | 'icosahedron';

export interface DieFaceDefinition {
  readonly value: number;
  readonly normal: Vector3Tuple;
  readonly center: Vector3Tuple;
}

export interface DieDefinition {
  readonly sides: VisualDieSides;
  readonly geometryKind: DieGeometryKind;
  readonly scale: number;
  readonly faces: readonly DieFaceDefinition[];
}

interface FaceCluster {
  readonly normal: Vector3;
  readonly triangleCenters: Vector3[];
}

const definitionCache = new Map<VisualDieSides, DieDefinition>();

export function dieScale(sides: VisualDieSides): number {
  return sides === 20 ? 1.4 : 1;
}

function pushTriangle(positions: number[], a: Vector3, b: Vector3, c: Vector3): void {
  const normal = new Vector3().crossVectors(new Vector3().subVectors(b, a), new Vector3().subVectors(c, a));
  const center = new Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
  const ordered = normal.dot(center) >= 0 ? [a, b, c] : [a, c, b];
  for (const vertex of ordered) positions.push(vertex.x, vertex.y, vertex.z);
}

function createD10Geometry(): BufferGeometry {
  const positions: number[] = [];
  const topRing = Array.from({ length: 5 }, (_, index) => {
    const angle = (index * Math.PI * 2) / 5;
    return new Vector3(Math.cos(angle), 0.52, Math.sin(angle));
  });
  const bottomRing = Array.from({ length: 5 }, (_, index) => {
    const angle = ((index + 0.5) * Math.PI * 2) / 5;
    return new Vector3(Math.cos(angle), -0.52, Math.sin(angle));
  });

  function dualVertex(vertices: readonly Vector3[]): Vector3 {
    const normal = new Vector3().crossVectors(
      new Vector3().subVectors(vertices[1], vertices[0]),
      new Vector3().subVectors(vertices[2], vertices[0]),
    ).normalize();
    const center = vertices.reduce((sum, vertex) => sum.add(vertex), new Vector3()).multiplyScalar(1 / vertices.length);
    if (normal.dot(center) < 0) normal.negate();
    return normal.multiplyScalar(1 / normal.dot(vertices[0]));
  }

  const topPole = dualVertex(topRing);
  const bottomPole = dualVertex(bottomRing);
  const upperSide = topRing.map((top, index) => dualVertex([top, bottomRing[index], topRing[(index + 1) % 5]]));
  const lowerSide = topRing.map((top, index) => dualVertex([top, bottomRing[(index + 4) % 5], bottomRing[index]]));

  for (let index = 0; index < 5; index += 1) {
    const topKite = [topPole, upperSide[(index + 4) % 5], lowerSide[index], upperSide[index]];
    pushTriangle(positions, topKite[0], topKite[1], topKite[2]);
    pushTriangle(positions, topKite[0], topKite[2], topKite[3]);

    const bottomKite = [bottomPole, lowerSide[(index + 1) % 5], upperSide[index], lowerSide[index]];
    pushTriangle(positions, bottomKite[0], bottomKite[1], bottomKite[2]);
    pushTriangle(positions, bottomKite[0], bottomKite[2], bottomKite[3]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createDieGeometry(sides: VisualDieSides): BufferGeometry {
  let geometry: BufferGeometry;
  switch (sides) {
    case 4: geometry = new TetrahedronGeometry(1, 0); break;
    case 6: geometry = new BoxGeometry(1.45, 1.45, 1.45, 1, 1, 1); break;
    case 8: geometry = new OctahedronGeometry(1, 0); break;
    case 10: geometry = createD10Geometry(); break;
    case 12: geometry = new DodecahedronGeometry(1, 0); break;
    case 20: geometry = new IcosahedronGeometry(1, 0); break;
    default: throw new Error(`Unsupported visual die: d${String(sides)}`);
  }
  const scale = dieScale(sides);
  if (scale !== 1) geometry.scale(scale, scale, scale);
  return geometry;
}

function geometryKind(sides: VisualDieSides): DieGeometryKind {
  switch (sides) {
    case 4: return 'tetrahedron';
    case 6: return 'cube';
    case 8: return 'octahedron';
    case 10: return 'pentagonal-trapezohedron';
    case 12: return 'dodecahedron';
    case 20: return 'icosahedron';
    default: throw new Error(`Unsupported visual die: d${String(sides)}`);
  }
}

function vectorTuple(vector: Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z];
}

function extractFaceClusters(geometry: BufferGeometry): FaceCluster[] {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const vertexCount = index ? index.count : positions.count;
  const clusters: FaceCluster[] = [];

  for (let offset = 0; offset < vertexCount; offset += 3) {
    const vertexIndex = (position: number) => index ? index.getX(offset + position) : offset + position;
    const a = new Vector3().fromBufferAttribute(positions, vertexIndex(0));
    const b = new Vector3().fromBufferAttribute(positions, vertexIndex(1));
    const c = new Vector3().fromBufferAttribute(positions, vertexIndex(2));
    const normal = new Vector3().crossVectors(new Vector3().subVectors(b, a), new Vector3().subVectors(c, a)).normalize();
    const center = new Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
    if (normal.dot(center) < 0) normal.negate();
    const cluster = clusters.find((candidate) => candidate.normal.dot(normal) > 0.9999);
    if (cluster) {
      cluster.triangleCenters.push(center);
    } else {
      clusters.push({ normal, triangleCenters: [center] });
    }
  }
  return clusters;
}

function buildDefinition(sides: VisualDieSides): DieDefinition {
  const geometry = createDieGeometry(sides);
  const clusters = extractFaceClusters(geometry).sort((left, right) => {
    if (Math.abs(left.normal.y - right.normal.y) > 1e-6) return right.normal.y - left.normal.y;
    if (Math.abs(left.normal.x - right.normal.x) > 1e-6) return left.normal.x - right.normal.x;
    return left.normal.z - right.normal.z;
  });
  geometry.dispose();
  if (clusters.length !== sides) {
    throw new Error(`Expected d${sides} to expose ${sides} faces, received ${clusters.length}.`);
  }

  return {
    sides,
    geometryKind: geometryKind(sides),
    scale: dieScale(sides),
    faces: clusters.map((cluster, index) => {
      const center = cluster.triangleCenters.reduce((sum, value) => sum.add(value), new Vector3()).multiplyScalar(1 / cluster.triangleCenters.length);
      return { value: index + 1, normal: vectorTuple(cluster.normal), center: vectorTuple(center) };
    }),
  };
}

export function getDieDefinition(sides: VisualDieSides): DieDefinition {
  const cached = definitionCache.get(sides);
  if (cached) return cached;
  const definition = buildDefinition(sides);
  definitionCache.set(sides, definition);
  return definition;
}

export function getDieFaceLabel(sides: VisualDieSides, value: number, mode: VisualDieLabelMode): string {
  if (!Number.isInteger(value) || value < 1 || value > sides) throw new Error(`Invalid d${sides} face value: ${value}`);
  if (mode === 'percentile-tens') return value === 10 ? '00' : String(value * 10);
  if (mode === 'percentile-ones') return value === 10 ? '0' : String(value);
  return String(value);
}

export function targetQuaternionForFace(definition: DieDefinition, value: number, yaw: number): QuaternionTuple {
  const face = definition.faces.find((candidate) => candidate.value === value);
  if (!face) throw new Error(`No face ${value} exists on d${definition.sides}.`);
  const worldUp = new Vector3(0, 1, 0);
  const alignment = new Quaternion().setFromUnitVectors(new Vector3(...face.normal), worldUp);
  const yawRotation = new Quaternion().setFromAxisAngle(worldUp, yaw);
  const target = yawRotation.multiply(alignment).normalize();
  return [target.x, target.y, target.z, target.w];
}

export function closestTargetQuaternionForFace(
  definition: DieDefinition,
  value: number,
  current: QuaternionTuple,
): QuaternionTuple {
  const alignmentTuple = targetQuaternionForFace(definition, value, 0);
  const [ax, ay, az, aw] = alignmentTuple;
  const currentQuaternion = new Quaternion(...current).normalize();
  const { x: cx, y: cy, z: cz, w: cw } = currentQuaternion;

  // target(yaw) = yawAroundWorldUp * alignment. Its dot product with the
  // current orientation is A*cos(yaw/2) + B*sin(yaw/2), so this yaw is the
  // exact closest member of the equivalent authoritative-face-up family.
  const a = ax * cx + ay * cy + az * cz + aw * cw;
  const b = az * cx + aw * cy - ax * cz - ay * cw;
  const yaw = 2 * Math.atan2(b, a);
  return targetQuaternionForFace(definition, value, yaw);
}
