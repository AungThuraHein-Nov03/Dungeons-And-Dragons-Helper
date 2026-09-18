import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ArmorCompendiumPage } from './pages/ArmorCompendiumPage';
import { ArmorDetailPage } from './pages/ArmorDetailPage';
import { BackgroundCompendiumPage } from './pages/BackgroundCompendiumPage';
import { BackgroundDetailPage } from './pages/BackgroundDetailPage';
import { CharacterSheetPage } from './pages/CharacterSheetPage';
import { CharactersPage } from './pages/CharactersPage';
import { ClassCompendiumPage } from './pages/ClassCompendiumPage';
import { ClassDetailPage } from './pages/ClassDetailPage';
import { CompendiumHomePage } from './pages/CompendiumHomePage';
import { CreateCharacterPage } from './pages/CreateCharacterPage';
import { EditCharacterPage } from './pages/EditCharacterPage';
import { FeatCompendiumPage } from './pages/FeatCompendiumPage';
import { FeatDetailPage } from './pages/FeatDetailPage';
import { HomePage } from './pages/HomePage';
import { MasteryCompendiumPage } from './pages/MasteryCompendiumPage';
import { MasteryDetailPage } from './pages/MasteryDetailPage';
import { SpeciesCompendiumPage } from './pages/SpeciesCompendiumPage';
import { SpeciesDetailPage } from './pages/SpeciesDetailPage';
import { SpellCompendiumPage } from './pages/SpellCompendiumPage';
import { SpellDetailPage } from './pages/SpellDetailPage';
import { SubclassCompendiumPage } from './pages/SubclassCompendiumPage';
import { SubclassDetailPage } from './pages/SubclassDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WeaponCompendiumPage } from './pages/WeaponCompendiumPage';
import { WeaponDetailPage } from './pages/WeaponDetailPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="characters" element={<CharactersPage />} />
        <Route path="characters/new" element={<CreateCharacterPage />} />
        <Route path="characters/:characterId" element={<CharacterSheetPage view="play" />} />
        <Route path="characters/:characterId/character" element={<CharacterSheetPage view="character" />} />
        <Route path="characters/:characterId/edit" element={<EditCharacterPage />} />
        <Route path="characters/:characterId/inventory" element={<CharacterSheetPage view="inventory" />} />
        <Route path="compendium" element={<CompendiumHomePage />} />
        <Route path="compendium/classes" element={<ClassCompendiumPage />} />
        <Route path="compendium/classes/:contentId" element={<ClassDetailPage />} />
        <Route path="compendium/subclasses" element={<SubclassCompendiumPage />} />
        <Route path="compendium/subclasses/:contentId" element={<SubclassDetailPage />} />
        <Route path="compendium/species" element={<SpeciesCompendiumPage />} />
        <Route path="compendium/species/:contentId" element={<SpeciesDetailPage />} />
        <Route path="compendium/backgrounds" element={<BackgroundCompendiumPage />} />
        <Route path="compendium/backgrounds/:contentId" element={<BackgroundDetailPage />} />
        <Route path="compendium/feats" element={<FeatCompendiumPage />} />
        <Route path="compendium/feats/:contentId" element={<FeatDetailPage />} />
        <Route path="compendium/spells" element={<SpellCompendiumPage />} />
        <Route path="compendium/spells/:contentId" element={<SpellDetailPage />} />
        <Route path="compendium/weapons" element={<WeaponCompendiumPage />} />
        <Route path="compendium/weapons/:contentId" element={<WeaponDetailPage />} />
        <Route path="compendium/armor" element={<ArmorCompendiumPage />} />
        <Route path="compendium/armor/:contentId" element={<ArmorDetailPage />} />
        <Route path="compendium/masteries" element={<MasteryCompendiumPage />} />
        <Route path="compendium/masteries/:contentId" element={<MasteryDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
