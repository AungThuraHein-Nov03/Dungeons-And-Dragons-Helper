import { describe, expect, it } from 'vitest';
import { SRD_CLASSES, SRD_FEATS, SRD_SPELLS } from './index';
import { SRD_EVOKER, SRD_SUBCLASSES } from './subclasses';
import { srdId } from './source';
import { SRD_WIZARD, WIZARD_SPELLCASTING_PROVIDER_ID } from './wizard';

describe('Milestone 12E SRD Wizard expansion', () => {
  it('bundles exactly the approved twelve Classes and twelve Subclasses without changing spells or Feats', () => {
    expect(SRD_CLASSES.map((entry) => entry.name)).toEqual([
      'Fighter', 'Barbarian', 'Cleric', 'Rogue', 'Bard', 'Paladin', 'Ranger', 'Druid', 'Monk', 'Sorcerer', 'Warlock', 'Wizard',
    ]);
    expect(SRD_SUBCLASSES.map((entry) => entry.name)).toEqual([
      'Champion', 'Path of the Berserker', 'Life Domain', 'Thief', 'College of Lore', 'Oath of Devotion', 'Hunter', 'Circle of the Land', 'Warrior of the Open Hand', 'Draconic Sorcery', 'Fiend Patron', 'Evoker',
    ]);
    expect(new Set(SRD_CLASSES.map((entry) => entry.id)).size).toBe(12);
    expect(new Set(SRD_SUBCLASSES.map((entry) => entry.id)).size).toBe(12);
    expect(SRD_SPELLS).toHaveLength(339);
    expect(SRD_FEATS).toHaveLength(17);
  });

  it('models the authoritative bounded Wizard chassis and progression', () => {
    expect(SRD_WIZARD.id).toBe(srdId('class', 'wizard'));
    expect(SRD_WIZARD.hitDie).toBe(6);
    expect(SRD_WIZARD.fixedHitPointsPerLevel).toBe(4);
    expect(SRD_WIZARD.primaryAbility).toEqual({ mode: 'one-of', abilities: ['intelligence'] });
    expect(SRD_WIZARD.savingThrowProficiencies).toEqual(['intelligence', 'wisdom']);
    expect(SRD_WIZARD.weaponProficiencies).toEqual([{ kind: 'category', category: 'simple' }]);
    expect(SRD_WIZARD.armorTraining).toEqual([]);
    expect(SRD_WIZARD.toolProficiencies).toEqual([]);
    expect(SRD_WIZARD.skillChoices).toEqual({ choose: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'] });
    expect(SRD_WIZARD.startingEquipment).toEqual([
      {
        id: 'A',
        items: [
          { label: 'Dagger', quantity: 2, contentId: srdId('weapon', 'dagger') },
          { label: 'Arcane Focus (Quarterstaff)', contentId: srdId('weapon', 'quarterstaff') },
          { label: 'Robe', inventoryCategory: 'adventuring-gear' },
          { label: 'Spellbook', inventoryCategory: 'adventuring-gear' },
          { label: 'Scholar’s Pack', inventoryCategory: 'adventuring-gear' },
        ],
        currency: { amount: 5, unit: 'gp' },
      },
      { id: 'B', items: [], currency: { amount: 55, unit: 'gp' } },
    ]);
    expect(SRD_WIZARD.progression).toHaveLength(20);
    expect(SRD_WIZARD.progression.map((row) => row.level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(SRD_WIZARD.progression.map((row) => row.proficiencyBonus)).toEqual([2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6]);
    expect(SRD_WIZARD.progression[0].features.map((feature) => feature.name)).toEqual(['Spellcasting', 'Ritual Adept', 'Arcane Recovery']);
    expect(SRD_WIZARD.progression[4].features.map((feature) => feature.name)).toEqual(['Memorize Spell']);
    expect(SRD_WIZARD.progression[17].features.map((feature) => feature.name)).toEqual(['Spell Mastery']);
    expect(SRD_WIZARD.progression[19].features.map((feature) => feature.name)).toEqual(['Signature Spells']);
  });

  it('uses one generic prepared-from-owned Intelligence provider with owned Ritual policy and full-caster slots', () => {
    const provider = SRD_WIZARD.progression[0].features.find((feature) => feature.name === 'Spellcasting')?.spellcasting?.[0];
    expect(provider?.id).toBe(WIZARD_SPELLCASTING_PROVIDER_ID);
    expect(provider?.spellcastingAbility).toEqual({ kind: 'fixed', ability: 'intelligence' });
    expect(provider?.ritualCasting).toBe('owned');
    expect(provider?.spellManagement).toMatchObject({
      kind: 'prepared-from-owned',
      spellListId: 'wizard',
      replacement: 'long-rest-any',
      initialOwnedSpellCount: 6,
      initialOwnedSpellLevel: 1,
    });
    if (!provider || provider.spellManagement.kind !== 'prepared-from-owned' || !provider.slotPool) throw new Error('Wizard prepared-from-owned provider missing.');

    expect(provider.spellManagement.cantripCount.map((row) => row.count)).toEqual([3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]);
    expect(provider.spellManagement.preparedSpellCount.map((row) => row.count)).toEqual([4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25]);
    expect(provider.slotPool.slotLevels.map((slot) => slot.spellLevel)).toEqual([1,2,3,4,5,6,7,8,9]);
    expect(provider.slotPool.progression).toHaveLength(20);
    expect(provider.slotPool.recovery).toEqual([{ trigger: 'long-rest', mode: 'all' }]);
    expect(provider.slotPool.progression.map((row) => Math.max(...row.slots.map((slot) => slot.spellLevel)))).toEqual([1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9]);
    expect(provider.slotPool.progression[0].slots).toEqual([{ spellLevel: 1, maximum: 2 }]);
    expect(provider.slotPool.progression[4].slots).toEqual([{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 2 }]);
    expect(provider.slotPool.progression[16].slots).toEqual([
      { spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 },
      { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }, { spellLevel: 7, maximum: 1 }, { spellLevel: 8, maximum: 1 }, { spellLevel: 9, maximum: 1 },
    ]);
    expect(provider.slotPool.progression[19].slots).toEqual([
      { spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 },
      { spellLevel: 5, maximum: 3 }, { spellLevel: 6, maximum: 2 }, { spellLevel: 7, maximum: 2 }, { spellLevel: 8, maximum: 1 }, { spellLevel: 9, maximum: 1 },
    ]);
  });

  it('keeps advanced Wizard transactions bounded while Arcane Recovery uses the generic M13C transaction shape', () => {
    const features = SRD_WIZARD.progression.flatMap((row) => row.features);
    const arcaneRecovery = features.find((candidate) => candidate.name === 'Arcane Recovery');
    expect(arcaneRecovery?.effects).toEqual([]);
    expect(arcaneRecovery?.resourceConsumers).toBeUndefined();
    expect(arcaneRecovery?.resources).toHaveLength(1);
    expect(arcaneRecovery?.resourceTransactions).toMatchObject([{ kind: 'restore-spell-slots-with-budget', budget: { kind: 'half-level-round-up' }, maximumSpellLevel: 5, timing: 'short-rest' }]);
    const scholar = features.find((candidate) => candidate.name === 'Scholar');
    expect(scholar).toBeDefined();
    expect(scholar?.effects).toEqual([{
      type: 'skill-expertise-choice',
      choose: 1,
      eligibility: 'proficient-class-skills',
    }]);
    expect(scholar?.resourceConsumers).toBeUndefined();
    expect(scholar?.resourceTransactions).toBeUndefined();
    expect(scholar?.referenceEffects).toEqual([]);

    for (const name of ['Memorize Spell', 'Spell Mastery', 'Signature Spells']) {
      const feature = features.find((candidate) => candidate.name === name);
      expect(feature).toBeDefined();
      expect(feature?.effects).toEqual([]);
      expect(feature?.resourceConsumers).toBeUndefined();
      expect(feature?.resourceTransactions).toBeUndefined();
      expect(feature?.referenceEffects.length).toBeGreaterThan(0);
    }
  });

  it('models Evoker at levels 3, 6, 10, and 14 without runtime event machinery', () => {
    expect(SRD_EVOKER.parentClassId).toBe(SRD_WIZARD.id);
    expect(SRD_EVOKER.progression.map((row) => row.level)).toEqual([3, 6, 10, 14]);
    expect(SRD_EVOKER.progression.flatMap((row) => row.features).map((feature) => feature.name)).toEqual([
      'Evocation Savant', 'Potent Cantrip', 'Sculpt Spells', 'Empowered Evocation', 'Overchannel',
    ]);
    for (const feature of SRD_EVOKER.progression.flatMap((row) => row.features)) {
      expect(feature.effects).toEqual([]);
      expect(feature.spellcasting).toBeUndefined();
      expect(feature.resourceConsumers).toBeUndefined();
      expect(feature.referenceEffects.length).toBeGreaterThan(0);
    }
    expect(SRD_EVOKER.progression.flatMap((row) => row.features).some((feature) => feature.referenceEffects.some((effect) => /target|saving|damage|event|reference-only/i.test(effect.description)))).toBe(true);
  });
});
