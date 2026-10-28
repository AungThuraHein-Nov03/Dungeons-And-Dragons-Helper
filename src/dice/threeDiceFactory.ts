import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { createDieGeometry, getDieDefinition, getDieFaceLabel } from './dieDefinitions';
import type { VisualDie } from './diceVisualEvent';

export interface VisualDieObject {
  readonly group: Group;
  readonly colliderVertices: Float32Array;
  readonly resultFaceValue: number;
  setResultEmphasis(progress: number): void;
  dispose(): void;
}

const NUMBER_IVORY = new Color('#f0dfbd');
const RESULT_GOLD = new Color('#cda65d');
const KEPT_RESULT_GOLD = new Color('#e6bd68');
const DISCARDED_RESULT_GOLD = new Color('#9b7b45');

function createNumberTexture(label: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 ${label.length > 1 ? 88 : 112}px Georgia, "Times New Roman", serif`;
    context.lineWidth = 9;
    context.strokeStyle = '#17130d';
    context.fillStyle = '#ffffff';
    context.strokeText(label, canvas.width / 2, canvas.height / 2 + 5);
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 5);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function labelScale(sides: VisualDie['sides']): number {
  switch (sides) {
    case 6: return 0.62;
    case 10: return 0.43;
    case 12: return 0.4;
    case 20: return 0.34;
    default: return 0.42;
  }
}

function colliderVertices(geometry: BufferGeometry): Float32Array {
  const positions = geometry.getAttribute('position');
  const values = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    values[index * 3] = positions.getX(index);
    values[index * 3 + 1] = positions.getY(index);
    values[index * 3 + 2] = positions.getZ(index);
  }
  return values;
}

export function createVisualDieObject(die: VisualDie): VisualDieObject {
  const definition = getDieDefinition(die.sides);
  const geometry = createDieGeometry(die.sides);
  geometry.computeVertexNormals();
  const kept = die.emphasis === 'kept';
  const discarded = die.emphasis === 'discarded';
  const bodyMaterial = new MeshPhysicalMaterial({
    color: new Color(kept ? '#3c2d18' : '#181715'),
    emissive: new Color(kept ? '#3a2508' : '#080706'),
    emissiveIntensity: kept ? 0.28 : 0.08,
    metalness: 0.12,
    roughness: 0.42,
    clearcoat: 0.26,
    clearcoatRoughness: 0.6,
    flatShading: true,
    transparent: discarded,
    opacity: discarded ? 0.48 : 1,
  });
  const body = new Mesh(geometry, bodyMaterial);
  body.name = 'die-body';
  body.castShadow = true;
  body.receiveShadow = true;

  const group = new Group();
  group.name = `visual-d${die.sides}`;
  group.userData.authoritativeValue = die.value;
  group.userData.emphasis = die.emphasis;
  group.userData.geometryKind = definition.geometryKind;
  group.add(body);

  const scaledLabelSize = labelScale(die.sides) * definition.scale;
  const planeGeometry = new PlaneGeometry(scaledLabelSize, scaledLabelSize);
  const planeNormal = new Vector3(0, 0, 1);
  let resultMaterial: MeshBasicMaterial | undefined;
  for (const face of definition.faces) {
    const label = getDieFaceLabel(die.sides, face.value, die.labelMode);
    const texture = createNumberTexture(label);
    const material = new MeshBasicMaterial({
      map: texture,
      color: NUMBER_IVORY,
      transparent: true,
      opacity: discarded ? 0.55 : 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: DoubleSide,
      toneMapped: false,
    });
    if (face.value === die.value) resultMaterial = material;
    const numberPlane = new Mesh(planeGeometry, material);
    const normal = new Vector3(...face.normal);
    numberPlane.position.set(...face.center).addScaledVector(normal, 0.018);
    numberPlane.quaternion.copy(new Quaternion().setFromUnitVectors(planeNormal, normal));
    numberPlane.name = `die-face-${face.value}-${label}`;
    numberPlane.userData.faceValue = face.value;
    numberPlane.userData.label = label;
    group.add(numberPlane);
  }

  const vertices = colliderVertices(geometry);
  const resultColor = kept ? KEPT_RESULT_GOLD : discarded ? DISCARDED_RESULT_GOLD : RESULT_GOLD;
  let disposed = false;
  return {
    group,
    colliderVertices: vertices,
    resultFaceValue: die.value,
    setResultEmphasis(progress: number) {
      if (!resultMaterial) return;
      const bounded = Math.max(0, Math.min(1, progress));
      resultMaterial.color.copy(NUMBER_IVORY).lerp(resultColor, bounded);
      resultMaterial.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const textures = new Set<Texture>();
      group.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        geometries.add(child.geometry);
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of childMaterials) {
          materials.add(material);
          const map = (material as Material & { map?: Texture | null }).map;
          if (map) textures.add(map);
        }
      });
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
      for (const disposableGeometry of geometries) disposableGeometry.dispose();
      group.clear();
    },
  };
}
