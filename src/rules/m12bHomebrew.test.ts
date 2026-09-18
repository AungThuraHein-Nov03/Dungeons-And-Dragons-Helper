import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { ClassContent, ResourceConsumerGrant, SpellcastingProviderDefinition } from '../models/content';
import { ContentRegistry } from '../services/contentRegistry';
import { consumeResourceConsumer } from './playState';
import { deriveClassResources } from './resources';
import { deriveSpellcastingProviders, type SpellcastingProviderGrant, type SpellcastingSpellGrant } from './spellcasting';
import type { DerivedAbilityModifiers } from './types';

const SOURCE = { type: 'homebrew', namespace: 'm12b-conformance' } as const;
const RESOURCE_ID = 'homebrew:m12b-conformance:class-resource:focus-points';
const CONSUMER_ID = 'homebrew:m12b-conformance:class-resource-consumer:focus-burst';

const progression = Array.from({ length: 20 }, (_, index) => ({
  level: index + 1,
  proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
  features: [],
}));

const homebrewClass: ClassContent = {
  id: 'homebrew:m12b-conformance:class:resonant-adept',
  kind: 'class',
  name: 'Resonant Adept',
  source: SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['charisma'] },
  savingThrowProficiencies: ['dexterity', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: ['light'],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['arcana', 'insight', 'performance'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 20, unit: 'gp' } }],
  progression,
  resources: [{
    id: RESOURCE_ID,
    name: 'Focus Points',
    source: SOURCE,
    maximum: { kind: 'ability-modifier', ability: 'charisma', minimum: 1 },
    recovery: [{ trigger: 'long-rest', mode: 'all' }, { trigger: 'short-rest', mode: 'all', minimumLevel: 5 }],
    presentation: 'numeric',
  }],
};

const resourceGrant: ResourceConsumerGrant = {
  resourceId: RESOURCE_ID,
  consumer: { id: CONSUMER_ID, name: 'Focus Burst', effect: { type: 'variable-expend' } },
};

const MODIFIERS: DerivedAbilityModifiers = {
  strength: 0,
  dexterity: 2,
  constitution: 1,
  intelligence: 1,
  wisdom: 0,
  charisma: 4,
};

function preparedProvider(id: string, replacement: 'long-rest-one' | 'class-level-one'): SpellcastingProviderDefinition {
  return {
    id: `homebrew:m12b-conformance:spellcasting-provider:${id}`,
    name: `${id} Casting`,
    spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
    spellManagement: {
      kind: 'prepared-from-list',
      spellListId: 'cleric',
      cantripCount: [{ level: 1, count: 2 }],
      preparedSpellCount: [{ level: 1, count: 3 }],
      replacement,
    },
    ritualCasting: 'prepared',
  };
}

function providerGrant(definition: SpellcastingProviderDefinition): SpellcastingProviderGrant {
  return {
    definition,
    source: SOURCE,
    grantedBy: { contentId: 'homebrew:m12b-conformance:class-feature:spellcasting', contentName: 'Synthetic Spellcasting' },
  };
}

describe('Milestone 12B Homebrew generic-capability conformance', () => {
  it('derives ability-based maxima and level-gated recovery from synthetic Homebrew resource data', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [homebrewClass]);
    expect(registry.findClass(homebrewClass.id)).toEqual(homebrewClass);

    const level4 = deriveClassResources(4, homebrewClass, [resourceGrant], MODIFIERS);
    const level5 = deriveClassResources(5, homebrewClass, [resourceGrant], MODIFIERS);
    expect(level4).toMatchObject({
      ok: true,
      value: [{ id: RESOURCE_ID, maximumUses: 4, presentation: 'numeric', recovery: [{ trigger: 'long-rest', mode: 'all' }] }],
    });
    expect(level5).toMatchObject({
      ok: true,
      value: [{ id: RESOURCE_ID, maximumUses: 4, recovery: [{ trigger: 'long-rest', mode: 'all' }, { trigger: 'short-rest', mode: 'all', minimumLevel: 5 }] }],
    });
  });

  it('uses the same bounded variable-expenditure transition for a synthetic Homebrew resource consumer', () => {
    const derived = deriveClassResources(5, homebrewClass, [resourceGrant], MODIFIERS);
    if (!derived.ok) throw new Error(derived.error.message);
    const state = { currentHp: 20, temporaryHp: 0, hitDiceRemaining: 5, resourceUses: { [RESOURCE_ID]: 4 } };

    expect(consumeResourceConsumer(state, RESOURCE_ID, CONSUMER_ID, derived.value, { classLevel: 5, maximumHp: 20, expenditureAmount: 3 }))
      .toMatchObject({ ok: true, value: { resourceUses: { [RESOURCE_ID]: 1 } } });
    expect(consumeResourceConsumer(state, RESOURCE_ID, CONSUMER_ID, derived.value, { classLevel: 5, maximumHp: 20, expenditureAmount: 5 }))
      .toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
    expect(consumeResourceConsumer(state, RESOURCE_ID, CONSUMER_ID, derived.value, { classLevel: 5, maximumHp: 20 }))
      .toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
  });

  it('preserves both widened prepared-spell replacement policies for synthetic Homebrew providers', () => {
    const longRest = preparedProvider('long-rest', 'long-rest-one');
    const classLevel = preparedProvider('class-level', 'class-level-one');
    const registry = new ContentRegistry(SRD_CONTENT, []);
    const result = deriveSpellcastingProviders([providerGrant(longRest), providerGrant(classLevel)], 5, MODIFIERS, 3, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.providers.map((provider) => provider.management.kind === 'prepared-from-list' ? provider.management.replacement : null))
      .toEqual(['long-rest-one', 'class-level-one']);
  });

  it('attaches synthetic Homebrew always-prepared grants only to their declared provider', () => {
    const target = preparedProvider('target', 'long-rest-one');
    const other = preparedProvider('other', 'class-level-one');
    const fixedGrants: SpellcastingSpellGrant[] = [{
      definition: {
        providerId: target.id,
        spellIds: [srdId('spell', 'aid'), srdId('spell', 'guiding-bolt')],
        status: 'always-prepared',
      },
      grantedBy: { contentId: 'homebrew:m12b-conformance:subclass-feature:fixed-spells', contentName: 'Fixed Spells' },
    }];
    const result = deriveSpellcastingProviders([providerGrant(target), providerGrant(other)], 5, MODIFIERS, 3, new ContentRegistry(SRD_CONTENT, []), fixedGrants);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.providers[0].spellGrants.map((grant) => [grant.spell.name, grant.status, grant.grantedBy.contentName])).toEqual([
      ['Aid', 'always-prepared', 'Fixed Spells'],
      ['Guiding Bolt', 'always-prepared', 'Fixed Spells'],
    ]);
    expect(result.value.providers[0].spells.map((spell) => spell.name)).toEqual(['Aid', 'Guiding Bolt']);
    expect(result.value.providers[1].spellGrants).toEqual([]);
    expect(result.value.providers[1].spells).toEqual([]);
  });
});
