import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { CharacterRuleEffect } from '../models/content';
import { SKILL_DEFINITIONS } from '../rules/skills';
import { contentRegistry } from '../services/contentRegistry';

function formatEffect(effect: CharacterRuleEffect): string {
  if (effect.type === 'attack-roll-bonus') return `+${effect.amount} to ${effect.weaponMode} weapon attack rolls.`;
  if (effect.type === 'armor-class-bonus') return `+${effect.amount} Armor Class while wearing ${effect.armorCategories.join(', ')} armor.`;
  if (effect.type === 'skill-check-advantage') return `Advantage on ${effect.skillIds.map((skillId) => SKILL_DEFINITIONS[skillId].name).join(', ')} checks.`;
  if (effect.type === 'saving-throw-roll-mode') return `${effect.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} on ${effect.abilities.join(', ')} saving throws.`;
  if (effect.type === 'saving-throw-proficiency') return `Saving throw proficiency: ${effect.abilities.join(', ')}.`;
  if (effect.type === 'initiative-modifier') return `${effect.amount >= 0 ? '+' : ''}${effect.amount} to Initiative.`;
  if (effect.type === 'initiative-proficiency') return 'Add Proficiency Bonus to Initiative.';
  if (effect.type === 'initiative-half-proficiency') return 'Add half Proficiency Bonus to Initiative when not already proficient.';
  if (effect.type === 'initiative-roll-mode') return `${effect.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} on Initiative.`;
  if (effect.type === 'hit-point-bonus-per-class-level') return `+${effect.amount} maximum HP per class level.`;
  if (effect.type === 'speed-bonus') return 'Conditional Speed bonus.';
  if (effect.type === 'critical-threshold') return `Weapon Critical Hit threshold: ${effect.minimumNatural}–20.`;
  if (effect.type === 'dice-transformation') return effect.transformation.type === 'reroll-once-use-new'
    ? `Reroll qualifying d${effect.transformation.die} results once; use the new roll.`
    : `Minimum qualifying weapon damage die face ${effect.transformation.minimum}.`;
  return `Unarmored Armor Class ${effect.base} + ${effect.abilities.join(' + ')}${effect.allowShield ? '; shield allowed' : ''}.`;
}

export function SubclassDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findSubclass(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Subclass not found</h1><Link className="text-link" to="/compendium/subclasses">Back to Subclasses</Link></section>;
  const parent = contentRegistry.findClass(entry.parentClassId);

  return (
    <div className="stack-page">
      <CompendiumNav />
      <header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>{entry.description}</p></div></header>
      <section className="detail-grid">
        <div className="panel detail-card"><span className="eyebrow">Subclass Data</span><h2>Foundation</h2><dl className="detail-list"><div><dt>Parent class</dt><dd>{parent ? <Link className="text-link" to={`/compendium/classes/${encodeURIComponent(parent.id)}`}>{parent.name}</Link> : entry.parentClassId}</dd></div><div><dt>Acquisition level</dt><dd>Level {entry.acquisitionLevel}</dd></div></dl></div>
        <div className="panel detail-card"><span className="eyebrow">Rules Boundary</span><h2>Mechanics</h2><p>Structured effects are applied only after their feature level is acquired. Unsupported mechanics remain explicit reference-only metadata.</p></div>
      </section>
      <section className="panel progression-panel"><div className="section-heading"><span className="eyebrow">Progression</span><h2>{entry.name} features</h2></div>{entry.progression.map((row) => <div className="feat-detail-choice" key={row.level}><strong>Level {row.level}</strong>{row.features.map((feature) => <div key={feature.id}><h3>{feature.name}</h3><p>{feature.description}</p><p><strong>Automated structured effects:</strong> {feature.effects.length ? feature.effects.map(formatEffect).join(' ') : 'None.'}</p>{feature.spellGrants?.length ? <p><strong>Fixed spell grants:</strong> {feature.spellGrants.flatMap((grant) => grant.spellIds.map((spellId) => `${contentRegistry.findSpell(spellId)?.name ?? spellId}${grant.minimumLevel ? ` (level ${grant.minimumLevel})` : ''}`)).join(', ')}</p> : null}<p><strong>Reference-only effects:</strong> {feature.referenceEffects.length ? feature.referenceEffects.map((effect) => `${effect.name}: ${effect.description}`).join(' ') : 'None.'}</p></div>)}</div>)}</section>
      <Link className="text-link" to="/compendium/subclasses">← Back to Subclasses</Link>
    </div>
  );
}
