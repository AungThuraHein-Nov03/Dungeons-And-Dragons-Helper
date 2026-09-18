import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { FeatContent } from '../models/content';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { buildHomebrewContentId } from '../services/homebrewContentStorage';
import { fighterCharacter } from '../test/fixtures';
import { deriveCharacterState } from './deriveCharacter';
import { deriveCharacterFeats } from './feats';
import { deriveEffectiveAbilityScores } from './background';

const ARCHERY_ID = srdId('feat', 'archery');
const DEFENSE_ID = srdId('feat', 'defense');
const ASI_ID = srdId('feat', 'ability-score-improvement');
const GRAPPLER_ID = srdId('feat', 'grappler');
const SAVAGE_ATTACKER_ID = srdId('feat', 'savage-attacker');

function registryWeapon(contentId: string, category: 'weapon' | 'armor', equipped = true) {
  return { id: `feat-test:${contentId}`, kind: 'registry' as const, contentId, category, quantity: 1, equipped, notes: '' };
}

describe('Feat rules', () => {
  it('derives Background Origin Feat ownership without persisting it in manualFeats', () => {
    const character = fighterCharacter();
    expect(character.manualFeats).toEqual([]);
    const result = deriveCharacterState(character, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feats).toHaveLength(1);
    expect(result.value.feats[0]).toMatchObject({
      id: srdId('feat', 'magic-initiate'),
      name: 'Magic Initiate',
      variant: 'Cleric',
      acquisition: { type: 'background', backgroundId: srdId('background', 'acolyte'), backgroundName: 'Acolyte' },
    });
  });

  it('supports separate manual Feat ownership and rejects duplicate nonrepeatable logical ownership', () => {
    const manual = fighterCharacter({ manualFeats: [{ featId: ARCHERY_ID, choices: {} }] });
    const manualResult = deriveCharacterState(manual, contentRegistry);
    expect(manualResult.ok).toBe(true);
    if (manualResult.ok) expect(manualResult.value.feats.map((feat) => feat.id)).toEqual([srdId('feat', 'magic-initiate'), ARCHERY_ID]);

    const duplicate = fighterCharacter({
      backgroundId: srdId('background', 'soldier'),
      backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'dexterity', plusOne: 'constitution' },
      backgroundToolChoice: 'dice-set',
      manualFeats: [{ featId: SAVAGE_ATTACKER_ID, choices: {} }],
    });
    const duplicateResult = deriveCharacterState(duplicate, contentRegistry);
    expect(duplicateResult).toMatchObject({ ok: false, error: { code: 'duplicate-feat', contentId: SAVAGE_ATTACKER_ID } });
  });

  it('applies structured Ability Score Improvement selections sequentially and enforces the per-feat cap', () => {
    const character = fighterCharacter({ manualFeats: [{ featId: ASI_ID, choices: { 'ability-increase': ['constitution', 'constitution'] } }] });
    const result = deriveCharacterState(character, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(character.abilityScores.constitution).toBe(14);
    expect(result.value.abilityScores.constitution).toBe(16);
    expect(result.value.health.maximumHp).toBe(40);

    const capped = fighterCharacter({ abilityScores: { strength: 20 }, manualFeats: [{ featId: ASI_ID, choices: { 'ability-increase': ['strength', 'strength'] } }] });
    const cappedBackgroundScores = deriveEffectiveAbilityScores(capped, contentRegistry);
    expect(cappedBackgroundScores.ok).toBe(true);
    if (!cappedBackgroundScores.ok) return;
    const cappedResult = deriveCharacterFeats(capped, contentRegistry, cappedBackgroundScores.value);
    expect(cappedResult).toMatchObject({ ok: false, error: { code: 'invalid-feat-choice', contentId: ASI_ID } });
  });

  it('evaluates supported prerequisites and keeps unsupported feature prerequisites explicitly not evaluated', () => {
    const tooLow = fighterCharacter({ level: 3, manualFeats: [{ featId: GRAPPLER_ID, choices: { 'ability-increase': ['strength'] } }] });
    const tooLowBackgroundScores = deriveEffectiveAbilityScores(tooLow, contentRegistry);
    expect(tooLowBackgroundScores.ok).toBe(true);
    if (!tooLowBackgroundScores.ok) return;
    expect(deriveCharacterFeats(tooLow, contentRegistry, tooLowBackgroundScores.value)).toMatchObject({ ok: false, error: { code: 'invalid-feat-choice', contentId: GRAPPLER_ID } });

    const archery = fighterCharacter({ manualFeats: [{ featId: ARCHERY_ID, choices: {} }] });
    const archeryResult = deriveCharacterState(archery, contentRegistry);
    expect(archeryResult.ok).toBe(true);
    if (!archeryResult.ok) return;
    const derivedArchery = archeryResult.value.feats.find((feat) => feat.id === ARCHERY_ID)!;
    expect(derivedArchery.prerequisites).toEqual([{ description: 'Fighting Style Feature', status: 'not-evaluated' }]);
  });

  it('applies Archery generically to ranged weapon attack modifiers', () => {
    const crossbowId = srdId('weapon', 'light-crossbow');
    const withoutFeat = deriveCharacterState(fighterCharacter({ inventory: [registryWeapon(crossbowId, 'weapon')] }), contentRegistry);
    const withFeat = deriveCharacterState(fighterCharacter({ inventory: [registryWeapon(crossbowId, 'weapon')], manualFeats: [{ featId: ARCHERY_ID, choices: {} }] }), contentRegistry);
    expect(withoutFeat.ok).toBe(true);
    expect(withFeat.ok).toBe(true);
    if (!withoutFeat.ok || !withFeat.ok) return;
    expect(withoutFeat.value.attacks[0].attackModifier).toBe(6);
    expect(withFeat.value.attacks[0].attackModifier).toBe(8);
  });

  it('applies Defense generically only while wearing supported body armor', () => {
    const chainMailId = srdId('armor', 'chain-mail');
    const armored = deriveCharacterState(fighterCharacter({ inventory: [registryWeapon(chainMailId, 'armor')], manualFeats: [{ featId: DEFENSE_ID, choices: {} }] }), contentRegistry);
    const unarmored = deriveCharacterState(fighterCharacter({ manualFeats: [{ featId: DEFENSE_ID, choices: {} }] }), contentRegistry);
    expect(armored.ok).toBe(true);
    expect(unarmored.ok).toBe(true);
    if (!armored.ok || !unarmored.ok) return;
    expect(armored.value.defense.armorClass).toBe(17);
    expect(unarmored.value.defense.armorClass).toBe(14);
  });

  it('runs a structurally compatible Homebrew Feat through Character ownership and the same generic effect pipeline', () => {
    const homebrewFeat: FeatContent = {
      id: buildHomebrewContentId('austin', 'feat', 'steady-aim'),
      kind: 'feat',
      name: 'Steady Aim',
      source: { type: 'homebrew', namespace: 'austin' },
      category: 'general',
      prerequisites: [{ type: 'level', minimum: 4 }],
      repeatable: false,
      choices: [],
      effects: [{ type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 1 }],
      referenceEffects: [],
      description: 'Homebrew fixture using the same bounded ranged-attack effect.',
    };
    const registry = new ContentRegistry(SRD_CONTENT, [homebrewFeat]);
    const crossbowId = srdId('weapon', 'light-crossbow');
    const character = fighterCharacter({ inventory: [registryWeapon(crossbowId, 'weapon')], manualFeats: [{ featId: homebrewFeat.id, choices: {} }] });
    const result = deriveCharacterState(character, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feats).toEqual(expect.arrayContaining([expect.objectContaining({ id: homebrewFeat.id, acquisition: { type: 'manual' } })]));
    expect(result.value.attacks[0].attackModifier).toBe(7);
  });
});
