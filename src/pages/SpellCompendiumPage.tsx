import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { SpellLevel, SpellSchool } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';

const SCHOOL_LABELS: Record<SpellSchool, string> = {
  abjuration: 'Abjuration', conjuration: 'Conjuration', divination: 'Divination', enchantment: 'Enchantment',
  evocation: 'Evocation', illusion: 'Illusion', necromancy: 'Necromancy', transmutation: 'Transmutation',
};

function levelLabel(level: SpellLevel): string { return level === 0 ? 'Cantrip' : `Level ${level}`; }

export function SpellCompendiumPage() {
  const spells = contentRegistry.getAll('spell');
  const [level, setLevel] = useState('all');
  const [school, setSchool] = useState('all');
  const [spellList, setSpellList] = useState('all');
  const [ritualOnly, setRitualOnly] = useState(false);
  const [concentrationOnly, setConcentrationOnly] = useState(false);
  const spellLists = useMemo(() => [...new Map(spells.flatMap((spell) => spell.spellLists).map((list) => [list.id, list])).values()].sort((a, b) => a.name.localeCompare(b.name)), [spells]);
  const filtered = spells.filter((spell) =>
    (level === 'all' || spell.level === Number(level)) &&
    (school === 'all' || spell.school === school) &&
    (spellList === 'all' || spell.spellLists.some((list) => list.id === spellList)) &&
    (!ritualOnly || spell.ritual) &&
    (!concentrationOnly || spell.concentration)
  );

  return (
    <div className="stack-page">
      <header className="page-heading"><span className="eyebrow">Compendium</span><h1>Spells</h1><p>The complete SRD 5.2.1 spell catalog. Spell prose is reference text; only explicitly structured mechanics are automated.</p></header>
      <CompendiumNav />
      <section className="panel form-section" aria-label="Spell filters">
        <div className="field-grid field-grid--two">
          <label className="field"><span>Spell level</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All levels</option><option value="0">Cantrip</option>{Array.from({ length: 9 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Level {value}</option>)}</select></label>
          <label className="field"><span>School</span><select value={school} onChange={(event) => setSchool(event.target.value)}><option value="all">All schools</option>{Object.entries(SCHOOL_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="field"><span>Spell list</span><select value={spellList} onChange={(event) => setSpellList(event.target.value)}><option value="all">All lists</option>{spellLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
          <div className="choice-grid"><label className="choice-card"><input type="checkbox" checked={ritualOnly} onChange={(event) => setRitualOnly(event.target.checked)} /><span>Ritual only</span></label><label className="choice-card"><input type="checkbox" checked={concentrationOnly} onChange={(event) => setConcentrationOnly(event.target.checked)} /><span>Concentration only</span></label></div>
        </div>
      </section>
      <section className="content-list" aria-label="Spell results">
        {filtered.length === 0 ? <div className="empty-state panel"><p>No spells match these filters.</p></div> : filtered.map((spell) => <Link className="content-row panel" to={`/compendium/spells/${encodeURIComponent(spell.id)}`} key={spell.id}><div><SourceBadge source={spell.source} /><h2>{spell.name}</h2><p>{levelLabel(spell.level)} · {SCHOOL_LABELS[spell.school]} · {spell.castingTime} · {spell.range}{spell.concentration ? ' · Concentration' : ''}{spell.ritual ? ' · Ritual' : ''}</p></div><span className="content-row__arrow" aria-hidden="true">→</span></Link>)}
      </section>
    </div>
  );
}
