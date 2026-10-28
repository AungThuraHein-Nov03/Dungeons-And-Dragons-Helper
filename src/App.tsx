import { useSyncExternalStore } from 'react';
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
import { ClassForgePage } from './pages/ClassForgePage';
import { CompendiumHomePage } from './pages/CompendiumHomePage';
import { CreatorForgeClassesPage } from './pages/CreatorForgeClassesPage';
import { CreatorForgeEquipmentPage } from './pages/CreatorForgeEquipmentPage';
import { CreatorForgeFeatsPage } from './pages/CreatorForgeFeatsPage';
import { CreatorForgePage } from './pages/CreatorForgePage';
import { CreatorForgeSpellsPage } from './pages/CreatorForgeSpellsPage';
import { CreatorForgeSubclassesPage } from './pages/CreatorForgeSubclassesPage';
import { CreateCharacterPage } from './pages/CreateCharacterPage';
import { FeatForgePage } from './pages/FeatForgePage';
import { EditCharacterPage } from './pages/EditCharacterPage';
import { EquipmentForgePage } from './pages/EquipmentForgePage';
import { EquipmentCompendiumPage } from './pages/EquipmentCompendiumPage';
import { EquipmentDetailPage } from './pages/EquipmentDetailPage';
import { FeatCompendiumPage } from './pages/FeatCompendiumPage';
import { FeatDetailPage } from './pages/FeatDetailPage';
import { HomePage } from './pages/HomePage';
import { LevelUpPage } from './pages/LevelUpPage';
import { MasteryCompendiumPage } from './pages/MasteryCompendiumPage';
import { MasteryDetailPage } from './pages/MasteryDetailPage';
import { ProjectMigrationPage } from './pages/ProjectMigrationPage';
import { SpeciesCompendiumPage } from './pages/SpeciesCompendiumPage';
import { SpeciesDetailPage } from './pages/SpeciesDetailPage';
import { SpellCompendiumPage } from './pages/SpellCompendiumPage';
import { SpellDetailPage } from './pages/SpellDetailPage';
import { SpellForgePage } from './pages/SpellForgePage';
import { SubclassCompendiumPage } from './pages/SubclassCompendiumPage';
import { SubclassDetailPage } from './pages/SubclassDetailPage';
import { SubclassForgePage } from './pages/SubclassForgePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WeaponCompendiumPage } from './pages/WeaponCompendiumPage';
import { WeaponDetailPage } from './pages/WeaponDetailPage';
import { getContentRegistryGeneration, subscribeContentRegistry } from './services/contentRegistry';
import { getCharacterCatalogGeneration, subscribeCharacterCatalog } from './services/characterCatalog';
import { DiceRollOverlayHost } from './components/DiceRollOverlayHost';

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
        <Route path="characters/:characterId/level-up" element={<LevelUpPage />} />
        <Route path="characters/:characterId/inventory" element={<CharacterSheetPage view="inventory" />} />
        <Route path="creator-forge" element={<CreatorForgePage />} />
        <Route path="creator-forge/feats" element={<CreatorForgeFeatsPage />} />
        <Route path="creator-forge/feats/new" element={<FeatForgePage />} />
        <Route path="creator-forge/feats/:contentId/edit" element={<FeatForgePage />} />
        <Route path="creator-forge/spells" element={<CreatorForgeSpellsPage />} />
        <Route path="creator-forge/spells/new" element={<SpellForgePage />} />
        <Route path="creator-forge/spells/:contentId/edit" element={<SpellForgePage />} />
        <Route path="creator-forge/subclasses" element={<CreatorForgeSubclassesPage />} />
        <Route path="creator-forge/subclasses/new" element={<SubclassForgePage />} />
        <Route path="creator-forge/subclasses/:contentId/edit" element={<SubclassForgePage />} />
        <Route path="creator-forge/classes" element={<CreatorForgeClassesPage />} />
        <Route path="creator-forge/classes/new" element={<ClassForgePage />} />
        <Route path="creator-forge/classes/:contentId/edit" element={<ClassForgePage />} />
        <Route path="creator-forge/equipment" element={<CreatorForgeEquipmentPage />} />
        <Route path="creator-forge/equipment/new" element={<EquipmentForgePage />} />
        <Route path="creator-forge/equipment/:contentId/edit" element={<EquipmentForgePage />} />
        <Route path="creator-forge/migration" element={<ProjectMigrationPage />} />
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
        <Route path="compendium/equipment" element={<EquipmentCompendiumPage />} />
        <Route path="compendium/equipment/:contentId" element={<EquipmentDetailPage />} />
        <Route path="compendium/masteries" element={<MasteryCompendiumPage />} />
        <Route path="compendium/masteries/:contentId" element={<MasteryDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  useSyncExternalStore(subscribeContentRegistry, getContentRegistryGeneration, getContentRegistryGeneration);
  useSyncExternalStore(subscribeCharacterCatalog, getCharacterCatalogGeneration, getCharacterCatalogGeneration);
  return <><AppRoutes /><DiceRollOverlayHost /></>;
}
