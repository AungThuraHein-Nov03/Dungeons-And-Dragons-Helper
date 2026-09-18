import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { FeatCategory } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';

const CATEGORY_LABELS: Record<FeatCategory, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
};

export function FeatCompendiumPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | FeatCategory>('all');
  const feats = contentRegistry.getAll('feat');
  const filtered = useMemo(() => feats.filter((feat) => feat.name.toLowerCase().includes(search.trim().toLowerCase()) && (category === 'all' || feat.category === category)), [feats, search, category]);

  return (
    <div className="stack-page">
      <header className="page-heading"><span className="eyebrow">Compendium</span><h1>Feats</h1><p>All {feats.length} bundled SRD 5.2.1 Feats with typed category, prerequisite, choice, structured-effect, and reference-only metadata.</p></header>
      <CompendiumNav />
      <section className="filter-bar panel">
        <label className="field"><span>Search feats</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Archery" /></label>
        <label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as 'all' | FeatCategory)}><option value="all">All categories</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </section>
      <section className="content-list" aria-label="Feat results">
        {filtered.map((feat) => <Link className="content-row panel" to={`/compendium/feats/${encodeURIComponent(feat.id)}`} key={feat.id}><div><SourceBadge source={feat.source} /><h2>{feat.name}</h2><p>{CATEGORY_LABELS[feat.category]} · {feat.prerequisites.length ? `${feat.prerequisites.length} prerequisite${feat.prerequisites.length === 1 ? '' : 's'}` : 'No prerequisites'} · {feat.effects.length} automated structured effect{feat.effects.length === 1 ? '' : 's'}</p></div><span className="content-row__arrow" aria-hidden="true">→</span></Link>)}
      </section>
      {filtered.length === 0 && <section className="empty-state panel"><h2>No matching feats</h2><p>Try a different name or category.</p></section>}
    </div>
  );
}
