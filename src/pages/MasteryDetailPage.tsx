import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';

export function MasteryDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findMastery(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Mastery not found</h1><Link className="text-link" to="/compendium/masteries">Back to Masteries</Link></section>;
  const weapons = contentRegistry.getAll('weapon').filter((weapon) => weapon.masteryId === entry.id);
  return <div className="stack-page"><CompendiumNav /><header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>{entry.description}</p></div></header><section className="panel detail-card"><span className="eyebrow">Assigned Weapons</span><h2>{weapons.length} weapons</h2><p>{weapons.map((weapon) => weapon.name).join(', ')}</p></section><Link className="text-link" to="/compendium/masteries">← Back to Weapon Masteries</Link></div>;
}
