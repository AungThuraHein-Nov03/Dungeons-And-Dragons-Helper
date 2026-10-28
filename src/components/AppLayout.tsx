import { Link, NavLink, Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" to="/" aria-label="Iron and Ink"><span className="brand__mark" aria-hidden="true">D20</span><span><strong>Iron and Ink</strong><small>Forge your adventurers and fulfill your destiny</small></span></Link>
          <nav className="main-nav" aria-label="Primary navigation"><NavLink to="/" end>Home</NavLink><NavLink to="/characters">Characters</NavLink><NavLink to="/compendium">Compendium</NavLink><NavLink to="/creator-forge">Creator Forge</NavLink></nav>
        </div>
      </header>
      <main className="page-shell"><Outlet /></main>
      <footer className="site-footer">Iron and Ink · Local-first character building, campaign play, and homebrew tools</footer>
    </div>
  );
}
