import { NavLink } from 'react-router-dom';

export function CompendiumNav() {
  return (
    <nav className="compendium-nav" aria-label="Compendium sections">
      <NavLink to="/compendium" end>Overview</NavLink>
      <NavLink to="/compendium/classes">Classes</NavLink>
      <NavLink to="/compendium/subclasses">Subclasses</NavLink>
      <NavLink to="/compendium/species">Species</NavLink>
      <NavLink to="/compendium/backgrounds">Backgrounds</NavLink>
      <NavLink to="/compendium/feats">Feats</NavLink>
      <NavLink to="/compendium/spells">Spells</NavLink>
      <NavLink to="/compendium/weapons">Weapons</NavLink>
      <NavLink to="/compendium/armor">Armor</NavLink>
      <NavLink to="/compendium/equipment">Equipment</NavLink>
      <NavLink to="/compendium/masteries">Weapon Masteries</NavLink>
    </nav>
  );
}
