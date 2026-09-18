import { Link, NavLink, Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" to="/" aria-label="D&D 3.0 home"><span className="brand__mark" aria-hidden="true">D20</span><span><strong>D&D 3.0</strong><small>Character Forge</small></span></Link>
          <nav className="main-nav" aria-label="Primary navigation"><NavLink to="/" end>Home</NavLink><NavLink to="/characters">Characters</NavLink><NavLink to="/compendium">Compendium</NavLink></nav>
        </div>
      </header>
      <main className="page-shell"><Outlet /></main>
      <footer className="site-footer">Local-first character workspace · SRD 5.2.1 rules and play-state foundation</footer>
    </div>
  );
}
