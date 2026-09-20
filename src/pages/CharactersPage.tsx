import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CharacterCard } from '../components/CharacterCard';
import type { Character } from '../models/character';
import { deleteApplicationCharacter } from '../services/applicationCharacterMutations';
import { getApplicationCharacters } from '../services/projectState';

export function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>(() => getApplicationCharacters());
  const [error, setError] = useState('');

  async function handleDelete(character: Character) {
    const confirmed = window.confirm(`Delete ${character.name}? This cannot be undone.`);
    if (!confirmed) return;

    setError('');
    const result = await deleteApplicationCharacter(character.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCharacters(getApplicationCharacters());
  }

  return (
    <div className="stack-page">
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Roster</span>
          <h1>Characters</h1>
          <p>Your saved adventurers live here.</p>
        </div>
        <Link className="button button--primary" to="/characters/new">Create Character</Link>
      </header>

      {error && <div className="form-alert" role="alert">{error}</div>}

      {characters.length === 0 ? (
        <section className="empty-state panel">
          <div className="empty-state__icon" aria-hidden="true">+</div>
          <h2>No characters yet</h2>
          <p>Create your first character in the active persistence backend.</p>
          <Link className="button button--primary" to="/characters/new">Create Character</Link>
        </section>
      ) : (
        <section className="character-grid" aria-label="Saved characters">
          {characters.map((character) => (
            <CharacterCard key={character.id} character={character} onDelete={handleDelete} />
          ))}
        </section>
      )}
    </div>
  );
}
