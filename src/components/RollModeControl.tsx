import type { RollMode } from '../dice/types';

interface RollModeControlProps {
  mode: RollMode;
  onChange: (mode: RollMode) => void;
  compact?: boolean;
  ariaLabel?: string;
}

export function RollModeControl({ mode, onChange, compact = false, ariaLabel = 'd20 roll mode' }: RollModeControlProps) {
  const buttons = (
    <div className="roll-mode__buttons">
      {(['normal', 'advantage', 'disadvantage'] as const).map((option) => (
        <button key={option} type="button" className="roll-toggle" aria-pressed={mode === option} onClick={() => onChange(option)}>
          {option === 'normal' ? 'Normal' : option === 'advantage' ? 'Advantage' : 'Disadvantage'}
        </button>
      ))}
    </div>
  );

  if (compact) return <div className="roll-mode-inline" role="group" aria-label={ariaLabel}>{buttons}</div>;

  return (
    <section className="roll-mode panel" aria-label={ariaLabel}>
      <div><span className="eyebrow">d20 Roll Mode</span><strong>{mode === 'normal' ? 'Normal' : mode === 'advantage' ? 'Advantage' : 'Disadvantage'}</strong></div>
      {buttons}
    </section>
  );
}
