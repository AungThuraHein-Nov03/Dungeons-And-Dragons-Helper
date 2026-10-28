import { Link, useParams } from 'react-router-dom';
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

export function EquipmentDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findEquipment(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Equipment not found</h1><Link className="text-link" to="/compendium/equipment">Back to Equipment</Link></section>;

  return <div className="stack-page"><CompendiumNav /><header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>Miscellaneous equipment</p></div></header><section className="detail-grid"><div className="panel detail-card"><span className="eyebrow">Equipment Data</span><dl className="detail-list"><div><dt>Category</dt><dd>{CATEGORY_LABELS[entry.category]}</dd></div><div><dt>Cost</dt><dd>{formatMoney(entry.cost)}</dd></div><div><dt>Weight</dt><dd>{entry.weightPounds === null ? '—' : `${entry.weightPounds} lb.`}</dd></div></dl></div><div className="panel detail-card"><span className="eyebrow">Description</span><p>{entry.description}</p>{entry.referenceEffects.length ? <><h2>Reference Effects</h2>{entry.referenceEffects.map((effect) => <p key={effect}>{effect}</p>)}</> : null}</div></section><Link className="text-link" to="/compendium/equipment">← Back to Equipment</Link></div>;
}
