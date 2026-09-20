import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { ClassContent, SubclassContent } from '../models/content';
import { rollRequest } from '../dice/diceEngine';
import { ContentRegistry } from '../services/contentRegistry';
import { buildHomebrewContentId, loadHomebrewContent, upsertHomebrewContent } from '../services/homebrewContentStorage';
import { fighterCharacter, fighterInput } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { deriveCharacterState } from './deriveCharacter';

const classId = buildHomebrewContentId('test', 'class', 'aether-warden');
const subclassId = buildHomebrewContentId('test', 'subclass', 'aether-warden-path');
const resourceId = 'homebrew:test:class-resource:aether-charge';
const providerId = 'homebrew:test:spellcasting-provider:aether-warden';
const fireBoltId = srdId('spell', 'fire-bolt');

const progression = Array.from({ length: 20 }, (_, index) => ({
  level: index + 1,
  proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
  features: index === 0 ? [{
    id: 'homebrew:test:class-feature:aether-channel',
    name: 'Aether Channel',
    description: 'Synthetic bounded Class capability fixture.',
    effects: [{ type: 'skill-check-advantage', skillIds: ['arcana'] }] as const,
    spellcasting: [{
      id: providerId,
      name: 'Aether Casting',
      spellcastingAbility: { kind: 'fixed' as const, ability: 'charisma' as const },
      multiclassSlotContribution: { kind: 'independent' as const },
      spellManagement: { kind: 'granted-only' as const, spellIds: [fireBoltId] },
      ritualCasting: 'none' as const,
    }],
    resourceConsumers: [{ resourceId, consumer: { id: 'homebrew:test:class-resource-consumer:aether-channel', name: 'Aether Channel', effect: { type: 'expend-only' as const } } }],
    referenceEffects: [],
  }] : [],
}));

const homebrewClass: ClassContent = {
  id: classId,
  kind: 'class',
  name: 'Aether Warden',
  source: { type: 'homebrew', namespace: 'test' },
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'all-of', abilities: ['dexterity', 'charisma'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
  savingThrowProficiencies: ['dexterity', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: ['light'],
  toolProficiencies: [{ id: 'aether-tools', name: 'Aether Tools' }],
  skillChoices: { choose: 3, from: ['arcana', 'athletics', 'perception', 'stealth'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 20, unit: 'gp' } }],
  progression,
  resources: [{
    id: resourceId,
    name: 'Aether Charge',
    source: { type: 'homebrew', namespace: 'test' },
    maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }, { level: 5, uses: 3 }] },
    recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
  }],
};

const homebrewSubclass: SubclassContent = {
  id: subclassId,
  kind: 'subclass',
  name: 'Aether Warden Path',
  source: { type: 'homebrew', namespace: 'test' },
  parentClassId: classId,
  acquisitionLevel: 3,
  description: 'Synthetic Homebrew subclass for M11 conformance.',
  progression: [{
    level: 3,
    features: [{
      id: 'homebrew:test:subclass-feature:aether-warden-path:surge',
      name: 'Aether Surge',
      description: 'Adds another consumer to the parent Class resource.',
      effects: [],
      resourceConsumers: [{ resourceId, consumer: { id: 'homebrew:test:subclass-resource-consumer:aether-surge', name: 'Aether Surge', effect: { type: 'tracking-only' } } }],
      referenceEffects: [],
    }],
  }],
};

describe('Milestone 11 Homebrew Class conformance', () => {
  it('flows through Homebrew storage, registry, validation, Class/Subclass capabilities, resources, Spellcasting, and the existing Dice Engine', () => {
    upsertHomebrewContent(homebrewClass);
    upsertHomebrewContent(homebrewSubclass);
    const stored = loadHomebrewContent();
    expect(stored).toEqual([homebrewClass, homebrewSubclass]);
    const registry = new ContentRegistry(SRD_CONTENT, stored);
    expect(registry.findClass(classId)?.name).toBe('Aether Warden');
    expect(registry.findSubclass(subclassId)?.parentClassId).toBe(classId);

    const input = fighterInput({
      name: 'Homebrew Class Character',
      classId,
      subclassId,
      level: 3,
      skillProficiencies: ['arcana', 'athletics', 'perception'],
    });
    expect(validateCharacterInput(input, {}, registry)).toEqual({});

    const character = { ...fighterCharacter({ level: 3 }), ...input, classId, subclassId };
    const derived = deriveCharacterState(character, registry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.classState!.primaryAbility).toEqual({ mode: 'all-of', abilities: ['dexterity', 'charisma'] });
    expect(derived.value.ruleEffects).toContainEqual({ type: 'skill-check-advantage', skillIds: ['arcana'] });
    expect(derived.value.resources.find((resource) => resource.id === resourceId)).toMatchObject({ maximumUses: 2, consumers: [{ name: 'Aether Channel' }, { name: 'Aether Surge' }] });
    expect(derived.value.spellcasting).toMatchObject([{ id: providerId, ability: 'charisma', saveDc: 12, attackModifier: 4, spells: [{ name: 'Fire Bolt' }] }]);

    const provider = derived.value.spellcasting[0];
    const roll = rollRequest({
      type: 'attack', label: 'Fire Bolt — Aether Casting',
      expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: provider.attackModifier },
      mode: 'normal', source: { characterId: character.id, spellId: fireBoltId, spellcastingProviderId: provider.id, contentId: fireBoltId }, outcome: { kind: 'attack' },
    }, () => (15 - 1) / 20);
    expect(roll).toMatchObject({ ok: true, value: { keptD20: 15, modifier: 4, total: 19 } });
  });
});
