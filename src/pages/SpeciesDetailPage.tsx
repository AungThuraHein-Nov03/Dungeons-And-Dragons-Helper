import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { SKILL_DEFINITIONS } from '../rules/skills';
import { contentRegistry } from '../services/contentRegistry';

export function SpeciesDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findSpecies(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Species not found</h1><Link className="text-link" to="/compendium/species">Back to Species</Link></section>;

  const size = entry.size.kind === 'fixed' ? entry.size.value : entry.size.options.join(' or ');
  return (
    <div className="stack-page">
      <CompendiumNav />
      <header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>{size} · Speed {entry.speedFeet} ft. · {entry.creatureType}</p></div></header>
      <section className="detail-grid">
        <div className="panel detail-card"><span className="eyebrow">Structured Rules</span><h2>Movement & senses</h2><dl className="detail-list"><div><dt>Size</dt><dd>{size}</dd></div><div><dt>Speed</dt><dd>{entry.speedFeet} ft.</dd></div><div><dt>Senses</dt><dd>{entry.senses.length ? entry.senses.map((sense) => `Darkvision ${sense.rangeFeet} ft.`).join(', ') : 'None'}</dd></div>{entry.skillProficiencyChoice && <div><dt>Skill Choice</dt><dd>Choose {entry.skillProficiencyChoice.choose}: {entry.skillProficiencyChoice.from.map((skill) => SKILL_DEFINITIONS[skill].name).join(', ')}</dd></div>}</dl></div>
        <div className="panel detail-card"><span className="eyebrow">Choices</span><h2>Species selections</h2>{entry.choices.length ? entry.choices.map((choice) => <p key={choice.id}><strong>{choice.name}:</strong> {choice.options.map((option) => option.name).join(', ')}</p>) : <p>No additional structured Species selections.</p>}</div>
      </section>
      <section className="panel progression-panel"><div className="section-heading"><span className="eyebrow">Traits</span><h2>Species traits</h2><p>Structured entries affect only the bounded mechanics identified below. Reference-only traits are displayed without automation.</p></div><div className="content-list">{entry.traits.map((trait) => <article className="content-row" key={trait.id}><div><span className="source-badge">{trait.support === 'structured' ? 'Structured' : 'Reference only'}</span><h3>{trait.name}</h3><p>{trait.description}</p></div></article>)}</div></section>
      <Link className="text-link" to="/compendium/species">← Back to Species</Link>
    </div>
  );
}
