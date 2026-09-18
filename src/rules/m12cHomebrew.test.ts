import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { ClassContent, ResourceConsumerGrant } from '../models/content';
import { ContentRegistry } from '../services/contentRegistry';
import { consumeResourceConsumer } from './playState';
import { deriveClassResources } from './resources';

const SOURCE = { type: 'homebrew', namespace: 'm12c-fixed-cost' } as const;
const RESOURCE_ID = 'homebrew:m12c-fixed-cost:class-resource:discipline';
const CONSUMER_ID = 'homebrew:m12c-fixed-cost:class-resource-consumer:deep-technique';

const fixedCostGrant: ResourceConsumerGrant = {
  resourceId: RESOURCE_ID,
  consumer: { id: CONSUMER_ID, name: 'Deep Technique', effect: { type: 'fixed-expend', amount: 3 } },
};

const progression = Array.from({ length: 20 }, (_, index) => ({
  level: index + 1,
  proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
  features: index === 1 ? [{
    id: 'homebrew:m12c-fixed-cost:class-feature:deep-technique',
    name: 'Deep Technique',
    description: 'Synthetic fixed-cost resource technique.',
    effects: [],
    resourceConsumers: [fixedCostGrant],
    referenceEffects: [],
  }] : [],
}));

const homebrewClass: ClassContent = {
  id: 'homebrew:m12c-fixed-cost:class:discipline-keeper',
  kind: 'class',
  name: 'Discipline Keeper',
  source: SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['wisdom'] },
  savingThrowProficiencies: ['dexterity', 'wisdom'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: [],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['acrobatics', 'insight', 'perception'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 10, unit: 'gp' } }],
  progression,
  resources: [{
    id: RESOURCE_ID,
    name: 'Discipline',
    source: SOURCE,
    maximum: { kind: 'level-table', values: [{ level: 2, uses: 5 }, { level: 10, uses: 10 }] },
    recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
    presentation: 'numeric',
  }],
};

describe('Milestone 12C Homebrew fixed-expenditure conformance', () => {
  it('accepts and executes a synthetic Homebrew fixed-cost consumer through the shared generic pipeline', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [homebrewClass]);
    expect(registry.findClass(homebrewClass.id)).toEqual(homebrewClass);

    const resources = deriveClassResources(6, homebrewClass, [fixedCostGrant]);
    expect(resources).toMatchObject({ ok: true, value: [{ id: RESOURCE_ID, maximumUses: 5, presentation: 'numeric' }] });
    if (!resources.ok) throw new Error(resources.error.message);

    const state = { currentHp: 20, temporaryHp: 0, hitDiceRemaining: 6, resourceUses: { [RESOURCE_ID]: 5 } };
    expect(consumeResourceConsumer(state, RESOURCE_ID, CONSUMER_ID, resources.value, { classLevel: 6, maximumHp: 20 }))
      .toMatchObject({ ok: true, value: { resourceUses: { [RESOURCE_ID]: 2 } } });
    expect(consumeResourceConsumer({ ...state, resourceUses: { [RESOURCE_ID]: 2 } }, RESOURCE_ID, CONSUMER_ID, resources.value, { classLevel: 6, maximumHp: 20 }))
      .toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
  });

  it('rejects malformed fixed-cost Homebrew metadata without class-name or source-specific handling', () => {
    const malformed: ClassContent = structuredClone(homebrewClass);
    const feature = malformed.progression[1].features[0];
    if (!feature.resourceConsumers?.[0] || feature.resourceConsumers[0].consumer.effect.type !== 'fixed-expend') throw new Error('Synthetic fixed-cost fixture missing.');
    (feature.resourceConsumers[0].consumer.effect as { type: 'fixed-expend'; amount: number }).amount = 0;
    expect(() => new ContentRegistry(SRD_CONTENT, [malformed])).toThrow(/positive whole-number fixed expenditure/i);
  });
});
