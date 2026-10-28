import { NavLink } from 'react-router-dom';

export function CreatorForgeNav() {
  return (
    <nav className="compendium-nav creator-forge-nav" aria-label="Creator Forge sections">
      <NavLink to="/creator-forge" end>Overview</NavLink>
      <NavLink to="/creator-forge/feats">Feats</NavLink>
      <NavLink to="/creator-forge/spells">Spells</NavLink>
      <NavLink to="/creator-forge/subclasses">Subclasses</NavLink>
      <NavLink to="/creator-forge/classes">Classes</NavLink>
      <NavLink to="/creator-forge/equipment">Equipment</NavLink>
      <NavLink to="/creator-forge/migration">Migration</NavLink>
    </nav>
  );
}
