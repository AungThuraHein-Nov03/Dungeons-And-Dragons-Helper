import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreatorForgeDeletePanel } from '../components/CreatorForgeDeletePanel';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { SourceBadge } from '../components/SourceBadge';
import type { ArmorContent, EquipmentContent, WeaponContent } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { projectContentMutationsAreLocked } from '../services/persistenceBackend';

type ForgeEquipment = WeaponContent | ArmorContent | EquipmentContent;

const CATEGORY_LABELS = {
  simple: 'Simple weapon',
  martial: 'Martial weapon',
  light: 'Light armor',
  medium: 'Medium armor',
  heavy: 'Heavy armor',
  shield: 'Shield',
  ammunition: 'Ammunition',
  consumable: 'Consumable',
  'adventuring-gear': 'Adventuring gear',
  'campaign-item': 'Campaign item',
  other: 'Other equipment',
} as const;

function summary(entry: ForgeEquipment): string {
  const references = entry.referenceEffects?.length ?? 0;
  const referenceText = `${references} reference effect${references === 1 ? '' : 's'}`;
  if (entry.kind === 'weapon') {
    return `${CATEGORY_LABELS[entry.category]} · +${entry.attackBonus ?? 0} attack · +${entry.damageBonus ?? 0} damage · ${referenceText}`;
  }
  if (entry.kind === 'armor') {
    return `${CATEGORY_LABELS[entry.category]} · +${entry.armorClassBonus ?? 0} AC bonus · ${referenceText}`;
  }
  return `${CATEGORY_LABELS[entry.category]} · No automated bonus · ${referenceText}`;
}

function EquipmentGroup({
  title,
  entries,
  locked,
  onDelete,
}: {
  title: string;
  entries: readonly ForgeEquipment[];
  locked: boolean;
  onDelete: (entry: ForgeEquipment) => void;
}) {
  return (
    <section className="equipment-forge-group" aria-labelledby={`equipment-group-${title.replace(/\W+/g, '-').toLowerCase()}`}>
      <div className="section-heading equipment-forge-group__heading">
        <h2 id={`equipment-group-${title.replace(/\W+/g, '-').toLowerCase()}`}>{title}</h2>
        <p>{entries.length} custom entr{entries.length === 1 ? 'y' : 'ies'}</p>
      </div>
      {entries.length === 0 ? (
        <div className="panel equipment-forge-group__empty">No custom entries in this group yet.</div>
      ) : (
        <div className="content-list">
          {entries.map((entry) => (
            <article className="forge-list-row panel" key={entry.id}>
              <div className="forge-list-row__content">
                <SourceBadge source={entry.source} />
                <h3>{entry.name}</h3>
                <p>{summary(entry)}</p>
              </div>
              <div className="forge-list-row__actions">
                {locked ? <button className="button button--secondary" type="button" disabled>Edit</button> : (
                  <Link className="button button--secondary" to={`/creator-forge/equipment/${encodeURIComponent(entry.id)}/edit`}>Edit</Link>
                )}
                {locked ? <button className="button button--secondary" type="button" disabled>Start From Existing</button> : (
                  <Link className="button button--secondary" to={`/creator-forge/equipment/new?template=${encodeURIComponent(entry.id)}`}>Start From Existing</Link>
                )}
                <button className="button button--secondary" type="button" disabled={locked} onClick={() => onDelete(entry)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function CreatorForgeEquipmentPage() {
  const mutationsLocked = projectContentMutationsAreLocked();
  const [deleteTarget, setDeleteTarget] = useState<ForgeEquipment | null>(null);
  const weapons = contentRegistry.getAll('weapon').filter((entry) => entry.source.type === 'homebrew').sort((a, b) => a.name.localeCompare(b.name));
  const armor = contentRegistry.getAll('armor').filter((entry) => entry.source.type === 'homebrew').sort((a, b) => a.name.localeCompare(b.name));
  const equipment = contentRegistry.getAll('equipment').filter((entry) => entry.source.type === 'homebrew').sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack-page creator-forge-page equipment-forge-manager">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Equipment</span>
          <h1>Custom Equipment</h1>
          <p>Manage custom weapons, armor, shields, and miscellaneous equipment in the active content catalog.</p>
        </div>
        {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Equipment</button> : (
          <Link className="button button--primary" to="/creator-forge/equipment/new">Create Equipment</Link>
        )}
      </header>

      {mutationsLocked ? <div className="form-alert" role="status">Project content mutations are currently locked.</div> : null}
      <EquipmentGroup title="Weapons" entries={weapons} locked={mutationsLocked} onDelete={setDeleteTarget} />
      <EquipmentGroup title="Armor & Shields" entries={armor} locked={mutationsLocked} onDelete={setDeleteTarget} />
      <EquipmentGroup title="Miscellaneous Equipment" entries={equipment} locked={mutationsLocked} onDelete={setDeleteTarget} />
      {deleteTarget ? <CreatorForgeDeletePanel entry={deleteTarget} onCancel={() => setDeleteTarget(null)} onDeleted={() => setDeleteTarget(null)} /> : null}
    </div>
  );
}
