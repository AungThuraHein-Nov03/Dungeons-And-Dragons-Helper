import type { AbilityKey } from '../models/character';
import { formatModifier } from '../utils/ability';

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

interface AbilityScoreCardProps {
  ability: AbilityKey;
  score: number;
  modifier: number;
  saveModifier: number;
  saveProficient: boolean;
  onRollCheck: () => void;
  onRollSave: () => void;
}

export function AbilityScoreCard({ ability, score, modifier, saveModifier, saveProficient, onRollCheck, onRollSave }: AbilityScoreCardProps) {
  return (
    <article className="ability-card">
      <span className="ability-card__label">{ABILITY_LABELS[ability]}</span>
      <strong className="ability-card__modifier">{formatModifier(modifier)}</strong>
      <span className="ability-card__score">Score {score}</span>
      <span className="ability-card__save">Save {formatModifier(saveModifier)} {saveProficient ? '●' : '○'}</span>
      <div className="ability-card__rolls">
        <button className="mini-roll-button" type="button" onClick={onRollCheck}>Check</button>
        <button className="mini-roll-button" type="button" onClick={onRollSave}>Save</button>
      </div>
    </article>
  );
}
