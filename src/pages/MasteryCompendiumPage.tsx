import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';

export function MasteryCompendiumPage() {
  const masteries = contentRegistry.getAll('weaponMastery');
  return <div className="stack-page"><header className="page-heading"><span className="eyebrow">Compendium</span><h1>Weapon Masteries</h1><p>All {masteries.length} Weapon Mastery properties in SRD 5.2.1.</p></header><CompendiumNav /><section className="content-list">{masteries.map((entry) => <Link className="content-row panel" to={`/compendium/masteries/${encodeURIComponent(entry.id)}`} key={entry.id}><div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>{entry.description}</p></div><span className="content-row__arrow" aria-hidden="true">→</span></Link>)}</section></div>;
}
