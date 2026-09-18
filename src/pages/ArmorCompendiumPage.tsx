import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { ArmorCategory } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { formatArmorClass } from '../utils/contentFormat';

export function ArmorCompendiumPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | ArmorCategory>('all');
  const armor = contentRegistry.getAll('armor');
  const filtered = useMemo(() => armor.filter((entry) => entry.name.toLowerCase().includes(search.trim().toLowerCase()) && (category === 'all' || entry.category === category)), [armor, search, category]);

  return <div className="stack-page"><header className="page-heading"><span className="eyebrow">Compendium</span><h1>Armor</h1><p>{armor.length} armor and shield entries with structured AC rules.</p></header><CompendiumNav /><section className="filter-bar panel"><label className="field"><span>Search armor</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chain Mail" /></label><label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as 'all' | ArmorCategory)}><option value="all">All categories</option><option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option><option value="shield">Shield</option></select></label></section><section className="content-list" aria-label="Armor results">{filtered.map((entry) => <Link className="content-row panel" to={`/compendium/armor/${encodeURIComponent(entry.id)}`} key={entry.id}><div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>{entry.category} · AC {formatArmorClass(entry.armorClass)}</p></div><span className="content-row__arrow" aria-hidden="true">→</span></Link>)}</section></div>;
}
