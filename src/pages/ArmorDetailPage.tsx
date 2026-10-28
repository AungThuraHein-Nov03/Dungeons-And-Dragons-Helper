import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';
import { formatArmorClass, formatMoney } from '../utils/contentFormat';
import { formatModifier } from '../utils/ability';

export function ArmorDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findArmor(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Armor not found</h1><Link className="text-link" to="/compendium/armor">Back to Armor</Link></section>;
  return <div className="stack-page"><CompendiumNav /><header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>{entry.category[0].toUpperCase() + entry.category.slice(1)} armor entry</p></div></header><section className="panel detail-card"><dl className="detail-list"><div><dt>Armor Class</dt><dd>{formatArmorClass(entry.armorClass)}</dd></div>{entry.armorClassBonus ? <div><dt>Armor Class Bonus</dt><dd>{formatModifier(entry.armorClassBonus)}</dd></div> : null}<div><dt>Strength</dt><dd>{entry.strengthRequirement ?? '—'}</dd></div><div><dt>Stealth</dt><dd>{entry.stealthDisadvantage ? 'Disadvantage' : '—'}</dd></div><div><dt>Cost</dt><dd>{formatMoney(entry.cost)}</dd></div><div><dt>Weight</dt><dd>{entry.weightPounds} lb.</dd></div></dl>{entry.description ? <><h2>Description</h2><p>{entry.description}</p></> : null}{entry.referenceEffects?.length ? <><h2>Reference Effects</h2>{entry.referenceEffects.map((effect) => <p key={effect}>{effect}</p>)}</> : null}</section><Link className="text-link" to="/compendium/armor">← Back to Armor</Link></div>;
}
