import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { SpellContent, SpellMechanic } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';

function levelLabel(spell: SpellContent): string { return spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`; }
function components(spell: SpellContent): string {
  const flags = [spell.components.verbal ? 'V' : '', spell.components.somatic ? 'S' : '', spell.components.material ? 'M' : ''].filter(Boolean);
  return `${flags.join(', ') || 'None'}${spell.components.materialText ? ` · ${spell.components.materialText}` : ''}`;
}
function diceLabel(dice: readonly { count: number; die: number }[]): string { return dice.map((term) => `${term.count}d${term.die}`).join(' + '); }
function mechanicLabel(mechanic: SpellMechanic): string {
  if (mechanic.type === 'spell-attack') return `${mechanic.attackType === 'ranged' ? 'Ranged' : 'Melee'} spell attack using the provider Spell Attack modifier.`;
  if (mechanic.type === 'saving-throw') return `${mechanic.ability[0].toUpperCase() + mechanic.ability.slice(1)} saving throw using the provider Spell Save DC; ${mechanic.onSuccess === 'half' ? 'half effect on a success' : 'no damage on a success'}. Save resolution remains manual.`;
  const base = `${mechanic.type === 'damage' ? 'Damage' : 'Healing'}: ${diceLabel(mechanic.amount.dice)}${mechanic.amount.modifier === 'spellcasting-ability' ? ' + Spellcasting Ability modifier' : ''}${mechanic.type === 'damage' ? ` ${mechanic.damageType}` : ''}.`;
  if (!mechanic.scaling) return base;
  if (mechanic.scaling.kind === 'slot-level-dice') return `${base} Upcasting adds ${diceLabel(mechanic.scaling.dicePerLevel)} per slot level above ${mechanic.scaling.baseSpellLevel}.`;
  return `${base} Character-level scaling: ${mechanic.scaling.values.map((row) => `${row.level}: ${diceLabel(row.dice)}`).join(' · ')}.`;
}

export function SpellDetailPage() {
  const { contentId = '' } = useParams();
  const spell = contentRegistry.findSpell(decodeURIComponent(contentId));
  if (!spell) return <section className="empty-state panel"><h1>Spell not found</h1><Link className="text-link" to="/compendium/spells">Back to Spells</Link></section>;
  return (
    <div className="stack-page">
      <CompendiumNav />
      <header className="content-detail-hero panel"><div><SourceBadge source={spell.source} /><h1>{spell.name}</h1><p>{spell.description}</p></div></header>
      <section className="detail-grid">
        <div className="panel detail-card"><span className="eyebrow">Spell Data</span><h2>Foundation</h2><dl className="detail-list"><div><dt>Level</dt><dd>{levelLabel(spell)}</dd></div><div><dt>School</dt><dd>{spell.school[0].toUpperCase() + spell.school.slice(1)}</dd></div><div><dt>Casting time</dt><dd>{spell.castingTime}</dd></div><div><dt>Range</dt><dd>{spell.range}</dd></div><div><dt>Components</dt><dd>{components(spell)}</dd></div><div><dt>Duration</dt><dd>{spell.duration}</dd></div><div><dt>Concentration</dt><dd>{spell.concentration ? 'Yes · metadata only' : 'No'}</dd></div><div><dt>Ritual</dt><dd>{spell.ritual ? 'Yes' : 'No'}</dd></div>{spell.target && <div><dt>Target / Area</dt><dd>{spell.target}</dd></div>}<div><dt>Spell lists</dt><dd>{spell.spellLists.map((list) => list.name).join(', ')}</dd></div></dl></div>
        <div className="panel detail-card"><span className="eyebrow">Rules Boundary</span><h2>Automation</h2><p>Only the structured mechanics below feed the existing spell rules and Dice Engine. Descriptions, targets, saving-throw outcomes, Concentration, and unsupported riders are never parsed into mechanics.</p></div>
      </section>
      <section className="panel progression-panel"><div className="section-heading"><span className="eyebrow">Structured Mechanics</span><h2>Automated / represented mechanics</h2></div>{spell.mechanics.length ? spell.mechanics.map((mechanic, index) => <div className="feat-detail-choice" key={`${mechanic.type}-${index}`}><strong>{mechanic.type}</strong><p>{mechanicLabel(mechanic)}</p></div>) : <p>No executable structured mechanics. This spell is reference-only in M12A.</p>}</section>
      {spell.higherLevelDescription && <section className="panel detail-card"><span className="eyebrow">Higher Levels</span><h2>Upcasting reference</h2><p>{spell.higherLevelDescription}</p></section>}
      <section className="panel progression-panel"><div className="section-heading"><span className="eyebrow">Reference Only</span><h2>Unsupported mechanics</h2></div>{spell.referenceEffects.length ? spell.referenceEffects.map((effect) => <div className="feat-detail-choice" key={effect.id}><strong>{effect.name}</strong><p>{effect.description}</p></div>) : <p>No additional reference-only rider is recorded for this bounded spell entry.</p>}</section>
      <Link className="text-link" to="/compendium/spells">← Back to Spells</Link>
    </div>
  );
}
