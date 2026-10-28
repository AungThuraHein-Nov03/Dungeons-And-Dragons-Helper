import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { LANGUAGE_NAMES, type AbilityKey } from '../models/character';
import type { FeatEffect, FeatPrerequisite } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};

function formatPrerequisite(prerequisite: FeatPrerequisite): string {
  if (prerequisite.type === 'level') return `Level ${prerequisite.minimum}+`;
  if (prerequisite.type === 'ability-minimum') return `${prerequisite.abilities.map((ability) => ABILITY_LABELS[ability]).join(' or ')} ${prerequisite.minimum}+`;
  return `${prerequisite.name} · reference-only prerequisite (not automatically evaluated)`;
}

function formatEffect(effect: FeatEffect): string {
  if (effect.type === 'ability-score-increase') return `Ability score increase: ${effect.selections === 2 ? 'two selections' : 'one selection'} from ${effect.allowedAbilities.map((ability) => ABILITY_LABELS[ability]).join(', ')}, +${effect.amountPerSelection} each, maximum ${effect.maximum}${effect.allowDuplicateSelection ? ', duplicate selection allowed' : ''}.`;
  if (effect.type === 'attack-roll-bonus') return `+${effect.amount} to attack rolls with ${effect.weaponMode} weapons.`;
  if (effect.type === 'skill-expertise-choice') return `Choose ${effect.choose} Expertise skill${effect.choose === 1 ? '' : 's'} from ${effect.eligibility === 'proficient-skills' ? 'proficient skills' : 'proficient class skills'}.`;
  if (effect.type === 'language-choice') return `Choose ${effect.choose} additional language${effect.choose === 1 ? '' : 's'}.`;
  if (effect.type === 'language-grant') return `Language: ${LANGUAGE_NAMES[effect.languageId]}.`;
  if (effect.type === 'armor-class-bonus') return `+${effect.amount} Armor Class while wearing ${effect.armorCategories.join(', ')} armor.`;
  if (effect.type === 'skill-check-advantage') return `Advantage on ${effect.skillIds.join(', ')} checks.`;
  if (effect.type === 'saving-throw-roll-mode') return `${effect.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} on ${effect.abilities.map((ability) => ABILITY_LABELS[ability]).join(', ')} saving throws.`;
  if (effect.type === 'saving-throw-proficiency') return `Saving throw proficiency: ${effect.abilities.map((ability) => ABILITY_LABELS[ability]).join(', ')}.`;
  if (effect.type === 'initiative-modifier') return `${effect.amount >= 0 ? '+' : ''}${effect.amount} to Initiative.`;
  if (effect.type === 'initiative-proficiency') return 'Add Proficiency Bonus to Initiative.';
  if (effect.type === 'initiative-half-proficiency') return 'Add half Proficiency Bonus to Initiative when not already proficient.';
  if (effect.type === 'initiative-roll-mode') return `${effect.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} on Initiative.`;
  if (effect.type === 'hit-point-bonus-per-class-level') return `+${effect.amount} maximum Hit Point${effect.amount === 1 ? '' : 's'} per class level.`;
  if (effect.type === 'speed-bonus') return 'Conditional Speed bonus.';
  if (effect.type === 'critical-threshold') return `Weapon Critical Hit threshold: ${effect.minimumNatural}–20.`;
  if (effect.type === 'dice-transformation') return effect.transformation.type === 'reroll-once-use-new'
    ? `Reroll qualifying d${effect.transformation.die} results once and use the new roll.`
    : `Treat qualifying weapon damage dice below ${effect.transformation.minimum} as ${effect.transformation.minimum}.`;
  return `Unarmored Armor Class ${effect.base} plus ${effect.abilities.map((ability) => ABILITY_LABELS[ability]).join(' and ')} modifiers${effect.allowShield ? '; shield allowed' : ''}.`;
}

export function FeatDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findFeat(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Feat not found</h1><Link className="text-link" to="/compendium/feats">Back to Feats</Link></section>;

  return (
    <div className="stack-page">
      <CompendiumNav />
      <header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>{entry.description}</p></div></header>
      <section className="detail-grid">
        <div className="panel detail-card"><span className="eyebrow">Feat Data</span><h2>{entry.category}</h2><dl className="detail-list"><div><dt>Category</dt><dd>{entry.category}</dd></div><div><dt>Repeatable</dt><dd>{entry.repeatable ? 'Yes' : 'No'}{entry.repeatabilityNote ? ` · ${entry.repeatabilityNote}` : ''}</dd></div><div><dt>Prerequisites</dt><dd>{entry.prerequisites.length ? entry.prerequisites.map(formatPrerequisite).join('; ') : 'None'}</dd></div></dl></div>
        <div className="panel detail-card"><span className="eyebrow">Choices</span><h2>Feat selections</h2>{entry.choices.length ? entry.choices.map((choice) => <div className="feat-detail-choice" key={choice.id}><strong>{choice.name}</strong><span className="source-badge">{choice.support === 'structured' ? 'Structured' : 'Reference only'}</span><p>{choice.description}</p>{choice.options && <small>Options: {choice.options.map((option) => option.name).join(', ')}</small>}</div>) : <p>No feat-specific choices.</p>}</div>
      </section>
      <section className="detail-grid">
        <div className="panel detail-card"><span className="eyebrow">Automated</span><h2>Structured effects</h2>{entry.effects.length ? entry.effects.map((effect, index) => <p key={index}>{formatEffect(effect)}</p>) : <p>No automated structured effects in Milestone 8.</p>}</div>
        <div className="panel detail-card"><span className="eyebrow">Reference Only</span><h2>Unsupported mechanics</h2>{entry.referenceEffects.length ? entry.referenceEffects.map((effect) => <div className="feat-detail-choice" key={effect.id}><strong>{effect.name}</strong><p>{effect.description}</p></div>) : <p>No additional reference-only effect metadata.</p>}</div>
      </section>
      <Link className="text-link" to="/compendium/feats">← Back to Feats</Link>
    </div>
  );
}
