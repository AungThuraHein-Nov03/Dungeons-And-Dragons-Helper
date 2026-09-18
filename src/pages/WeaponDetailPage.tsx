import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';
import { formatDamage, formatMoney, formatWeaponProperty } from '../utils/contentFormat';

export function WeaponDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findWeapon(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Weapon not found</h1><Link className="text-link" to="/compendium/weapons">Back to Weapons</Link></section>;
  const mastery = contentRegistry.findMastery(entry.masteryId);

  return (
    <div className="stack-page">
      <CompendiumNav />
      <header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>{entry.category[0].toUpperCase() + entry.category.slice(1)} {entry.mode} weapon</p></div></header>
      <section className="detail-grid"><div className="panel detail-card"><span className="eyebrow">Weapon Data</span><dl className="detail-list"><div><dt>Damage</dt><dd>{formatDamage(entry.damage)} {entry.damageType}</dd></div><div><dt>Properties</dt><dd>{entry.properties.length ? entry.properties.map(formatWeaponProperty).join(', ') : 'None'}</dd></div><div><dt>Cost</dt><dd>{formatMoney(entry.cost)}</dd></div><div><dt>Weight</dt><dd>{entry.weightPounds === null ? '—' : `${entry.weightPounds} lb.`}</dd></div></dl></div><div className="panel detail-card"><span className="eyebrow">Weapon Mastery</span><h2>{mastery?.name ?? 'Unknown mastery'}</h2>{mastery && <><p>{mastery.description}</p><Link className="text-link" to={`/compendium/masteries/${encodeURIComponent(mastery.id)}`}>Open {mastery.name} mastery →</Link></>}</div></section>
      <Link className="text-link" to="/compendium/weapons">← Back to Weapons</Link>
    </div>
  );
}
