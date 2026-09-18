import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';

export function SpeciesCompendiumPage() {
  const species = contentRegistry.getAll('species');
  return (
    <div className="stack-page">
      <header className="page-heading"><span className="eyebrow">Compendium</span><h1>Species</h1><p>Structured SRD Species foundations, choices, movement, senses, and reference-only traits.</p></header>
      <CompendiumNav />
      <section className="content-list" aria-label="Species results">
        {species.map((entry) => (
          <Link className="content-row panel" to={`/compendium/species/${encodeURIComponent(entry.id)}`} key={entry.id}>
            <div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>{entry.size.kind === 'fixed' ? entry.size.value : entry.size.options.join(' / ')} · Speed {entry.speedFeet} ft. · {entry.traits.length} traits</p></div>
            <span className="content-row__arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
