import { Link } from 'react-router-dom';
import type { Character } from '../models/character';
import { contentRegistry } from '../services/contentRegistry';

interface CharacterCardProps {
  character: Character;
  onDelete: (character: Character) => void;
}

export function CharacterCard({ character, onDelete }: CharacterCardProps) {
  const className = contentRegistry.findClass(character.classId)?.name ?? 'Unknown Class';
  return (
    <article className="character-card">
      <Link className="character-card__main" to={`/characters/${character.id}`}>
        <span className="eyebrow">Saved Character</span>
        <h2>{character.name}</h2>
        <p>{className} · Level {character.level}</p>
      </Link>
      <div className="character-card__actions">
        <Link className="text-link" to={`/characters/${character.id}/edit`}>Edit {character.name}</Link>
        <button className="text-button text-button--danger" type="button" onClick={() => onDelete(character)}>Delete</button>
      </div>
    </article>
  );
}
