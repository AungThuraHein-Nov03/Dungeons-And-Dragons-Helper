import { useNavigate } from 'react-router-dom';
import { CharacterForm } from '../components/CharacterForm';
import type { CharacterInput } from '../models/character';
import { createCharacter } from '../services/characterStorage';

export function CreateCharacterPage() {
  const navigate = useNavigate();
  function handleCreate(input: CharacterInput) {
    const character = createCharacter(input);
    navigate(`/characters/${character.id}`);
  }
  return <div className="stack-page stack-page--narrow"><header className="page-heading"><span className="eyebrow">Character Builder</span><h1>Create Character</h1><p>Choose stored character inputs. The rules engine derives proficiency, saves, skills, defense, and weapon statistics from them.</p></header><CharacterForm submitLabel="Create Character" onSubmit={handleCreate} /></div>;
}
