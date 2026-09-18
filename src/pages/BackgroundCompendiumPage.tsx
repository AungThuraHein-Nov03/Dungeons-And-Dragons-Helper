import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';

export function BackgroundCompendiumPage() {
  const backgrounds = contentRegistry.getAll('background');
  return (
    <div className="stack-page">
      <header className="page-heading"><span className="eyebrow">Compendium</span><h1>Backgrounds</h1><p>Structured SRD Background ability options, skills, tools, Origin Feat references, and starting equipment.</p></header>
      <CompendiumNav />
      <section className="content-list" aria-label="Background results">
        {backgrounds.map((entry) => (
          <Link className="content-row panel" to={`/compendium/backgrounds/${encodeURIComponent(entry.id)}`} key={entry.id}>
            <div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>{entry.skillProficiencies.length} skills · {entry.originFeat.name}{entry.originFeat.variant ? ` (${entry.originFeat.variant})` : ''}</p></div>
            <span className="content-row__arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
