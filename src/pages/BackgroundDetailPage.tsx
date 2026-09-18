import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { SKILL_DEFINITIONS } from '../rules/skills';
import { contentRegistry } from '../services/contentRegistry';

export function BackgroundDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findBackground(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Background not found</h1><Link className="text-link" to="/compendium/backgrounds">Back to Backgrounds</Link></section>;
  const tool = entry.toolProficiency.kind === 'fixed' ? entry.toolProficiency.name : `Choose one ${entry.toolProficiency.category}: ${entry.toolProficiency.options.map((option) => option.name).join(', ')}`;
  const originFeat = contentRegistry.findFeat(entry.originFeat.id);
  return (
    <div className="stack-page">
      <CompendiumNav />
      <header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>{entry.description}</p></div></header>
      <section className="detail-grid">
        <div className="panel detail-card"><span className="eyebrow">Ability Scores</span><h2>Origin increases</h2><p>Choose +2 to one and +1 to another, or +1 to all three:</p><strong>{entry.abilityScores.map((ability) => ability[0].toUpperCase() + ability.slice(1)).join(', ')}</strong></div>
        <div className="panel detail-card"><span className="eyebrow">Training</span><h2>Skills & tool</h2><dl className="detail-list"><div><dt>Skills</dt><dd>{entry.skillProficiencies.map((skill) => SKILL_DEFINITIONS[skill].name).join(', ')}</dd></div><div><dt>Tool</dt><dd>{tool}</dd></div></dl></div>
        <div className="panel detail-card"><span className="eyebrow">Origin Feat</span><h2>{entry.originFeat.name}{entry.originFeat.variant ? ` (${entry.originFeat.variant})` : ''}</h2><p>Derived from this Background through the same first-class Feat registry used by manual Feat ownership. Only supported structured effects are automated.</p>{originFeat && <Link className="text-link" to={`/compendium/feats/${encodeURIComponent(originFeat.id)}`}>Open {originFeat.name} feat →</Link>}</div>
      </section>
      <section className="panel progression-panel"><div className="section-heading"><span className="eyebrow">Starting Equipment</span><h2>SRD options</h2></div>{entry.startingEquipment.map((option) => <p key={option.id}><strong>Option {option.id}:</strong> {option.items.length ? option.items.map((item) => `${item.quantity && item.quantity > 1 ? `${item.quantity} ` : ''}${item.label}`).join(', ') : 'No items'}{option.currency ? `${option.items.length ? ', plus ' : ''}${option.currency.amount} ${option.currency.unit.toUpperCase()}` : ''}</p>)}</section>
      <Link className="text-link" to="/compendium/backgrounds">← Back to Backgrounds</Link>
    </div>
  );
}
