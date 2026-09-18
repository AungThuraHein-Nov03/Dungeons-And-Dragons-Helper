import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { WeaponCategory } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { formatDamage } from '../utils/contentFormat';

export function WeaponCompendiumPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | WeaponCategory>('all');
  const weapons = contentRegistry.getAll('weapon');
  const filtered = useMemo(() => weapons.filter((entry) => entry.name.toLowerCase().includes(search.trim().toLowerCase()) && (category === 'all' || entry.category === category)), [weapons, search, category]);

  return (
    <div className="stack-page">
      <header className="page-heading"><span className="eyebrow">Compendium</span><h1>Weapons</h1><p>{weapons.length} structured SRD weapons with stable mastery references.</p></header>
      <CompendiumNav />
      <section className="filter-bar panel"><label className="field"><span>Search weapons</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Scimitar" /></label><label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as 'all' | WeaponCategory)}><option value="all">All categories</option><option value="simple">Simple</option><option value="martial">Martial</option></select></label></section>
      <section className="content-list" aria-label="Weapons results">{filtered.map((entry) => <Link className="content-row panel" to={`/compendium/weapons/${encodeURIComponent(entry.id)}`} key={entry.id}><div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>{entry.category} {entry.mode} · {formatDamage(entry.damage)} {entry.damageType}</p></div><span className="content-row__arrow" aria-hidden="true">→</span></Link>)}</section>
      {filtered.length === 0 && <section className="empty-state panel"><h2>No matching weapons</h2><p>Try a different name or category.</p></section>}
    </div>
  );
}
