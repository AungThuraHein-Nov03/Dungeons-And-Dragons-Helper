import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';

export function SubclassCompendiumPage() {
  const subclasses = contentRegistry.getAll('subclass');
  return (
    <div className="stack-page">
      <header className="page-heading"><span className="eyebrow">Compendium</span><h1>Subclasses</h1><p>Structured subclass foundations and level-gated feature progression.</p></header>
      <CompendiumNav />
      <section className="content-list">
        {subclasses.map((entry) => {
          const parent = contentRegistry.findClass(entry.parentClassId);
          return <Link className="content-row panel" to={`/compendium/subclasses/${encodeURIComponent(entry.id)}`} key={entry.id}><div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>{parent?.name ?? entry.parentClassId} · acquired at level {entry.acquisitionLevel} · {entry.progression.flatMap((row) => row.features).length} features</p></div><span className="content-row__arrow" aria-hidden="true">→</span></Link>;
        })}
      </section>
    </div>
  );
}
