import { useState } from 'react';
import { mergeD20RollContexts } from '../dice/diceEngine';
import type { RollMode } from '../dice/types';
import { ABILITY_KEYS, SKILL_IDS, type AbilityKey, type Character, type SkillId } from '../models/character';
import { deriveConditionD20Context, type CharacterConditionId } from '../rules/conditions';
import { coverSavingThrowContext, type CoverLevel } from '../rules/cover';
import { SKILL_DEFINITIONS } from '../rules/skills';
import type { RuleResult } from '../rules/result';
import type { DerivedCharacterState } from '../rules/types';
import {
  rollAbilityCheck,
  rollSavingThrow,
  rollSkillCheck,
  type CharacterRollOutcome,
} from '../services/characterRolls';
import { formatModifier } from '../utils/ability';
import { RollModeControl } from './RollModeControl';

const ABILITY_NAMES: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

const CATEGORIES = ['ability-checks', 'skills', 'saving-throws'] as const;
type CharacterRollCategory = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<CharacterRollCategory, string> = {
  'ability-checks': 'Ability Checks',
  skills: 'Skills',
  'saving-throws': 'Saving Throws',
};

interface CharacterQuickRollProps {
  character: Character;
  state: DerivedCharacterState;
  cover: CoverLevel;
  conditions: readonly CharacterConditionId[];
  activeEffectIds: readonly string[];
  rollMode: RollMode;
  onRollModeChange: (mode: RollMode) => void;
  onRoll: (result: RuleResult<CharacterRollOutcome>) => void;
}

function nextCategory(current: CharacterRollCategory, direction: -1 | 1): CharacterRollCategory {
  const index = CATEGORIES.indexOf(current);
  return CATEGORIES[(index + direction + CATEGORIES.length) % CATEGORIES.length];
}

export function CharacterQuickRoll({
  character,
  state,
  cover,
  conditions,
  activeEffectIds,
  rollMode,
  onRollModeChange,
  onRoll,
}: CharacterQuickRollProps) {
  const [category, setCategory] = useState<CharacterRollCategory>('ability-checks');
  const [selectedAbility, setSelectedAbility] = useState<AbilityKey>('strength');
  const [selectedSkill, setSelectedSkill] = useState<SkillId>('acrobatics');
  const [selectedSave, setSelectedSave] = useState<AbilityKey>('strength');

  const selectedLabel = category === 'ability-checks'
    ? ABILITY_NAMES[selectedAbility]
    : category === 'skills'
      ? SKILL_DEFINITIONS[selectedSkill].name
      : `${ABILITY_NAMES[selectedSave]} Save`;

  const selectedModifier = category === 'ability-checks'
    ? state.abilityModifiers[selectedAbility]
    : category === 'skills'
      ? state.skills[selectedSkill].modifier
      : state.savingThrows[selectedSave].modifier;

  function rollSelected() {
    if (category === 'ability-checks') {
      onRoll(rollAbilityCheck(character.id, selectedAbility, rollMode, {
        d20Context: deriveConditionD20Context(conditions, { kind: 'ability-check' }),
        activeEffectIds,
      }));
      return;
    }
    if (category === 'skills') {
      onRoll(rollSkillCheck(character.id, selectedSkill, rollMode, {
        d20Context: deriveConditionD20Context(conditions, { kind: 'skill-check' }),
        activeEffectIds,
      }));
      return;
    }
    onRoll(rollSavingThrow(character.id, selectedSave, rollMode, {
      d20Context: mergeD20RollContexts(
        coverSavingThrowContext(cover, selectedSave),
        deriveConditionD20Context(conditions, { kind: 'saving-throw', ability: selectedSave }),
      ),
      activeEffectIds,
    }));
  }

  return (
    <section className="play-character-roll panel" aria-labelledby="character-roll-heading">
      <div className="character-roll__category">
        <button
          className="character-roll__category-button"
          type="button"
          aria-label="Previous Character Roll category"
          onClick={() => setCategory(nextCategory(category, -1))}
        >
          ‹
        </button>
        <div>
          <span className="eyebrow">Character Roll</span>
          <h2 id="character-roll-heading">{CATEGORY_LABELS[category]}</h2>
        </div>
        <button
          className="character-roll__category-button"
          type="button"
          aria-label="Next Character Roll category"
          onClick={() => setCategory(nextCategory(category, 1))}
        >
          ›
        </button>
      </div>

      <div className="character-roll__options" role="group" aria-label={CATEGORY_LABELS[category]}>
        {category === 'ability-checks' && ABILITY_KEYS.map((ability) => (
          <button
            key={ability}
            className="character-roll__option"
            type="button"
            aria-pressed={selectedAbility === ability}
            onClick={() => setSelectedAbility(ability)}
          >
            <span>{ABILITY_NAMES[ability]}</span>
            <strong>{formatModifier(state.abilityModifiers[ability])}</strong>
          </button>
        ))}

        {category === 'skills' && SKILL_IDS.map((skillId) => {
          const skill = state.skills[skillId];
          return (
            <button
              key={skillId}
              className="character-roll__option"
              type="button"
              aria-pressed={selectedSkill === skillId}
              onClick={() => setSelectedSkill(skillId)}
            >
              <span>
                <i aria-label={skill.expertise ? 'Expertise' : skill.proficient ? 'Proficient' : 'Not proficient'}>{skill.expertise ? '★' : skill.proficient ? '●' : '○'}</i>
                {SKILL_DEFINITIONS[skillId].name}
              </span>
              <strong>{formatModifier(skill.modifier)}</strong>
            </button>
          );
        })}

        {category === 'saving-throws' && ABILITY_KEYS.map((ability) => {
          const save = state.savingThrows[ability];
          return (
            <button
              key={ability}
              className="character-roll__option"
              type="button"
              aria-pressed={selectedSave === ability}
              onClick={() => setSelectedSave(ability)}
            >
              <span>
                <i aria-label={save.proficient ? 'Proficient' : 'Not proficient'}>{save.proficient ? '●' : '○'}</i>
                {ABILITY_NAMES[ability]} Save
              </span>
              <strong>{formatModifier(save.modifier)}</strong>
            </button>
          );
        })}
      </div>

      <div className="character-roll__footer">
        <div>
          <span className="eyebrow">Selected</span>
          <strong>{selectedLabel} {formatModifier(selectedModifier)}</strong>
        </div>
        <RollModeControl compact ariaLabel="Character roll mode" mode={rollMode} onChange={onRollModeChange} />
        <button className="button button--primary" type="button" onClick={rollSelected}>
          Roll {selectedLabel}
        </button>
      </div>
    </section>
  );
}
