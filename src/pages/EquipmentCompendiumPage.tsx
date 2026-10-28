import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { EquipmentCategory } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { formatMoney } from '../utils/contentFormat';

const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  ammunition: 'Ammunition',
  consumable: 'Consumable',
  'adventuring-gear': 'Adventuring Gear',
  'campaign-item': 'Campaign Item',
  other: 'Other',
};

export function EquipmentCompendiumPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | EquipmentCategory>('all');
  const equipment = contentRegistry.getAll('equipment');
  const filtered = useMemo(() => equipment.filter((entry) => entry.name.toLowerCase().includes(search.trim().toLowerCase()) && (category === 'all' || entry.category === category)), [equipment, search, category]);

  return <div className="stack-page"><header className="page-heading"><span className="eyebrow">Compendium</span><h1>Equipment</h1><p>{equipment.length} miscellaneous equipment entries with descriptive table references.</p></header><CompendiumNav /><section className="filter-bar panel"><label className="field"><span>Search equipment</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Royal Writ" /></label><label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as 'all' | EquipmentCategory)}><option value="all">All categories</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></section><section className="content-list" aria-label="Equipment results">{filtered.map((entry) => <Link className="content-row panel" to={`/compendium/equipment/${encodeURIComponent(entry.id)}`} key={entry.id}><div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>{CATEGORY_LABELS[entry.category]} · {formatMoney(entry.cost)}</p></div><span className="content-row__arrow" aria-hidden="true">→</span></Link>)}</section>{filtered.length === 0 && <section className="empty-state panel"><h2>No matching equipment</h2><p>Try a different name or category.</p></section>}</div>;
}
