import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { SpellContent, SubclassContent } from '../models/content';
import { rollRequest } from '../dice/diceEngine';
import { buildHomebrewContentId, loadHomebrewContent, upsertHomebrewContent } from '../services/homebrewContentStorage';
import { ContentRegistry } from '../services/contentRegistry';
import { fighterCharacter, FIGHTER_ID } from '../test/fixtures';
import { deriveCharacterState } from './deriveCharacter';

const spellId = buildHomebrewContentId('test', 'spell', 'moon-spark');
const subclassId = buildHomebrewContentId('test', 'subclass', 'star-warden');
const providerId = 'homebrew:test:spellcasting-provider:star-warden';

const moonSpark: SpellContent = {
  id: spellId,
  kind: 'spell',
  name: 'Moon Spark',
  source: { type: 'homebrew', namespace: 'test' },
  level: 0,
  school: 'evocation',
  castingTime: 'Action',
  range: '60 feet',
  components: { verbal: true, somatic: true, material: false },
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  description: 'Synthetic Homebrew spell used only to prove generic M10 architecture.',
  spellLists: [{ id: 'star-warden', name: 'Star Warden' }],
  mechanics: [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [{ count: 1, die: 8 }], modifier: 'none' }, damageType: 'radiant', scaling: { kind: 'character-level-dice', values: [{ level: 1, dice: [{ count: 1, die: 8 }] }, { level: 5, dice: [{ count: 2, die: 8 }] }] } },
  ],
  referenceEffects: [],
};

const starWarden: SubclassContent = {
  id: subclassId,
  kind: 'subclass',
  name: 'Star Warden',
  source: { type: 'homebrew', namespace: 'test' },
  parentClassId: FIGHTER_ID,
  acquisitionLevel: 3,
  description: 'Synthetic Homebrew spellcasting subclass.',
  progression: [{
    level: 3,
    features: [{
      id: 'homebrew:test:subclass-feature:star-warden:moon-casting',
      name: 'Moon Casting',
      description: 'Synthetic provider grant.',
      effects: [],
      spellcasting: [{
        id: providerId,
        name: 'Moon Casting',
        spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
        multiclassSlotContribution: { kind: 'independent' },
        spellManagement: { kind: 'granted-only', spellIds: [spellId] },
        ritualCasting: 'none',
      }],
      referenceEffects: [],
    }],
  }],
};

describe('Homebrew SpellContent and Spellcasting provider compatibility', () => {
  it('flows through Homebrew storage, registry, subclass acquisition, derivation, and the same Dice Engine without source branches', () => {
    upsertHomebrewContent(moonSpark);
    upsertHomebrewContent(starWarden);
    const stored = loadHomebrewContent();
    expect(stored).toEqual([moonSpark, starWarden]);
    const registry = new ContentRegistry(SRD_CONTENT, stored);
    expect(registry.findSpell(spellId)).toEqual(moonSpark);
    expect(registry.findSubclass(subclassId)).toEqual(starWarden);

    const character = fighterCharacter({ level: 5, subclassId });
    const derived = deriveCharacterState(character, registry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.spellcasting).toMatchObject([{
      id: providerId,
      ability: 'charisma',
      saveDc: 13,
      attackModifier: 5,
      spells: [{ id: spellId, name: 'Moon Spark' }],
    }]);

    const provider = derived.value.spellcasting[0];
    const rolled = rollRequest({
      type: 'attack',
      label: 'Moon Spark — Spell Attack',
      expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: provider.attackModifier },
      mode: 'normal',
      source: { characterId: character.id, spellId, spellcastingProviderId: provider.id, contentId: spellId },
      outcome: { kind: 'attack' },
    }, () => (14 - 1) / 20);
    expect(rolled).toMatchObject({ ok: true, value: { keptD20: 14, modifier: 5, total: 19 } });
  });
});
