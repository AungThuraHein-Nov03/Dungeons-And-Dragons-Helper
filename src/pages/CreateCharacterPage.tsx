import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterForm } from '../components/CharacterForm';
import type { CharacterInput } from '../models/character';
import { createApplicationCharacter } from '../services/applicationCharacterMutations';

export function CreateCharacterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  async function handleCreate(input: CharacterInput) {
    setError('');
    const result = await createApplicationCharacter(input);
    if (!result.ok || !result.character) {
      setError(result.ok ? 'Character was persisted without a returned Character record.' : result.error.message);
      return;
    }
    navigate(`/characters/${result.character.id}`);
  }
  return <div className="stack-page stack-page--narrow"><header className="page-heading"><span className="eyebrow">Character Builder</span><h1>Create Character</h1><p>Choose stored character inputs. The rules engine derives proficiency, saves, skills, defense, and weapon statistics from them.</p></header>{error && <div className="form-alert" role="alert">{error}</div>}<CharacterForm submitLabel="Create Character" onSubmit={handleCreate} /></div>;
}
