import { Link } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { contentRegistry } from '../services/contentRegistry';

const sections = [
  { label: 'Classes', path: '/compendium/classes', kind: 'class' as const },
  { label: 'Subclasses', path: '/compendium/subclasses', kind: 'subclass' as const },
  { label: 'Species', path: '/compendium/species', kind: 'species' as const },
  { label: 'Backgrounds', path: '/compendium/backgrounds', kind: 'background' as const },
  { label: 'Feats', path: '/compendium/feats', kind: 'feat' as const },
  { label: 'Spells', path: '/compendium/spells', kind: 'spell' as const },
  { label: 'Weapons', path: '/compendium/weapons', kind: 'weapon' as const },
  { label: 'Armor', path: '/compendium/armor', kind: 'armor' as const },
  { label: 'Weapon Masteries', path: '/compendium/masteries', kind: 'weaponMastery' as const },
];

export function CompendiumHomePage() {
  return (
    <div className="stack-page">
      <header className="page-heading">
        <span className="eyebrow">Rules Content</span>
        <h1>Compendium</h1>
        <p>Browse the local SRD 5.2.1 registry. Built-in SRD content is read-only and identified separately from future Homebrew content.</p>
      </header>
      <CompendiumNav />
      <section className="compendium-grid">
        {sections.map((section) => (
          <Link className="compendium-card panel" to={section.path} key={section.kind}>
            <span className="eyebrow">{contentRegistry.getAll(section.kind).length} entries</span>
            <h2>{section.label}</h2>
            <p>Open {section.label.toLowerCase()} in the content registry.</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
