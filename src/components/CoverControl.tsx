import type { CoverLevel } from '../rules/cover';

interface CoverControlProps {
  cover: CoverLevel;
  onChange: (cover: CoverLevel) => void;
  compact?: boolean;
}

const OPTIONS: readonly { value: CoverLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'half', label: 'Half +2' },
  { value: 'three-quarters', label: '3/4 +5' },
  { value: 'total', label: 'Total' },
];

export function CoverControl({ cover, onChange, compact = false }: CoverControlProps) {
  return (
    <div className={compact ? 'cover-control cover-control--compact' : 'cover-control'} role="group" aria-label="Cover">
      {!compact && <span className="eyebrow">Cover</span>}
      <div className="roll-mode__buttons">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="roll-toggle"
            aria-pressed={cover === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
