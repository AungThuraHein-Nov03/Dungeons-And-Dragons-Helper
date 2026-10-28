import type {
  Character,
  CharacterClassProgression,
  CharacterSpellcastingSelection,
  ClassHpProgressionEntry,
  SkillId,
} from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { createFixedHpProgression } from '../rules/health';
import {
  spellcastingProviderDefinitionsAtLevel,
  spellcastingSpellGrantsAtLevel,
} from '../rules/spellcasting';
import { contentRegistry, type ContentRegistry } from '../services/contentRegistry';

export interface HpProgressionDraftEntry {
  readonly level: number;
  readonly method: 'fixed' | 'rolled';
  readonly roll: string;
}

export interface ClassProgressionDraft {
  readonly classId: ContentId;
  readonly subclassId: ContentId;
  readonly level: string;
  readonly skillProficiencies: readonly SkillId[];
  readonly skillExpertise: readonly SkillId[];
  readonly weaponMasterySelections: readonly ContentId[];
  readonly hpProgression: readonly HpProgressionDraftEntry[];
}

export interface EditorSpellcastingProvider {
  readonly provider: SpellcastingProviderDefinition;
  readonly ownerLevel: number;
  readonly classId: ContentId;
  readonly className: string;
  readonly subclassId?: ContentId;
  readonly subclassName?: string;
  readonly grantedSpellIds: ReadonlySet<ContentId>;
}

function cloneSpellcastingSelection(selection: CharacterSpellcastingSelection): CharacterSpellcastingSelection {
  return {
    providerId: selection.providerId,
    cantripIds: [...selection.cantripIds],
    ownedSpellIds: [...selection.ownedSpellIds],
    preparedSpellIds: [...selection.preparedSpellIds],
  };
}

function toHpDraft(entry: ClassHpProgressionEntry): HpProgressionDraftEntry {
  return {
    level: entry.classLevel,
    method: entry.method,
    roll: entry.method === 'rolled' ? String(entry.roll) : '',
  };
}

export function normalizeHpDraft(
  entries: readonly HpProgressionDraftEntry[],
  classLevel: number,
  starting: boolean,
): HpProgressionDraftEntry[] {
  return createFixedHpProgression(classLevel, starting).map((expected) => (
    entries.find((entry) => entry.level === expected.classLevel)
    ?? { level: expected.classLevel, method: 'fixed', roll: '' }
  ));
}

function reconcileSkills(
  skills: readonly SkillId[],
  classId: ContentId,
  starting: boolean,
  registry: ContentRegistry,
): SkillId[] {
  const classContent = registry.findClass(classId);
  if (!classContent) return [];
  const context = classProgressionSkillChoiceContext(classContent, starting);
  return skills.filter((skill) => context.from.includes(skill)).slice(0, context.choose);
}

export function createProgressionDraft(
  classId: ContentId,
  starting: boolean,
  registry: ContentRegistry = contentRegistry,
): ClassProgressionDraft {
  const classContent = registry.findClass(classId);
  return {
    classId,
    subclassId: '',
    level: '1',
    skillProficiencies: [],
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: classContent ? normalizeHpDraft([], 1, starting) : [],
  };
}

export function hydrateClassProgressionDrafts(character: Character): ClassProgressionDraft[] {
  return character.classProgressions.map((progression) => ({
    classId: progression.classId,
    subclassId: progression.subclassId ?? '',
    level: String(progression.level),
    skillProficiencies: [...progression.skillProficiencies],
    skillExpertise: [...progression.skillExpertise],
    weaponMasterySelections: [...progression.weaponMasterySelections],
    hpProgression: progression.hpProgression.map(toHpDraft),
  }));
}

export function progressionDraftToInput(draft: ClassProgressionDraft): CharacterClassProgression {
  const hpProgression: ClassHpProgressionEntry[] = draft.hpProgression.map((entry) => (
    entry.method === 'fixed'
      ? { classLevel: entry.level, method: 'fixed' }
      : { classLevel: entry.level, method: 'rolled', roll: Number(entry.roll) }
  ));
  return {
    classId: draft.classId,
    level: Number(draft.level),
    ...(draft.subclassId ? { subclassId: draft.subclassId } : {}),
    skillProficiencies: [...draft.skillProficiencies],
    skillExpertise: [...draft.skillExpertise],
    weaponMasterySelections: [...draft.weaponMasterySelections],
    hpProgression,
  };
}

export function totalDraftLevel(progressions: readonly ClassProgressionDraft[]): number {
  return progressions.reduce((sum, progression) => sum + Number(progression.level || 0), 0);
}

export function updateProgressionLevel(
  draft: ClassProgressionDraft,
  level: number,
  starting: boolean,
  registry: ContentRegistry = contentRegistry,
): ClassProgressionDraft {
  const selectedSubclass = draft.subclassId ? registry.findSubclass(draft.subclassId) : undefined;
  return {
    ...draft,
    level: String(level),
    subclassId: selectedSubclass && level >= selectedSubclass.acquisitionLevel ? draft.subclassId : '',
    hpProgression: normalizeHpDraft(draft.hpProgression, level, starting),
  };
}

export function updateProgressionClass(
  draft: ClassProgressionDraft,
  classId: ContentId,
  starting: boolean,
  registry: ContentRegistry = contentRegistry,
): ClassProgressionDraft {
  const level = Number(draft.level);
  return {
    ...draft,
    classId,
    subclassId: '',
    skillProficiencies: reconcileSkills(draft.skillProficiencies, classId, starting, registry),
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: normalizeHpDraft(draft.hpProgression, level, starting),
  };
}

export function setDraftStartingClass(
  progressions: readonly ClassProgressionDraft[],
  startingClassId: ContentId,
  registry: ContentRegistry = contentRegistry,
): ClassProgressionDraft[] {
  return progressions.map((progression) => {
    const starting = progression.classId === startingClassId;
    return {
      ...progression,
      skillProficiencies: reconcileSkills(progression.skillProficiencies, progression.classId, starting, registry),
      hpProgression: normalizeHpDraft(progression.hpProgression, Number(progression.level), starting),
    };
  });
}

export function activeEditorSpellcastingProviders(
  progressions: readonly ClassProgressionDraft[],
  registry: ContentRegistry = contentRegistry,
): EditorSpellcastingProvider[] {
  const result: EditorSpellcastingProvider[] = [];
  for (const progression of progressions) {
    const ownerLevel = Number(progression.level);
    const classContent = registry.findClass(progression.classId);
    if (!classContent || !Number.isInteger(ownerLevel) || ownerLevel < 1) continue;
    const subclass = progression.subclassId ? registry.findSubclass(progression.subclassId) : undefined;
    const validSubclass = subclass
      && subclass.parentClassId === classContent.id
      && ownerLevel >= subclass.acquisitionLevel
      ? subclass
      : undefined;
    const grants = spellcastingSpellGrantsAtLevel(classContent, validSubclass, ownerLevel);
    const grantIdsByProvider = new Map<ContentId, Set<ContentId>>();
    for (const grant of grants) {
      const ids = grantIdsByProvider.get(grant.providerId) ?? new Set<ContentId>();
      grant.spellIds.forEach((spellId) => ids.add(spellId));
      grantIdsByProvider.set(grant.providerId, ids);
    }
    for (const provider of spellcastingProviderDefinitionsAtLevel(classContent, validSubclass, ownerLevel)) {
      result.push({
        provider,
        ownerLevel,
        classId: classContent.id,
        className: classContent.name,
        ...(validSubclass ? { subclassId: validSubclass.id, subclassName: validSubclass.name } : {}),
        grantedSpellIds: grantIdsByProvider.get(provider.id) ?? new Set<ContentId>(),
      });
    }
  }
  return result;
}

export function reconcileSpellcastingSelections(
  selections: readonly CharacterSpellcastingSelection[],
  progressions: readonly ClassProgressionDraft[],
  registry: ContentRegistry = contentRegistry,
): CharacterSpellcastingSelection[] {
  const active = new Map(
    activeEditorSpellcastingProviders(progressions, registry)
      .filter(({ provider }) => provider.spellManagement.kind !== 'granted-only')
      .map((context) => [context.provider.id, context] as const),
  );
  return selections.flatMap((selection) => {
    const context = active.get(selection.providerId);
    if (!context) return [];
    const granted = context.grantedSpellIds;
    return [{
      ...cloneSpellcastingSelection(selection),
      cantripIds: selection.cantripIds.filter((id) => !granted.has(id)),
      ownedSpellIds: selection.ownedSpellIds.filter((id) => !granted.has(id)),
      preparedSpellIds: selection.preparedSpellIds.filter((id) => !granted.has(id)),
    }];
  });
}

export function canAddClass(
  progressions: readonly ClassProgressionDraft[],
  classId: ContentId,
): boolean {
  return Boolean(classId) && !progressions.some((progression) => progression.classId === classId);
}

export function canRemoveClass(
  progressions: readonly ClassProgressionDraft[],
  classId: ContentId,
  startingClassId: ContentId,
): boolean {
  return progressions.length > 1 && classId !== startingClassId;
}
