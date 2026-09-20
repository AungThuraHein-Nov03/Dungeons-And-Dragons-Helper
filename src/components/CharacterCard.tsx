import { Link } from 'react-router-dom';
import type { Character } from '../models/character';
import { getSingleClassProgression, getTotalCharacterLevel } from '../rules/characterProgression';
import { contentRegistry } from '../services/contentRegistry';

interface CharacterCardProps {
  character: Character;
  onDelete: (character: Character) => void;
  readOnly?: boolean;
}

export function CharacterCard({ character, onDelete, readOnly = false }: CharacterCardProps) {
  const progression = getSingleClassProgression(character);
  const className = progression.ok ? contentRegistry.findClass(progression.value.classId)?.name ?? 'Unknown Class' : 'Unsupported Multiclass Character';
  const totalLevel = getTotalCharacterLevel(character);
  return (
    <article className="character-card">
      <Link className="character-card__main" to={`/characters/${character.id}`}>
        <span className="eyebrow">Saved Character</span>
        <h2>{character.name}</h2>
        <p>{className} · Level {totalLevel}</p>
      </Link>
      <div className="character-card__actions">
        {readOnly ? (
          <>
            <span className="text-link" aria-disabled="true">Edit locked</span>
            <button className="text-button text-button--danger" type="button" disabled>Delete</button>
          </>
        ) : (
          <>
            <Link className="text-link" to={`/characters/${character.id}/edit`}>Edit {character.name}</Link>
            <button className="text-button text-button--danger" type="button" onClick={() => onDelete(character)}>Delete</button>
          </>
        )}
      </div>
    </article>
  );
}
