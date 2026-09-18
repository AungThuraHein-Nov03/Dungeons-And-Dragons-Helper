import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import { contentRegistry } from '../services/contentRegistry';

export function ClassCompendiumPage() {
  const classes = contentRegistry.getAll('class');
  return (
    <div className="stack-page">
      <header className="page-heading"><span className="eyebrow">Compendium</span><h1>Classes</h1><p>Structured class foundations and progression tables.</p></header>
      <CompendiumNav />
      <section className="content-list">
        {classes.map((entry) => {
          const classSpellcasting = entry.progression.some((row) => row.features.some((feature) => (feature.spellcasting?.length ?? 0) > 0));
          const primary = entry.primaryAbility.abilities.map((ability) => ability[0].toUpperCase() + ability.slice(1)).join(entry.primaryAbility.mode === 'one-of' ? ' or ' : ' and ');
          return <Link className="content-row panel" to={`/compendium/classes/${encodeURIComponent(entry.id)}`} key={entry.id}>
            <div><SourceBadge source={entry.source} /><h2>{entry.name}</h2><p>D{entry.hitDie} Hit Die · Primary: {primary} · {classSpellcasting ? 'Class Spellcasting' : 'No class Spellcasting'}</p></div>
            <span className="content-row__arrow" aria-hidden="true">→</span>
          </Link>;
        })}
      </section>
    </div>
  );
}
