import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="home-page">
      <section className="hero panel panel--hero">
        <div className="hero__copy">
          <span className="eyebrow">Local Character Forge</span>
          <h1>D&D 3.0</h1>
          <p>Build locally saved characters backed by structured SRD 5.2.1 content, deterministic rules, persistent tabletop play state, and one reusable Dice Engine.</p>
          <div className="hero__actions"><Link className="button button--primary" to="/characters/new">Create Character</Link><Link className="button button--secondary" to="/characters">View Characters</Link><Link className="button button--secondary" to="/compendium">Browse Compendium</Link></div>
        </div>
        <div className="hero__sigil" aria-hidden="true"><span>20</span></div>
      </section>
      <section className="home-note panel"><span className="eyebrow">Milestone 5</span><h2>The sheet now rolls as well as tracks.</h2><p>Ability checks, skills, saves, weapon attacks and damage use a shared Dice Engine with Normal, Advantage, and Disadvantage d20 modes. Second Wind and Hit Dice reuse the same engine and existing play-state transitions, while recent rolls live in a separate bounded history.</p></section>
    </div>
  );
}
