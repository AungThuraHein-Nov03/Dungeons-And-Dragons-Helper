import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="home-page">
      <section className="hero panel panel--hero">
        <div className="hero__copy">
          <span className="eyebrow">Local D&D Companion</span>
          <h1>Iron and Ink</h1>
          <p>
              Create, customize, and play your D&D characters locally with integrated
              rules, persistent campaign state, equipment, spellcasting, and dice.
          </p>
          <div className="hero__actions"><Link className="button button--primary" to="/characters/new">Create Character</Link><Link className="button button--secondary" to="/characters">View Characters</Link><Link className="button button--secondary" to="/compendium">Browse Compendium</Link></div>
        </div>
        <div className="hero__sigil" aria-hidden="true"><span>D20</span></div>
      </section>
      <section className="home-note panel"><span className="eyebrow">CAMPAIGN-READY</span><h2>Built to create characters. Expanded to actually play them.</h2><p>Create and manage characters with multiclassing, spellcasting, class resources, equipment, custom content, persistent play state, and integrated dice. Creator Forge supports reusable homebrew classes, subclasses, feats, spells, weapons, armor, and equipment—all backed by the same rules and persistence systems used during play.</p></section>
    </div>
  );
}
