import { useState } from 'react';
import type { RollMode } from '../dice/types';
import type { DerivedWeaponAttack, WeaponDamageMode } from '../rules/types';
import { RollModeControl } from './RollModeControl';

interface WeaponRollControlsProps {
  attack: DerivedWeaponAttack;
  onAttack: (mode: RollMode) => void;
  onDamage: (damageMode: WeaponDamageMode, critical: boolean) => void;
}

export function WeaponRollControls({ attack, onAttack, onDamage }: WeaponRollControlsProps) {
  const initialMode = attack.damageConfigurations[0]?.mode ?? 'standard';
  const [attackRollMode, setAttackRollMode] = useState<RollMode>('normal');
  const [damageMode, setDamageMode] = useState<WeaponDamageMode>(initialMode);
  const [critical, setCritical] = useState(false);

  return (
    <div className="weapon-roll-controls">
      <div className="weapon-roll-controls__attack">
        <RollModeControl compact ariaLabel={`${attack.name} attack roll mode`} mode={attackRollMode} onChange={setAttackRollMode} />
        <button className="button button--secondary" type="button" onClick={() => onAttack(attackRollMode)}>Roll Attack ({attackRollMode === 'normal' ? 'Normal' : attackRollMode === 'advantage' ? 'Adv' : 'Dis'})</button>
      </div>
      {attack.damageConfigurations.length > 1 && (
        <label className="field compact-field" htmlFor={`damage-mode-${attack.weaponId}`}><span>Damage configuration</span><select id={`damage-mode-${attack.weaponId}`} value={damageMode} onChange={(event) => setDamageMode(event.target.value as WeaponDamageMode)}>{attack.damageConfigurations.map((configuration) => <option key={configuration.mode} value={configuration.mode}>{configuration.mode === 'one-handed' ? 'One-Handed' : configuration.mode === 'two-handed' ? 'Two-Handed' : 'Standard'}</option>)}</select></label>
      )}
      <div className="damage-mode-control" aria-label={`${attack.name} damage mode`}>
        <button type="button" className="roll-toggle" aria-pressed={!critical} onClick={() => setCritical(false)}>Normal</button>
        <button type="button" className="roll-toggle" aria-pressed={critical} onClick={() => setCritical(true)}>Critical</button>
      </div>
      <button className="button button--primary" type="button" onClick={() => onDamage(damageMode, critical)}>Roll {critical ? 'Critical ' : ''}Damage</button>
    </div>
  );
}
