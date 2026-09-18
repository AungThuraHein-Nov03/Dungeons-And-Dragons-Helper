import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { SubclassContent } from '../models/content';
import { rollRequest } from '../dice/diceEngine';
import { buildHomebrewContentId, loadHomebrewContent, upsertHomebrewContent } from '../services/homebrewContentStorage';
import { ContentRegistry } from '../services/contentRegistry';
import { fighterCharacter, fighterInput, FIGHTER_ID } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { deriveCharacterState } from './deriveCharacter';

const vanguardId = buildHomebrewContentId('test', 'subclass', 'vanguard');
const vanguard: SubclassContent = {
  id: vanguardId,
  kind: 'subclass',
  name: 'Vanguard',
  source: { type: 'homebrew', namespace: 'test' },
  parentClassId: FIGHTER_ID,
  acquisitionLevel: 3,
  description: 'Synthetic test subclass.',
  progression: [{
    level: 3,
    features: [{
      id: 'homebrew:test:subclass-feature:vanguard-athlete',
      name: 'Vanguard Athlete',
      description: 'Synthetic structured Athletics effect.',
      effects: [{ type: 'skill-check-advantage', skillIds: ['athletics'] }],
      referenceEffects: [],
    }],
  }],
};

describe('Homebrew SubclassContent compatibility', () => {
  it('flows through storage, registry, validation, level gating, derivation, and the existing Dice Engine without source-specific mechanics', () => {
    upsertHomebrewContent(vanguard);
    const stored = loadHomebrewContent();
    expect(stored).toEqual([vanguard]);
    const registry = new ContentRegistry(SRD_CONTENT, stored);
    expect(registry.findSubclass(vanguardId)).toEqual(vanguard);

    const input = fighterInput({ level: 3, subclassId: vanguardId });
    expect(validateCharacterInput(input, {}, registry)).toEqual({});
    expect(validateCharacterInput(fighterInput({ level: 2, subclassId: vanguardId }), {}, registry).subclassId).toMatch(/requires level 3/i);

    const character = fighterCharacter({ level: 3, subclassId: vanguardId });
    const derived = deriveCharacterState(character, registry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.subclass?.name).toBe('Vanguard');
    expect(derived.value.ruleEffects).toContainEqual({ type: 'skill-check-advantage', skillIds: ['athletics'] });

    const athletics = derived.value.skills.athletics;
    const hasAdvantage = derived.value.ruleEffects.some((effect) => effect.type === 'skill-check-advantage' && effect.skillIds.includes('athletics'));
    const values = [0.2, 0.8]; let index = 0;
    const rolled = rollRequest({
      type: 'skill-check', label: 'Skill Check — Athletics', expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: athletics.modifier },
      mode: hasAdvantage ? 'advantage' : 'normal', source: { characterId: character.id, skillId: 'athletics', ability: athletics.ability }, outcome: { kind: 'check' },
    }, () => values[index++]);
    expect(rolled).toMatchObject({ ok: true, value: { request: { mode: 'advantage' }, dice: [{ values: [5, 17] }], keptD20: 17 } });
  });
});
