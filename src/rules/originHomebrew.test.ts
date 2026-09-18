import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { BackgroundContent, FeatContent, SpeciesContent } from '../models/content';
import { fighterCharacter } from '../test/fixtures';
import { ContentRegistry } from '../services/contentRegistry';
import { buildHomebrewContentId } from '../services/homebrewContentStorage';
import { deriveCharacterState } from './deriveCharacter';

const source = { type: 'homebrew', namespace: 'austin' } as const;

function homebrewOriginFeat(): FeatContent {
  return {
    id: buildHomebrewContentId('austin', 'feat', 'trail-reader'),
    kind: 'feat', name: 'Trail Reader', source,
    category: 'origin', prerequisites: [], repeatable: false, choices: [], effects: [],
    referenceEffects: [{ id: 'trail-sense', name: 'Trail Sense', description: 'Reference-only Homebrew origin benefit.' }],
    description: 'Homebrew Feat fixture for source-agnostic Background resolution.',
  };
}

function homebrewSpecies(): SpeciesContent {
  return {
    id: buildHomebrewContentId('austin', 'species', 'swiftfolk'),
    kind: 'species', name: 'Swiftfolk', source,
    creatureType: 'humanoid',
    size: { kind: 'choice', options: ['small', 'medium'] },
    speedFeet: 40,
    senses: [{ type: 'darkvision', rangeFeet: 60 }],
    traits: [{ id: 'swift-step', name: 'Swift Step', description: 'Reference-only test trait.', support: 'reference-only' }],
    choices: [],
    skillProficiencyChoice: { id: 'trained-eye', choose: 1, from: ['perception', 'survival'] },
  };
}

function homebrewBackground(): BackgroundContent {
  return {
    id: buildHomebrewContentId('austin', 'background', 'scholar-scout'),
    kind: 'background', name: 'Scholar Scout', source,
    abilityScores: ['dexterity', 'intelligence', 'wisdom'],
    skillProficiencies: ['arcana', 'stealth'],
    toolProficiency: { kind: 'fixed', id: 'cartographers-tools', name: 'Cartographer’s Tools' },
    originFeat: { id: 'homebrew:austin:feat:trail-reader', name: 'Trail Reader' },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 20, unit: 'gp' } }],
    description: 'Homebrew Background used to prove source-agnostic origin derivation.',
  };
}

describe('Homebrew Species and Background compatibility', () => {
  it('derives a Homebrew Species through the same registry and rules path as SRD Species', () => {
    const species = homebrewSpecies();
    const registry = new ContentRegistry(SRD_CONTENT, [species]);
    const character = fighterCharacter({
      speciesId: species.id,
      speciesSize: 'small',
      speciesChoices: {},
      speciesSkillProficiencies: ['survival'],
    });
    const result = deriveCharacterState(character, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.species).toMatchObject({ id: species.id, name: 'Swiftfolk', size: 'small', speedFeet: 40 });
    expect(result.value.skills.survival.proficient).toBe(true);
  });

  it('derives a Homebrew Background and its Origin Feat without source-specific behavior branches', () => {
    const background = homebrewBackground();
    const feat = homebrewOriginFeat();
    const registry = new ContentRegistry(SRD_CONTENT, [feat, background]);
    const character = fighterCharacter({
      backgroundId: background.id,
      backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'intelligence', plusOne: 'wisdom' },
      backgroundEquipmentChoice: 'A',
      backgroundToolChoice: undefined,
    });
    const result = deriveCharacterState(character, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.background).toMatchObject({
      id: background.id,
      name: 'Scholar Scout',
      toolProficiency: { id: 'cartographers-tools', name: 'Cartographer’s Tools' },
      originFeat: { id: 'homebrew:austin:feat:trail-reader', name: 'Trail Reader' },
    });
    expect(result.value.feats).toEqual(expect.arrayContaining([expect.objectContaining({ id: feat.id, name: 'Trail Reader', acquisition: { type: 'background', backgroundId: background.id, backgroundName: 'Scholar Scout' } })]));
    expect(result.value.abilityScores.intelligence).toBe(character.abilityScores.intelligence + 2);
    expect(result.value.abilityScores.wisdom).toBe(character.abilityScores.wisdom + 1);
    expect(result.value.skills.arcana.proficient).toBe(true);
    expect(result.value.skills.stealth.proficient).toBe(true);
  });
});
