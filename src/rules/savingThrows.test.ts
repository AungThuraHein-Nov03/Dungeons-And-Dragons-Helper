import { describe, expect, it } from 'vitest';
import { SRD_FIGHTER } from '../content/srd';
import { deriveAbilityModifiers } from './abilities';
import { deriveSavingThrows } from './savingThrows';
import { fighterInput } from '../test/fixtures';

describe('saving throws', () => {
  it('uses Fighter class proficiencies rather than hardcoded save logic', () => {
    const modifiers = deriveAbilityModifiers(fighterInput().abilityScores);
    const saves = deriveSavingThrows(modifiers, 2, SRD_FIGHTER);
    expect(saves.strength).toEqual({ ability: 'strength', modifier: 4, proficient: true });
    expect(saves.dexterity).toEqual({ ability: 'dexterity', modifier: 4, proficient: false });
    expect(saves.constitution).toEqual({ ability: 'constitution', modifier: 4, proficient: true });
  });
});
