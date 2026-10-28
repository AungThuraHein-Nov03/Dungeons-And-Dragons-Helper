import { describe, expect, it } from 'vitest';
import { fighterCharacter } from '../test/fixtures';
import {
  CHARACTER_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_V9_KEY,
  deserializeCharacters,
  migrateLegacyV9Character,
} from './characterStorage';

function toV9Record() {
  const character = structuredClone(fighterCharacter());
  const { languageChoices: _languages, ...legacyCharacter } = character;
  void _languages;
  return {
    ...legacyCharacter,
    classProgressions: character.classProgressions.map(({ skillExpertise: _expertise, weaponMasterySelections: _masteries, ...progression }) => {
      void _expertise;
      void _masteries;
      return progression;
    }),
  };
}

describe('Character v10 schema foundation', () => {
  it('uses v10 browser authority while preserving v9 as the newest legacy key', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    expect(LEGACY_CHARACTER_STORAGE_V9_KEY).toBe('dnd3.characters.v9');
  });

  it('deterministically adds only empty v10 choice arrays to a v9 Character', () => {
    const legacy = toV9Record();
    const migrated = migrateLegacyV9Character(legacy);

    expect(migrated).toEqual({
      ...legacy,
      languageChoices: [],
      classProgressions: legacy.classProgressions.map((progression) => ({
        ...progression,
        skillExpertise: [],
        weaponMasterySelections: [],
      })),
    });
    expect(migrateLegacyV9Character(structuredClone(legacy))).toEqual(migrated);
  });

  it('rejects a v9-shaped record as canonical v10', () => {
    expect(deserializeCharacters(JSON.stringify([toV9Record()]))).toEqual([]);
  });
});
