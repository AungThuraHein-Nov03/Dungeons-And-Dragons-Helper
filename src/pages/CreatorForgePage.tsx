import { Link } from 'react-router-dom';
import { CreatorForgeNav } from '../components/CreatorForgeNav';

const families = [
  {
    name: 'Feats',
    description: 'Author canonical custom Feats with supported prerequisites, structured effects, dice transformations, and reference-only mechanics.',
    active: true,
    path: '/creator-forge/feats',
  },
  {
    name: 'Spells',
    description: 'Author canonical custom Spells with bounded attacks, saves, damage, healing, scaling, concentration, ritual, and reference-only behavior.',
    active: true,
    path: '/creator-forge/spells',
  },
  {
    name: 'Subclasses',
    description: 'Author canonical custom Subclasses with ordered features, bounded mechanics, resources, self effects, and owner-aware spellcasting.',
    active: true,
    path: '/creator-forge/subclasses',
  },
  {
    name: 'Classes',
    description: 'Author canonical custom Classes with complete 1–20 progression, bounded proficiencies, resources, advancement conventions, and Spellcasting providers.',
    active: true,
    path: '/creator-forge/classes',
  },
  {
    name: 'Equipment',
    description: 'Author canonical custom weapons, armor, shields, and miscellaneous equipment with structured bonuses and reference-only effects.',
    active: true,
    path: '/creator-forge/equipment',
  },
] as const;

export function CreatorForgePage() {
  return (
    <div className="stack-page creator-forge-page">
      <header className="page-heading">
        <span className="eyebrow">Creator Forge</span>
        <h1>Custom Content</h1>
        <p>Create local canonical content that enters the same effective registry used by Characters, rules, Level Up, and PLAY.</p>
      </header>
      <CreatorForgeNav />
      <section className="compendium-grid" aria-label="Creator Forge content families">
        {families.map((family) => family.active ? (
          <Link className="compendium-card panel" to={family.path} key={family.name}>
            <span className="eyebrow">Available now</span>
            <h2>{family.name}</h2>
            <p>{family.description}</p>
          </Link>
        ) : (
          <article className="compendium-card panel forge-family-card--disabled" aria-disabled="true" key={family.name}>
            <span className="eyebrow">Coming later</span>
            <h2>{family.name}</h2>
            <p>{family.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
