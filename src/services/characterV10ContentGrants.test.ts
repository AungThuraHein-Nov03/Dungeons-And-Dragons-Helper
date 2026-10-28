import { describe, expect, it } from 'vitest';
import { SRD_ROGUE } from '../content/srd/rogue';
import type { CharacterRuleEffect, ClassContent } from '../models/content';
import { validateContentDataset } from './contentValidation';

const SOURCE = { type: 'homebrew', namespace: 'v10-grants' } as const;

function homeClass(effects: readonly CharacterRuleEffect[]): ClassContent {
  return {
    id: 'homebrew:v10-grants:class:validator',
    kind: 'class',
    name: 'V10 Grant Validator',
    source: SOURCE,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['dexterity'] },
    multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
    savingThrowProficiencies: ['dexterity', 'intelligence'],
    weaponProficiencies: [],
    armorTraining: [],
    toolProficiencies: [],
    skillChoices: { choose: 2, from: ['acrobatics', 'stealth'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 0, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => ({
      level: index + 1,
      proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
      features: index === 0 ? [{
        id: 'homebrew:v10-grants:class-feature:validator',
        name: 'Structured Choice Grants',
        description: 'V10 structured grant fixture.',
        effects,
        referenceEffects: [],
      }] : [],
    })),
    resources: [],
  };
}

function ruleIssues(effect: unknown) {
  return validateContentDataset([homeClass([effect as CharacterRuleEffect])])
    .filter((issue) => issue.code === 'rule-effect');
}

describe('Character v10 structured choice grants', () => {
  it('represents Rogue level-1 Expertise and language choice as structured generic effects', () => {
    const levelOneEffects = SRD_ROGUE.progression[0].features.flatMap((feature) => feature.effects);
    expect(levelOneEffects).toContainEqual({
      type: 'skill-expertise-choice',
      choose: 2,
      eligibility: 'proficient-skills',
    });
    expect(levelOneEffects).toContainEqual({ type: 'language-choice', choose: 1 });
  });

  it('represents the Rogue level-6 Expertise increase without class-name mechanics', () => {
    const levelSixEffects = SRD_ROGUE.progression[5].features.flatMap((feature) => feature.effects);
    expect(levelSixEffects).toContainEqual({
      type: 'skill-expertise-choice',
      choose: 2,
      eligibility: 'proficient-skills',
    });
  });

  it('accepts bounded Expertise and language grants', () => {
    expect(ruleIssues({ type: 'skill-expertise-choice', choose: 2, eligibility: 'proficient-skills' })).toEqual([]);
    expect(ruleIssues({ type: 'skill-expertise-choice', choose: 1, eligibility: 'proficient-class-skills' })).toEqual([]);
    expect(ruleIssues({ type: 'language-choice', choose: 1 })).toEqual([]);
  });

  it('rejects malformed or broadened choice grants', () => {
    for (const effect of [
      { type: 'skill-expertise-choice', choose: 0, eligibility: 'proficient-skills' },
      { type: 'skill-expertise-choice', choose: 2.5, eligibility: 'proficient-skills' },
      { type: 'skill-expertise-choice', choose: 2, eligibility: 'any-skill' },
      { type: 'skill-expertise-choice', choose: 2, eligibility: 'proficient-skills', choices: {} },
      { type: 'language-choice', choose: 0 },
      { type: 'language-choice', choose: 1, languages: ['common'] },
    ]) {
      expect(ruleIssues(effect), JSON.stringify(effect)).not.toEqual([]);
    }
  });
});
