import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreatorForgeDeletePanel } from '../components/CreatorForgeDeletePanel';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { SourceBadge } from '../components/SourceBadge';
import type { SpellContent, SpellLevel, SpellSchool } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { projectContentMutationsAreLocked } from '../services/persistenceBackend';

const SCHOOL_LABELS: Record<SpellSchool, string> = {
  abjuration: 'Abjuration',
  conjuration: 'Conjuration',
  divination: 'Divination',
  enchantment: 'Enchantment',
  evocation: 'Evocation',
  illusion: 'Illusion',
  necromancy: 'Necromancy',
  transmutation: 'Transmutation',
};

function levelLabel(level: SpellLevel): string {
  return level === 0 ? 'Cantrip' : 'Level ' + level;
}

export function CreatorForgeSpellsPage() {
  const mutationsLocked = projectContentMutationsAreLocked();
  const [deleteTarget, setDeleteTarget] = useState<SpellContent | null>(null);
  const spells = contentRegistry.getAll('spell')
    .filter((spell) => spell.source.type === 'homebrew')
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Spells</span>
          <h1>Custom Spells</h1>
          <p>Manage authored Spells only. Bundled SRD Spells remain read-only in the Compendium.</p>
        </div>
        {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Spell</button> : <Link className="button button--primary" to="/creator-forge/spells/new">Create Spell</Link>}
      </header>

      {mutationsLocked && <div className="form-alert" role="status">Project content is read-only during Phase B. Forge mutations unlock in Phase C.</div>}
      {spells.length === 0 ? (
        <section className="empty-state panel">
          <div className="empty-state__icon" aria-hidden="true">+</div>
          <h2>No custom Spells yet</h2>
          <p>Create a Spell to add canonical homebrew content to the effective registry.</p>
          {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Spell</button> : <Link className="button button--primary" to="/creator-forge/spells/new">Create Spell</Link>}
        </section>
      ) : (
        <section className="content-list" aria-label="Custom Spells">
          {spells.map((spell) => (
            <article className="forge-list-row panel" key={spell.id}>
              <div className="forge-list-row__content">
                <SourceBadge source={spell.source} />
                <h2>{spell.name}</h2>
                <p>
                  {levelLabel(spell.level)} · {SCHOOL_LABELS[spell.school]} ·
                  {' '}{spell.spellLists.map((list) => list.name).join(', ')}
                  {spell.concentration ? ' · Concentration' : ''}
                  {spell.ritual ? ' · Ritual' : ''}
                </p>
              </div>
              <div className="forge-list-row__actions">
                {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Edit</button> : <Link className="button button--secondary" to={'/creator-forge/spells/' + encodeURIComponent(spell.id) + '/edit'}>Edit</Link>}
                {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Duplicate</button> : <Link className="button button--secondary" to={'/creator-forge/spells/new?duplicate=' + encodeURIComponent(spell.id)}>Duplicate</Link>}
                <button className="button button--secondary" type="button" disabled={mutationsLocked} onClick={() => setDeleteTarget(spell)}>Delete</button>
              </div>
            </article>
          ))}
        </section>
      )}
      {deleteTarget ? <CreatorForgeDeletePanel entry={deleteTarget} onCancel={() => setDeleteTarget(null)} onDeleted={() => setDeleteTarget(null)} /> : null}
    </div>
  );
}
