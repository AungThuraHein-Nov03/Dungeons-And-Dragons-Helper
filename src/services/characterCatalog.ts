import type { Character } from '../models/character';

type Listener = () => void;

let characters: readonly Character[] = Object.freeze([]);
let generation = 0;
const listeners = new Set<Listener>();

function publish(next: readonly Character[]): void {
  characters = Object.freeze(structuredClone(next));
  generation += 1;
  for (const listener of listeners) listener();
}

export function hydrateCharacterCatalog(next: readonly Character[]): void {
  publish(next);
}

export function clearCharacterCatalog(): void {
  publish([]);
}

export function getCharacterCatalogGeneration(): number {
  return generation;
}

export function subscribeCharacterCatalog(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listCatalogCharacters(): Character[] {
  return characters.map((character) => structuredClone(character));
}

export function findCatalogCharacter(id: string): Character | undefined {
  const found = characters.find((character) => character.id === id);
  return found ? structuredClone(found) : undefined;
}
