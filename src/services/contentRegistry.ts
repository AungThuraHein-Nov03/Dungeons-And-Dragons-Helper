import { SRD_CONTENT } from '../content/srd';
import type { ArmorContent, BackgroundContent, ClassContent, ContentEntry, ContentKind, ContentOfKind, ContentSourceMetadata, FeatContent, SpeciesContent, SpellContent, SubclassContent, WeaponContent, WeaponMasteryContent } from '../models/content';
import { deepFreeze } from '../utils/deepFreeze';
import { assertValidContentDataset } from './contentValidation';

export type SourceFilter = ContentSourceMetadata['type'];

export class ContentRegistry {
  readonly #entries: readonly ContentEntry[];
  readonly #byId: ReadonlyMap<string, ContentEntry>;

  constructor(srdEntries: readonly ContentEntry[], homebrewEntries: readonly ContentEntry[] = []) {
    const combined = [...srdEntries, ...homebrewEntries];
    assertValidContentDataset(combined);
    this.#entries = deepFreeze(combined.map((entry) => structuredClone(entry)));
    this.#byId = new Map(this.#entries.map((entry) => [entry.id, entry]));
  }

  getById(id: string): ContentEntry | undefined {
    return this.#byId.get(id);
  }

  getAll<K extends ContentKind>(kind: K): readonly ContentOfKind<K>[] {
    return this.#entries.filter((entry): entry is ContentOfKind<K> => entry.kind === kind);
  }

  filterBySource(source: SourceFilter): readonly ContentEntry[] {
    return this.#entries.filter((entry) => entry.source.type === source);
  }

  findClass(id: string): ClassContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'class' ? entry : undefined;
  }

  findSubclass(id: string): SubclassContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'subclass' ? entry : undefined;
  }

  findSubclassesForClass(parentClassId: string): readonly SubclassContent[] {
    return this.getAll('subclass').filter((entry) => entry.parentClassId === parentClassId);
  }

  findSpecies(id: string): SpeciesContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'species' ? entry : undefined;
  }

  findBackground(id: string): BackgroundContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'background' ? entry : undefined;
  }

  findFeat(id: string): FeatContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'feat' ? entry : undefined;
  }

  findSpell(id: string): SpellContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'spell' ? entry : undefined;
  }

  findWeapon(id: string): WeaponContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'weapon' ? entry : undefined;
  }

  findArmor(id: string): ArmorContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'armor' ? entry : undefined;
  }

  findMastery(id: string): WeaponMasteryContent | undefined {
    const entry = this.getById(id);
    return entry?.kind === 'weaponMastery' ? entry : undefined;
  }
}

export function createContentRegistry(homebrewEntries: readonly ContentEntry[] = []): ContentRegistry {
  return new ContentRegistry(SRD_CONTENT, homebrewEntries);
}

export const contentRegistry = createContentRegistry();
