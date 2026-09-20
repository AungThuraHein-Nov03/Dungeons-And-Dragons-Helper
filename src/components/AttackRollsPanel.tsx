import { useState } from 'react';
import type { RollMode } from '../dice/types';
import type { DerivedWeaponAttack, WeaponDamageMode } from '../rules/types';
import { formatModifier } from '../utils/ability';
import { formatDerivedDamage, formatWeaponProperty } from '../utils/contentFormat';
import { WeaponRollControls } from './WeaponRollControls';

const ABILITY_SHORT = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
} as const;

interface AttackRollsPanelProps {
  attacks: readonly DerivedWeaponAttack[];
  onAttack: (attack: DerivedWeaponAttack, mode: RollMode) => void;
  onDamage: (attack: DerivedWeaponAttack, damageMode: WeaponDamageMode, critical: boolean) => void;
}

function attackIdentity(attack: DerivedWeaponAttack, index: number): string {
  return attack.inventoryEntryId ?? `${attack.weaponId}:${attack.useMode}:${index}`;
}

function attackEntries(attacks: readonly DerivedWeaponAttack[]) {
  const nameTotals = new Map<string, number>();
  for (const attack of attacks) nameTotals.set(attack.name, (nameTotals.get(attack.name) ?? 0) + 1);

  const nameSeen = new Map<string, number>();
  return attacks.map((attack, index) => {
    const occurrence = (nameSeen.get(attack.name) ?? 0) + 1;
    nameSeen.set(attack.name, occurrence);
    return {
      attack,
      key: attackIdentity(attack, index),
      label: (nameTotals.get(attack.name) ?? 0) > 1 ? `${attack.name} (${occurrence})` : attack.name,
    };
  });
}

export function AttackRollsPanel({ attacks, onAttack, onDamage }: AttackRollsPanelProps) {
  const entries = attackEntries(attacks);
  const [selectedKey, setSelectedKey] = useState<string>(() => entries[0]?.key ?? '');
  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? entries[0];

  return (
    <section className="panel play-attack-rolls" aria-labelledby="attack-rolls-heading">
      <div className="section-heading">
        <span className="eyebrow">Equipped Weapon</span>
        <h2 id="attack-rolls-heading">Attack Rolls</h2>
      </div>

      {!selectedEntry ? (
        <p className="play-attack-rolls__empty">No equipped weapon. Open Inventory to equip one.</p>
      ) : (
        <>
          {entries.length > 1 && (
            <label className="field compact-field play-attack-rolls__selector" htmlFor="play-attack-weapon">
              <span>Weapon</span>
              <select
                id="play-attack-weapon"
                value={selectedEntry.key}
                onChange={(event) => setSelectedKey(event.target.value)}
              >
                {entries.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
              </select>
            </label>
          )}

          <article className="attack-card attack-card--compact play-attack-rolls__card">
            <div className="attack-card__header">
              <h3>{selectedEntry.attack.name}</h3>
              <strong>{formatModifier(selectedEntry.attack.attackModifier)} to hit</strong>
            </div>

            <div className="attack-card__quick-meta" aria-label={`${selectedEntry.attack.name} quick attack reference`}>
              <strong>{formatDerivedDamage(selectedEntry.attack.damage)}</strong>
              <span aria-hidden="true">•</span>
              <span>{ABILITY_SHORT[selectedEntry.attack.attackAbility]}</span>
              <span aria-hidden="true">•</span>
              <span>{selectedEntry.attack.mastery.name}</span>
            </div>

            <WeaponRollControls
              key={selectedEntry.key}
              attack={selectedEntry.attack}
              onAttack={(mode) => onAttack(selectedEntry.attack, mode)}
              onDamage={(damageMode, critical) => onDamage(selectedEntry.attack, damageMode, critical)}
            />

            <details className="attack-card__details">
              <summary>Details</summary>
              <dl className="detail-list attack-card__detail-list">
                <div><dt>Proficiency</dt><dd>{selectedEntry.attack.proficient ? 'Proficient' : 'Not Proficient'}</dd></div>
                <div><dt>Properties</dt><dd>{selectedEntry.attack.properties.length ? selectedEntry.attack.properties.map(formatWeaponProperty).join(', ') : 'None'}</dd></div>
                <div><dt>Mastery Availability</dt><dd>{selectedEntry.attack.mastery.canPotentiallyUse ? 'Available to class progression' : 'Not unlocked by known class data'}</dd></div>
                <div><dt>Use Mode</dt><dd>{selectedEntry.attack.useMode[0].toUpperCase() + selectedEntry.attack.useMode.slice(1)}</dd></div>
              </dl>
              {selectedEntry.attack.damageConfigurations.length > 1 && (
                <div className="alternate-damage">
                  <span>Valid damage configurations</span>
                  {selectedEntry.attack.damageConfigurations.map((damage) => (
                    <small key={damage.mode}>{damage.mode}: {formatDerivedDamage(damage)}</small>
                  ))}
                </div>
              )}
            </details>
          </article>
        </>
      )}
    </section>
  );
}
