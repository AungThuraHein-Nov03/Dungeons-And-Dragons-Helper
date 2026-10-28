import { LANGUAGE_IDS, LANGUAGE_NAMES, type AbilityKey, type LanguageId, type SkillId } from '../models/character';
import { SKILL_DEFINITIONS } from '../rules/skills';
import {
  FEAT_FORGE_STATIC_EFFECT_TYPES,
  allAbilities,
  allSkills,
  replaceDiceEffectType,
  replaceStaticEffectType,
  toggleAbility,
  toggleSkill,
  type FeatForgeDiceEffectDraft,
  type FeatForgeDiceTransformationType,
  type FeatForgeStaticEffectDraft,
  type FeatForgeStaticEffectType,
} from './featForgeModel';

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

export const STATIC_EFFECT_LABELS: Record<FeatForgeStaticEffectType, string> = {
  'attack-roll-bonus': 'Ranged Attack Roll Bonus',
  'skill-expertise-choice': 'Skill Expertise Choice',
  'language-choice': 'Language Choice',
  'language-grant': 'Fixed Language Grant',
  'armor-class-bonus': 'Armor Class Bonus',
  'skill-check-advantage': 'Skill Check Advantage',
  'saving-throw-roll-mode': 'Saving Throw Roll Mode',
  'saving-throw-proficiency': 'Saving Throw Proficiency',
  'initiative-modifier': 'Initiative Modifier',
  'initiative-proficiency': 'Initiative Proficiency',
  'initiative-half-proficiency': 'Initiative Half Proficiency',
  'initiative-roll-mode': 'Initiative Roll Mode',
  'hit-point-bonus-per-class-level': 'HP Bonus per Class Level',
  'speed-bonus': 'Speed Bonus',
  'critical-threshold': 'Weapon Critical Threshold',
  'unarmored-armor-class': 'Unarmored Armor Class',
};

export const DICE_TRANSFORMATION_LABELS: Record<FeatForgeDiceTransformationType, string> = {
  'reroll-once-use-new': 'Reroll D20 Once, Use New Result',
  'minimum-die-face': 'Minimum Weapon Damage Die Face',
};

function AbilityChecks({
  values,
  onChange,
  label,
}: {
  values: readonly AbilityKey[];
  onChange: (values: AbilityKey[]) => void;
  label: string;
}) {
  return (
    <fieldset className="forge-check-group">
      <legend>{label}</legend>
      <div className="forge-check-grid">
        {allAbilities().map((ability) => (
          <label className="forge-check" key={ability}>
            <input
              type="checkbox"
              checked={values.includes(ability)}
              onChange={() => onChange(toggleAbility(values, ability))}
            />
            <span>{ABILITY_LABELS[ability]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SkillChecks({
  values,
  onChange,
}: {
  values: readonly SkillId[];
  onChange: (values: SkillId[]) => void;
}) {
  return (
    <fieldset className="forge-check-group">
      <legend>Skills</legend>
      <div className="forge-check-grid forge-check-grid--skills">
        {allSkills().map((skill) => (
          <label className="forge-check" key={skill}>
            <input
              type="checkbox"
              checked={values.includes(skill)}
              onChange={() => onChange(toggleSkill(values, skill))}
            />
            <span>{SKILL_DEFINITIONS[skill].name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ArmorChecks({
  values,
  onChange,
  label,
}: {
  values: readonly ('light' | 'medium' | 'heavy')[];
  onChange: (values: ('light' | 'medium' | 'heavy')[]) => void;
  label: string;
}) {
  const categories = ['light', 'medium', 'heavy'] as const;
  return (
    <fieldset className="forge-check-group">
      <legend>{label}</legend>
      <div className="forge-check-grid">
        {categories.map((category) => (
          <label className="forge-check" key={category}>
            <input
              type="checkbox"
              checked={values.includes(category)}
              onChange={() => onChange(values.includes(category)
                ? values.filter((candidate) => candidate !== category)
                : [...values, category])}
            />
            <span>{category[0].toUpperCase() + category.slice(1)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FeatForgeStaticEffectEditor({
  entry,
  onChange,
  onRemove,
}: {
  entry: FeatForgeStaticEffectDraft;
  onChange: (entry: FeatForgeStaticEffectDraft) => void;
  onRemove: () => void;
}) {
  const effect = entry.effect;
  const setEffect = (next: FeatForgeStaticEffectDraft['effect']) => onChange({ ...entry, effect: next });

  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <label className="field">
          <span>Automated effect type</span>
          <select
            aria-label="Automated effect type"
            value={effect.type}
            onChange={(event) => onChange(replaceStaticEffectType(entry, event.target.value as FeatForgeStaticEffectType))}
          >
            {FEAT_FORGE_STATIC_EFFECT_TYPES.map((type) => (
              <option key={type} value={type}>{STATIC_EFFECT_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <button className="button button--secondary" type="button" onClick={onRemove}>Remove effect</button>
      </div>

      {effect.type === 'attack-roll-bonus' && (
        <div className="field-grid field-grid--two">
          <label className="field">
            <span>Weapon mode</span>
            <select value="ranged" disabled><option value="ranged">Ranged</option></select>
          </label>
          <label className="field">
            <span>Attack roll bonus</span>
            <input type="number" step="1" value={effect.amount} onChange={(event) => setEffect({ ...effect, amount: Number(event.target.value) })} />
          </label>
        </div>
      )}

      {effect.type === 'skill-expertise-choice' && (
        <div className="field-grid field-grid--two">
          <label className="field">
            <span>Expertise choices</span>
            <input min="1" type="number" step="1" value={effect.choose} onChange={(event) => setEffect({ ...effect, choose: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Eligibility</span>
            <select value={effect.eligibility} onChange={(event) => setEffect({ ...effect, eligibility: event.target.value as 'proficient-skills' | 'proficient-class-skills' })}>
              <option value="proficient-skills">Proficient skills</option>
              <option value="proficient-class-skills">Proficient class skills</option>
            </select>
          </label>
        </div>
      )}

      {effect.type === 'language-choice' && (
        <label className="field forge-field-small">
          <span>Language choices</span>
          <input min="1" type="number" step="1" value={effect.choose} onChange={(event) => setEffect({ ...effect, choose: Number(event.target.value) })} />
        </label>
      )}

      {effect.type === 'language-grant' && (
        <label className="field forge-field-small">
          <span>Granted language</span>
          <select value={effect.languageId} onChange={(event) => setEffect({ ...effect, languageId: event.target.value as LanguageId })}>
            {LANGUAGE_IDS.map((language) => <option value={language} key={language}>{LANGUAGE_NAMES[language]}</option>)}
          </select>
        </label>
      )}

      {effect.type === 'armor-class-bonus' && (
        <>
          <ArmorChecks
            label="Armor categories"
            values={effect.armorCategories}
            onChange={(armorCategories) => setEffect({ ...effect, armorCategories })}
          />
          <label className="field forge-field-small">
            <span>Armor Class bonus</span>
            <input type="number" step="1" value={effect.amount} onChange={(event) => setEffect({ ...effect, amount: Number(event.target.value) })} />
          </label>
        </>
      )}

      {effect.type === 'skill-check-advantage' && (
        <SkillChecks values={effect.skillIds} onChange={(skillIds) => setEffect({ ...effect, skillIds })} />
      )}

      {effect.type === 'saving-throw-roll-mode' && (
        <>
          <AbilityChecks values={effect.abilities} onChange={(abilities) => setEffect({ ...effect, abilities })} label="Saving throw abilities" />
          <label className="field forge-field-small">
            <span>Roll mode</span>
            <select value={effect.mode} onChange={(event) => setEffect({ ...effect, mode: event.target.value as 'advantage' | 'disadvantage' })}>
              <option value="advantage">Advantage</option>
              <option value="disadvantage">Disadvantage</option>
            </select>
          </label>
        </>
      )}

      {effect.type === 'saving-throw-proficiency' && (
        <AbilityChecks values={effect.abilities} onChange={(abilities) => setEffect({ ...effect, abilities })} label="Saving throw proficiencies" />
      )}

      {effect.type === 'initiative-modifier' && (
        <label className="field forge-field-small">
          <span>Initiative modifier</span>
          <input type="number" step="1" value={effect.amount} onChange={(event) => setEffect({ ...effect, amount: Number(event.target.value) })} />
        </label>
      )}

      {effect.type === 'initiative-proficiency' && <p className="field-hint">Adds the full Proficiency Bonus to Initiative through the existing Initiative rules.</p>}
      {effect.type === 'initiative-half-proficiency' && <p className="field-hint">Adds half Proficiency Bonus to Initiative when the existing rules determine it applies.</p>}

      {effect.type === 'initiative-roll-mode' && (
        <label className="field forge-field-small">
          <span>Initiative roll mode</span>
          <select value={effect.mode} onChange={(event) => setEffect({ ...effect, mode: event.target.value as 'advantage' | 'disadvantage' })}>
            <option value="advantage">Advantage</option>
            <option value="disadvantage">Disadvantage</option>
          </select>
        </label>
      )}

      {effect.type === 'hit-point-bonus-per-class-level' && (
        <label className="field forge-field-small">
          <span>HP bonus per class level</span>
          <input min="1" type="number" step="1" value={effect.amount} onChange={(event) => setEffect({ ...effect, amount: Number(event.target.value) })} />
        </label>
      )}

      {effect.type === 'speed-bonus' && (
        <>
          <div className="field-grid field-grid--two">
            <label className="field">
              <span>Speed bonus progression</span>
              <select
                value={effect.amount.kind}
                onChange={(event) => setEffect({
                  ...effect,
                  amount: event.target.value === 'fixed'
                    ? { kind: 'fixed', amount: 5 }
                    : { kind: 'level-table', values: [{ level: 1, amount: 5 }] },
                })}
              >
                <option value="fixed">Fixed</option>
                <option value="level-table">Level table</option>
              </select>
            </label>
            {effect.amount.kind === 'fixed' && (
              <label className="field">
                <span>Speed bonus (feet)</span>
                <input type="number" step="1" value={effect.amount.amount} onChange={(event) => setEffect({ ...effect, amount: { kind: 'fixed', amount: Number(event.target.value) } })} />
              </label>
            )}
          </div>
          {effect.amount.kind === 'level-table' && (
            <div className="forge-level-table">
              {effect.amount.values.map((row, index) => (
                <div className="forge-level-table__row" key={index}>
                  <label className="field">
                    <span>Level</span>
                    <input
                      min="1"
                      max="20"
                      type="number"
                      step="1"
                      value={row.level}
                      onChange={(event) => setEffect({
                        ...effect,
                        amount: {
                          kind: 'level-table',
                          values: effect.amount.kind === 'level-table'
                            ? effect.amount.values.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, level: Number(event.target.value) } : candidate)
                            : [],
                        },
                      })}
                    />
                  </label>
                  <label className="field">
                    <span>Bonus (feet)</span>
                    <input
                      type="number"
                      step="1"
                      value={row.amount}
                      onChange={(event) => setEffect({
                        ...effect,
                        amount: {
                          kind: 'level-table',
                          values: effect.amount.kind === 'level-table'
                            ? effect.amount.values.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, amount: Number(event.target.value) } : candidate)
                            : [],
                        },
                      })}
                    />
                  </label>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setEffect({
                      ...effect,
                      amount: {
                        kind: 'level-table',
                        values: effect.amount.kind === 'level-table' ? effect.amount.values.filter((_, candidateIndex) => candidateIndex !== index) : [],
                      },
                    })}
                  >
                    Remove row
                  </button>
                </div>
              ))}
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  const values = effect.amount.kind === 'level-table' ? effect.amount.values : [];
                  const lastLevel = values.at(-1)?.level ?? 0;
                  setEffect({ ...effect, amount: { kind: 'level-table', values: [...values, { level: Math.min(20, lastLevel + 1), amount: 5 }] } });
                }}
              >
                Add level row
              </button>
            </div>
          )}
          <ArmorChecks
            label="Speed bonus blocked by armor"
            values={effect.disallowedArmorCategories ?? []}
            onChange={(disallowedArmorCategories) => setEffect({ ...effect, disallowedArmorCategories })}
          />
          <label className="forge-check forge-check--standalone">
            <input type="checkbox" checked={effect.requireNoShield ?? false} onChange={(event) => setEffect({ ...effect, requireNoShield: event.target.checked })} />
            <span>Require no shield</span>
          </label>
        </>
      )}

      {effect.type === 'critical-threshold' && (
        <label className="field forge-field-small">
          <span>Minimum natural roll for weapon critical</span>
          <input min="2" max="20" type="number" step="1" value={effect.minimumNatural} onChange={(event) => setEffect({ ...effect, minimumNatural: Number(event.target.value) })} />
        </label>
      )}

      {effect.type === 'unarmored-armor-class' && (
        <>
          <div className="field-grid field-grid--two">
            <label className="field">
              <span>Base Armor Class</span>
              <input min="0" type="number" step="1" value={effect.base} onChange={(event) => setEffect({ ...effect, base: Number(event.target.value) })} />
            </label>
            <label className="forge-check forge-check--standalone forge-check--aligned">
              <input type="checkbox" checked={effect.allowShield} onChange={(event) => setEffect({ ...effect, allowShield: event.target.checked })} />
              <span>Allow shield</span>
            </label>
          </div>
          <AbilityChecks values={effect.abilities} onChange={(abilities) => setEffect({ ...effect, abilities })} label="Ability modifiers added to AC" />
        </>
      )}
    </article>
  );
}

export function FeatForgeDiceEffectEditor({
  entry,
  onChange,
  onRemove,
}: {
  entry: FeatForgeDiceEffectDraft;
  onChange: (entry: FeatForgeDiceEffectDraft) => void;
  onRemove: () => void;
}) {
  const effect = entry.effect;
  const transformation = effect.transformation;
  const setEffect = (next: FeatForgeDiceEffectDraft['effect']) => onChange({ ...entry, effect: next });

  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <label className="field">
          <span>Dice transformation</span>
          <select
            aria-label="Dice transformation type"
            value={transformation.type}
            onChange={(event) => onChange(replaceDiceEffectType(entry, event.target.value as FeatForgeDiceTransformationType))}
          >
            {Object.entries(DICE_TRANSFORMATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="button button--secondary" type="button" onClick={onRemove}>Remove transformation</button>
      </div>

      <label className="forge-check forge-check--standalone">
        <input type="checkbox" checked={effect.optional} onChange={(event) => setEffect({ ...effect, optional: event.target.checked })} />
        <span>Optional transformation</span>
      </label>

      {transformation.type === 'reroll-once-use-new' && (
        <>
          <label className="field forge-field-small">
            <span>Roll scope</span>
            <select
              value={effect.target.kind === 'skill-check' ? 'skill-check' : 'd20-test'}
              onChange={(event) => setEffect({
                ...effect,
                target: event.target.value === 'skill-check'
                  ? { kind: 'skill-check', requireProficiency: false }
                  : { kind: 'd20-test' },
              })}
            >
              <option value="d20-test">Any D20 Test</option>
              <option value="skill-check">Skill Check</option>
            </select>
          </label>
          {effect.target.kind === 'skill-check' && (
            <label className="forge-check forge-check--standalone">
              <input
                type="checkbox"
                checked={effect.target.requireProficiency}
                onChange={(event) => setEffect({ ...effect, target: { kind: 'skill-check', requireProficiency: event.target.checked } })}
              />
              <span>Require proficiency in the skill</span>
            </label>
          )}
          <fieldset className="forge-check-group">
            <legend>Qualifying d20 faces</legend>
            <div className="forge-face-grid">
              {Array.from({ length: 20 }, (_, index) => index + 1).map((face) => (
                <label className="forge-check" key={face}>
                  <input
                    type="checkbox"
                    checked={transformation.qualifyingFaces.includes(face)}
                    onChange={() => {
                      const faces = transformation.qualifyingFaces.includes(face)
                        ? transformation.qualifyingFaces.filter((candidate) => candidate !== face)
                        : [...transformation.qualifyingFaces, face].sort((left, right) => left - right);
                      setEffect({ ...effect, transformation: { ...transformation, qualifyingFaces: faces } });
                    }}
                  />
                  <span>{face}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {transformation.type === 'minimum-die-face' && effect.target.kind === 'weapon-damage' && (
        <>
          <label className="field forge-field-small">
            <span>Minimum die face</span>
            <input
              min="1"
              max="12"
              type="number"
              step="1"
              value={transformation.minimum}
              onChange={(event) => setEffect({ ...effect, transformation: { ...transformation, minimum: Number(event.target.value) } })}
            />
          </label>
          <fieldset className="forge-check-group">
            <legend>Qualifying melee weapon properties</legend>
            <div className="forge-check-grid">
              {(['two-handed', 'versatile'] as const).map((property) => (
                <label className="forge-check" key={property}>
                  <input
                    type="checkbox"
                    checked={effect.target.kind === 'weapon-damage' && effect.target.anyWeaponProperties.includes(property)}
                    onChange={() => {
                      if (effect.target.kind !== 'weapon-damage') return;
                      const properties = effect.target.anyWeaponProperties.includes(property)
                        ? effect.target.anyWeaponProperties.filter((candidate) => candidate !== property)
                        : [...effect.target.anyWeaponProperties, property];
                      setEffect({ ...effect, target: { ...effect.target, anyWeaponProperties: properties } });
                    }}
                  />
                  <span>{property === 'two-handed' ? 'Two-Handed' : 'Versatile'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="field-hint">This bounded transformation applies only to melee weapon damage while held with two hands, matching the existing runtime contract.</p>
        </>
      )}
    </article>
  );
}
