import { Link, useNavigate, useParams } from 'react-router-dom';
import { CharacterForm } from '../components/CharacterForm';
import type { CharacterInput } from '../models/character';
import { getCharacterById, updateCharacter } from '../services/characterStorage';

export function EditCharacterPage() {
  const { characterId = '' } = useParams();
  const navigate = useNavigate();
  const character = getCharacterById(characterId);
  if (!character) return <section className="empty-state panel"><h1>Character not found</h1><p>The saved character may have been deleted or the link is invalid.</p><Link className="button button--secondary" to="/characters">Back to Characters</Link></section>;
  const characterIdToUpdate = character.id;
  function handleUpdate(input: CharacterInput) {
    const updated = updateCharacter(characterIdToUpdate, input);
    if (updated) navigate(`/characters/${updated.id}`);
  }
  return <div className="stack-page stack-page--narrow"><header className="page-heading"><span className="eyebrow">Character Builder</span><h1>Edit {character.name}</h1><p>Change stored choices; all derived sheet values recalculate when you save.</p></header><CharacterForm initialCharacter={character} submitLabel="Save Changes" onSubmit={handleUpdate} /></div>;
}
