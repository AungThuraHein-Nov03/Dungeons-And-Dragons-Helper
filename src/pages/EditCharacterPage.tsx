import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CharacterForm } from '../components/CharacterForm';
import type { CharacterInput } from '../models/character';
import { updateApplicationCharacter } from '../services/applicationCharacterMutations';
import { getApplicationCharacterById } from '../services/projectState';

export function EditCharacterPage() {
  const { characterId = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const character = getApplicationCharacterById(characterId);
  if (!character) return <section className="empty-state panel"><h1>Character not found</h1><p>The saved character may have been deleted or the link is invalid.</p><Link className="button button--secondary" to="/characters">Back to Characters</Link></section>;
  const characterIdToUpdate = character.id;
  async function handleUpdate(input: CharacterInput) {
    setError('');
    const result = await updateApplicationCharacter(characterIdToUpdate, input);
    if (!result.ok || !result.character) {
      setError(result.ok ? 'Character was persisted without a returned Character record.' : result.error.message);
      return;
    }
    navigate(`/characters/${result.character.id}`);
  }
  return <div className="stack-page stack-page--narrow"><header className="page-heading"><span className="eyebrow">Character Builder</span><h1>Edit {character.name}</h1><p>Change stored choices; all derived sheet values recalculate when you save.</p></header>{error && <div className="form-alert" role="alert">{error}</div>}<CharacterForm initialCharacter={character} submitLabel="Save Changes" onSubmit={handleUpdate} /></div>;
}
