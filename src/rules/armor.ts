import type { Character } from '../models/character';
import type { ArmorContent, CharacterRuleEffect, ClassContent } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { getEquippedBodyArmor, getEquippedShield } from './inventory';
import { ruleOk, type RuleResult } from './result';
import type { DerivedAbilityModifiers, DerivedDefense } from './types';

function armorBaseAc(armor: ArmorContent, dexterityModifier: number): number {
  if (armor.armorClass.kind !== 'armor') return 10 + dexterityModifier;
  if (armor.armorClass.dexterity === 'full') return armor.armorClass.base + dexterityModifier;
  if (armor.armorClass.dexterity === 'capped') return armor.armorClass.base + Math.min(dexterityModifier, armor.armorClass.dexterityCap ?? 0);
  return armor.armorClass.base;
}

export function deriveDefense(character: Character, classContent: ClassContent, registry: ContentRegistry, abilityModifiers: DerivedAbilityModifiers, ruleEffects: readonly CharacterRuleEffect[] = []): RuleResult<DerivedDefense> {
  let armorClass = 10 + abilityModifiers.dexterity;
  let derivedArmor: DerivedDefense['armor'] = null;
  let derivedShield: DerivedDefense['shield'] = null;
  const equippedArmor = getEquippedBodyArmor(character, registry);
  const equippedShield = getEquippedShield(character, registry);

  if (equippedArmor) {
    const { content: armor } = equippedArmor;
    if (armor.category !== 'shield') {
      const armorCategory = armor.category;
      const trained = classContent.armorTraining.includes(armorCategory);
      armorClass = armorBaseAc(armor, abilityModifiers.dexterity) + (armor.armorClassBonus ?? 0);
      derivedArmor = { id: armor.id, name: armor.name, category: armorCategory, trained };
      armorClass += ruleEffects
        .filter((effect): effect is Extract<CharacterRuleEffect, { type: 'armor-class-bonus' }> => effect.type === 'armor-class-bonus' && effect.armorCategories.includes(armorCategory))
        .reduce((total, effect) => total + effect.amount, 0);
    }
  } else {
    for (const formula of ruleEffects.filter((effect): effect is Extract<CharacterRuleEffect, { type: 'unarmored-armor-class' }> => effect.type === 'unarmored-armor-class')) {
      if (equippedShield && !formula.allowShield) continue;
      const candidate = formula.base + formula.abilities.reduce((total, ability) => total + abilityModifiers[ability], 0);
      armorClass = Math.max(armorClass, candidate);
    }
  }

  if (equippedShield) {
    const { content: shield } = equippedShield;
    if (shield.armorClass.kind === 'shield') {
      const trained = classContent.armorTraining.includes('shield');
      const bonusApplied = trained ? shield.armorClass.bonus + (shield.armorClassBonus ?? 0) : 0;
      armorClass += bonusApplied;
      derivedShield = { id: shield.id, name: shield.name, trained, bonusApplied };
    }
  }
  return ruleOk({ armorClass, armor: derivedArmor, shield: derivedShield });
}
