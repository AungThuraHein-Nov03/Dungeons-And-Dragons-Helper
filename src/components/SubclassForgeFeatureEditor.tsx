import { useState } from 'react';
import type { AbilityKey } from '../models/character';
import type {
  ActiveSelfEffectDefinition,
  LeveledSpellLevel,
  ResourceConsumerEffect,
  SpellContent,
  SpellListReference,
  SpellcastingProviderDefinition,
} from '../models/content';
import type { ContentId } from '../models/contentId';
import {
  DICE_TRANSFORMATION_LABELS,
  FeatForgeDiceEffectEditor,
  FeatForgeStaticEffectEditor,
  STATIC_EFFECT_LABELS,
} from './FeatForgeEffectEditors';
import { createDiceEffectDraft, createStaticEffectDraft, type FeatForgeDiceTransformationType, type FeatForgeStaticEffectType } from './featForgeModel';
import {
  abilityOptions,
  createProviderSlotPool,
  createSubclassActiveEffectDraft,
  createSubclassConsumerDraft,
  createSubclassProviderDraft,
  createSubclassReferenceEffectDraft,
  createSubclassResourceDraft,
  createSubclassSpellGrantDraft,
  createSubclassTransactionDraft,
  draftProviderOptions,
  draftResourceOptions,
  leveledSpellLevels,
  providerContributionKey,
  providerSpellListId,
  replaceProviderContribution,
  replaceProviderManagementKind,
  type SubclassForgeActiveEffectDraft,
  type SubclassForgeConsumerDraft,
  type SubclassForgeDraft,
  type SubclassForgeFeatureDraft,
  type SubclassForgeProviderContribution,
  type SubclassForgeProviderDraft,
  type SubclassForgeReferenceEffectDraft,
  type SubclassForgeResourceDraft,
  type SubclassForgeSpellGrantDraft,
  type SubclassForgeTransactionDraft,
} from './subclassForgeModel';
import { contentRegistry } from '../services/contentRegistry';

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

function replaceByDraftId<T extends { readonly draftId: string }>(
  values: readonly T[],
  next: T,
): T[] {
  return values.map((value) => value.draftId === next.draftId ? next : value);
}

function removeByDraftId<T extends { readonly draftId: string }>(
  values: readonly T[],
  draftId: string,
): T[] {
  return values.filter((value) => value.draftId !== draftId);
}

function ResourceEditor({
  entry,
  featureLevel,
  onChange,
  onRemove,
}: {
  entry: SubclassForgeResourceDraft;
  featureLevel: number;
  onChange: (entry: SubclassForgeResourceDraft) => void;
  onRemove: () => void;
}) {
  const definition = entry.definition;
  const abilityMaximum = definition.maximum.kind === 'ability-modifier' ? definition.maximum : undefined;
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div>
          <span className="eyebrow">Automated Resource</span>
          <h3>{definition.name || 'Unnamed resource'}</h3>
          <small className="forge-identity">{definition.id}</small>
        </div>
        <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={onRemove}>
          {entry.persisted ? 'Identity locked on Edit' : 'Remove resource'}
        </button>
      </div>
      <div className="field-grid field-grid--two">
        <label className="field">
          <span>Resource name</span>
          <input value={definition.name} onChange={(event) => onChange({ ...entry, definition: { ...definition, name: event.target.value } })} />
        </label>
        <label className="field">
          <span>Presentation</span>
          <select value={definition.presentation ?? 'pips'} onChange={(event) => onChange({ ...entry, definition: { ...definition, presentation: event.target.value as 'pips' | 'numeric' } })}>
            <option value="pips">Pips</option>
            <option value="numeric">Numeric</option>
          </select>
        </label>
      </div>

      <label className="field forge-field-small">
        <span>Capacity model</span>
        <select
          disabled={entry.persisted}
          value={definition.maximum.kind}
          onChange={(event) => onChange({
            ...entry,
            definition: {
              ...definition,
              maximum: event.target.value === 'ability-modifier'
                ? { kind: 'ability-modifier', ability: 'charisma', minimum: 1, minimumLevel: featureLevel }
                : { kind: 'level-table', values: [{ level: featureLevel, uses: 1 }] },
            },
          })}
        >
          <option value="level-table">Owner-level table</option>
          <option value="ability-modifier">Ability modifier</option>
        </select>
      </label>

      {definition.maximum.kind === 'level-table' ? (
        <div className="forge-level-table">
          {definition.maximum.values.map((row, index) => (
            <div className="forge-level-table__row" key={index}>
              <label className="field"><span>Owner level</span><input type="number" min={featureLevel} max="20" disabled={entry.persisted} value={row.level} onChange={(event) => onChange({ ...entry, definition: { ...definition, maximum: { kind: 'level-table', values: definition.maximum.kind === 'level-table' ? definition.maximum.values.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, level: Number(event.target.value) } : candidate) : [] } } })} /></label>
              <label className="field"><span>Maximum uses</span><input type="number" min="0" disabled={entry.persisted} value={row.uses} onChange={(event) => onChange({ ...entry, definition: { ...definition, maximum: { kind: 'level-table', values: definition.maximum.kind === 'level-table' ? definition.maximum.values.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, uses: Number(event.target.value) } : candidate) : [] } } })} /></label>
              <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={() => onChange({ ...entry, definition: { ...definition, maximum: { kind: 'level-table', values: definition.maximum.kind === 'level-table' ? definition.maximum.values.filter((_, candidateIndex) => candidateIndex !== index) : [] } } })}>Remove row</button>
            </div>
          ))}
          <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={() => {
            const rows = definition.maximum.kind === 'level-table' ? definition.maximum.values : [];
            const last = rows.at(-1)?.level ?? featureLevel - 1;
            onChange({ ...entry, definition: { ...definition, maximum: { kind: 'level-table', values: [...rows, { level: Math.min(20, Math.max(featureLevel, last + 1)), uses: 1 }] } } });
          }}>Add capacity row</button>
        </div>
      ) : (
        <div className="field-grid field-grid--two">
          <label className="field">
            <span>Ability</span>
            <select value={abilityMaximum?.ability ?? 'charisma'} onChange={(event) => abilityMaximum && onChange({ ...entry, definition: { ...definition, maximum: { ...abilityMaximum, ability: event.target.value as AbilityKey } } })}>
              {abilityOptions().map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Minimum uses</span>
            <input type="number" min="0" value={abilityMaximum?.minimum ?? 0} onChange={(event) => abilityMaximum && onChange({ ...entry, definition: { ...definition, maximum: { ...abilityMaximum, minimum: Number(event.target.value) } } })} />
          </label>
        </div>
      )}

      <div className="forge-editor-list">
        {definition.recovery.map((rule, index) => (
          <div className="forge-level-table__row" key={index}>
            <label className="field">
              <span>Recovery trigger</span>
              <select value={rule.trigger} disabled={entry.persisted} onChange={(event) => {
                const recovery = definition.recovery.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, trigger: event.target.value as 'short-rest' | 'long-rest' } : candidate);
                onChange({ ...entry, definition: { ...definition, recovery } });
              }}>
                <option value="short-rest">Short Rest</option>
                <option value="long-rest">Long Rest</option>
              </select>
            </label>
            <label className="field">
              <span>Recovery mode</span>
              <select value={rule.mode} disabled={entry.persisted} onChange={(event) => {
                const next = event.target.value === 'all'
                  ? { trigger: rule.trigger, mode: 'all' as const, ...(rule.minimumLevel ? { minimumLevel: rule.minimumLevel } : {}) }
                  : { trigger: rule.trigger, mode: 'amount' as const, amount: 1, ...(rule.minimumLevel ? { minimumLevel: rule.minimumLevel } : {}) };
                onChange({ ...entry, definition: { ...definition, recovery: definition.recovery.map((candidate, candidateIndex) => candidateIndex === index ? next : candidate) } });
              }}>
                <option value="all">Recover all</option>
                <option value="amount">Recover amount</option>
              </select>
            </label>
            {rule.mode === 'amount' ? <label className="field"><span>Amount</span><input type="number" min="1" disabled={entry.persisted} value={rule.amount} onChange={(event) => onChange({ ...entry, definition: { ...definition, recovery: definition.recovery.map((candidate, candidateIndex) => candidateIndex === index && candidate.mode === 'amount' ? { ...candidate, amount: Number(event.target.value) } : candidate) } })} /></label> : <span />}
            <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={() => onChange({ ...entry, definition: { ...definition, recovery: definition.recovery.filter((_, candidateIndex) => candidateIndex !== index) } })}>Remove recovery</button>
          </div>
        ))}
      </div>
      <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={() => onChange({ ...entry, definition: { ...definition, recovery: [...definition.recovery, { trigger: definition.recovery.some((rule) => rule.trigger === 'long-rest') ? 'short-rest' : 'long-rest', mode: 'all' }] } })}>Add recovery rule</button>
    </article>
  );
}

function ConsumerEditor({
  entry,
  resourceOptions,
  onChange,
  onRemove,
}: {
  entry: SubclassForgeConsumerDraft;
  resourceOptions: readonly { id: ContentId; name: string }[];
  onChange: (entry: SubclassForgeConsumerDraft) => void;
  onRemove: () => void;
}) {
  const effect = entry.grant.consumer.effect;
  const replaceEffect = (type: ResourceConsumerEffect['type']): ResourceConsumerEffect => {
    if (type === 'manual-healing') return { type, die: 10, bonus: 'class-level' };
    if (type === 'fixed-expend') return { type, amount: 1 };
    return { type };
  };
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div><span className="eyebrow">Automated Action</span><h3>{entry.grant.consumer.name || 'Unnamed consumer'}</h3><small className="forge-identity">{entry.grant.consumer.id}</small></div>
        <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={onRemove}>{entry.persisted ? 'Identity locked on Edit' : 'Remove consumer'}</button>
      </div>
      <div className="field-grid field-grid--two">
        <label className="field"><span>Action name</span><input value={entry.grant.consumer.name} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, consumer: { ...entry.grant.consumer, name: event.target.value } } })} /></label>
        <label className="field"><span>Resource</span><select value={entry.grant.resourceId} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, resourceId: event.target.value } })}>{resourceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label className="field"><span>Consumer behavior</span><select value={effect.type} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, consumer: { ...entry.grant.consumer, effect: replaceEffect(event.target.value as ResourceConsumerEffect['type']) } } })}>
          <option value="expend-only">Expend one</option>
          <option value="fixed-expend">Fixed expenditure</option>
          <option value="variable-expend">Variable expenditure</option>
          <option value="tracking-only">Conditional/tracking-only expenditure</option>
          <option value="manual-healing">Manual healing roll</option>
        </select></label>
        {effect.type === 'fixed-expend' && <label className="field"><span>Cost</span><input type="number" min="1" value={effect.amount} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, consumer: { ...entry.grant.consumer, effect: { ...effect, amount: Number(event.target.value) } } } })} /></label>}
        {effect.type === 'manual-healing' && <label className="field"><span>Healing die</span><select value={effect.die} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, consumer: { ...entry.grant.consumer, effect: { ...effect, die: Number(event.target.value) as 4 | 6 | 8 | 10 | 12 } } } })}>{[4,6,8,10,12].map((die) => <option key={die} value={die}>d{die}</option>)}</select></label>}
      </div>
    </article>
  );
}

function TransactionEditor({
  entry,
  resourceOptions,
  providerOptions,
  onChange,
  onRemove,
}: {
  entry: SubclassForgeTransactionDraft;
  resourceOptions: readonly { id: ContentId; name: string }[];
  providerOptions: readonly { id: ContentId; name: string }[];
  onChange: (entry: SubclassForgeTransactionDraft) => void;
  onRemove: () => void;
}) {
  const definition = entry.definition;
  const defaultResourceId = resourceOptions[0]?.id ?? '';
  const defaultProviderId = providerOptions[0]?.id ?? '';
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div><span className="eyebrow">Automated Transaction</span><h3>{definition.name || 'Unnamed transaction'}</h3><small className="forge-identity">{definition.id}</small></div>
        <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={onRemove}>{entry.persisted ? 'Identity locked on Edit' : 'Remove transaction'}</button>
      </div>
      <div className="field-grid field-grid--two">
        <label className="field"><span>Name</span><input value={definition.name} onChange={(event) => onChange({ ...entry, definition: { ...definition, name: event.target.value } })} /></label>
        <label className="field"><span>Transaction kind</span><select value={definition.kind} onChange={(event) => onChange({
          ...entry,
          definition: event.target.value === 'restore-resource'
            ? { id: definition.id, name: definition.name, kind: 'restore-resource', targetResourceId: defaultResourceId, restore: { kind: 'fixed', amount: 1 } }
            : { id: definition.id, name: definition.name, kind: 'restore-spell-slots-with-budget', providerId: defaultProviderId, usageResourceId: defaultResourceId, budget: { kind: 'half-level-round-up' }, maximumSpellLevel: 5, timing: 'short-rest' },
        })}>
          <option value="restore-resource">Restore resource</option>
          <option value="restore-spell-slots-with-budget">Restore spell slots with half-level budget</option>
        </select></label>
      </div>
      {definition.kind === 'restore-resource' ? (
        <div className="field-grid field-grid--two">
          <label className="field"><span>Target resource</span><select value={definition.targetResourceId} onChange={(event) => onChange({ ...entry, definition: { ...definition, targetResourceId: event.target.value } })}>{resourceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label className="field"><span>Usage resource (optional)</span><select value={definition.usageResourceId ?? ''} onChange={(event) => onChange({ ...entry, definition: { ...definition, ...(event.target.value ? { usageResourceId: event.target.value } : { usageResourceId: undefined }) } })}><option value="">No separate use limit</option>{resourceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label className="field"><span>Restore mode</span><select value={definition.restore.kind} onChange={(event) => onChange({ ...entry, definition: { ...definition, restore: event.target.value === 'fixed' ? { kind: 'fixed', amount: 1 } : { kind: 'selected', maximum: 1 } } })}><option value="fixed">Fixed amount</option><option value="selected">Player-selected amount</option></select></label>
          <label className="field"><span>{definition.restore.kind === 'fixed' ? 'Amount' : 'Maximum'}</span><input type="number" min="1" value={definition.restore.kind === 'fixed' ? definition.restore.amount : definition.restore.maximum} onChange={(event) => onChange({ ...entry, definition: { ...definition, restore: definition.restore.kind === 'fixed' ? { kind: 'fixed', amount: Number(event.target.value) } : { kind: 'selected', maximum: Number(event.target.value) } } })} /></label>
        </div>
      ) : (
        <div className="field-grid field-grid--two">
          <label className="field"><span>Spellcasting provider</span><select value={definition.providerId} onChange={(event) => onChange({ ...entry, definition: { ...definition, providerId: event.target.value } })}>{providerOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label className="field"><span>Usage resource</span><select value={definition.usageResourceId} onChange={(event) => onChange({ ...entry, definition: { ...definition, usageResourceId: event.target.value } })}>{resourceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label className="field"><span>Maximum slot level</span><select value={definition.maximumSpellLevel} onChange={(event) => onChange({ ...entry, definition: { ...definition, maximumSpellLevel: Number(event.target.value) as LeveledSpellLevel } })}>{leveledSpellLevels().map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
          <div className="forge-reference-note">Budget is the existing half owner-level rounded-up contract; timing is the existing Short Rest contract.</div>
        </div>
      )}
    </article>
  );
}

type ActiveModifier = NonNullable<ActiveSelfEffectDefinition['modifiers']>[number];

function defaultActiveModifier(type: ActiveModifier['type'], providerId?: ContentId): ActiveModifier {
  if (type === 'spell-save-dc-bonus') return { type, providerIds: providerId ? [providerId] : [], amount: 1 };
  if (type === 'weapon-damage-bonus') return { type, abilities: ['strength'], amount: { kind: 'fixed', amount: 1 } };
  return { type: 'd20-roll-mode', mode: 'advantage', target: { kind: 'ability-check', abilities: ['strength'] } };
}

function ActiveEffectEditor({
  entry,
  resourceOptions,
  providerOptions,
  onChange,
  onRemove,
}: {
  entry: SubclassForgeActiveEffectDraft;
  resourceOptions: readonly { id: ContentId; name: string }[];
  providerOptions: readonly { id: ContentId; name: string }[];
  onChange: (entry: SubclassForgeActiveEffectDraft) => void;
  onRemove: () => void;
}) {
  const definition = entry.definition;
  const modifiers = definition.modifiers ?? [];
  const updateModifier = (index: number, modifier: ActiveModifier) => onChange({
    ...entry,
    definition: { ...definition, modifiers: modifiers.map((candidate, candidateIndex) => candidateIndex === index ? modifier : candidate) },
  });
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div><span className="eyebrow">Automated Self Effect</span><h3>{definition.name || 'Unnamed self effect'}</h3><small className="forge-identity">{definition.id}</small></div>
        <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={onRemove}>{entry.persisted ? 'Identity locked on Edit' : 'Remove self effect'}</button>
      </div>
      <div className="field-grid field-grid--two">
        <label className="field"><span>Name</span><input value={definition.name} onChange={(event) => onChange({ ...entry, definition: { ...definition, name: event.target.value } })} /></label>
        <label className="field"><span>Activation</span><select value={definition.activationTiming} onChange={(event) => onChange({ ...entry, definition: { ...definition, activationTiming: event.target.value as ActiveSelfEffectDefinition['activationTiming'] } })}><option value="bonus-action">Bonus Action</option><option value="start-of-turn">Start of turn</option><option value="manual">Manual</option></select></label>
      </div>
      <label className="field forge-field-block"><span>Description</span><textarea rows={2} value={definition.description} onChange={(event) => onChange({ ...entry, definition: { ...definition, description: event.target.value } })} /></label>
      <label className="forge-check forge-check--standalone"><input type="checkbox" checked={Boolean(definition.activationCost)} onChange={(event) => onChange({ ...entry, definition: { ...definition, activationCost: event.target.checked && resourceOptions[0] ? { resourceId: resourceOptions[0].id, amount: 1 } : undefined } })} /><span>Spend a resource to activate</span></label>
      {definition.activationCost && <div className="field-grid field-grid--two">
        <label className="field"><span>Activation resource</span><select value={definition.activationCost.resourceId} onChange={(event) => onChange({ ...entry, definition: { ...definition, activationCost: { ...definition.activationCost!, resourceId: event.target.value } } })}>{resourceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label className="field"><span>Cost</span><input type="number" min="1" value={definition.activationCost.amount} onChange={(event) => onChange({ ...entry, definition: { ...definition, activationCost: { ...definition.activationCost!, amount: Number(event.target.value) } } })} /></label>
      </div>}

      <div className="forge-editor-list">
        {modifiers.map((modifier, index) => (
          <div className="forge-editor-row" key={index}>
            <div className="field-grid field-grid--two">
              <label className="field"><span>Modifier type</span><select value={modifier.type} onChange={(event) => updateModifier(index, defaultActiveModifier(event.target.value as ActiveModifier['type'], providerOptions[0]?.id))}><option value="d20-roll-mode">D20 roll mode</option><option value="spell-save-dc-bonus">Spell Save DC bonus</option><option value="weapon-damage-bonus">Weapon damage bonus</option></select></label>
              {modifier.type === 'd20-roll-mode' && <label className="field"><span>Mode</span><select value={modifier.mode} onChange={(event) => updateModifier(index, { ...modifier, mode: event.target.value as 'advantage' | 'disadvantage' })}><option value="advantage">Advantage</option><option value="disadvantage">Disadvantage</option></select></label>}
            </div>
            {modifier.type === 'd20-roll-mode' && (
              <div className="field-grid field-grid--two">
                <label className="field"><span>Target</span><select value={modifier.target.kind} onChange={(event) => {
                  const kind = event.target.value;
                  const target = kind === 'spell-attack'
                    ? { kind: 'spell-attack' as const, providerIds: providerOptions[0] ? [providerOptions[0].id] : [] }
                    : { kind: kind as 'ability-check' | 'saving-throw' | 'weapon-attack', abilities: ['strength' as AbilityKey] };
                  updateModifier(index, { ...modifier, target });
                }}><option value="ability-check">Ability check</option><option value="saving-throw">Saving throw</option><option value="weapon-attack">Weapon attack</option><option value="spell-attack">Spell attack</option></select></label>
                {modifier.target.kind === 'spell-attack'
                  ? <label className="field"><span>Provider</span><select value={modifier.target.providerIds[0] ?? ''} onChange={(event) => {
                    if (modifier.target.kind !== 'spell-attack') return;
                    updateModifier(index, { ...modifier, target: { kind: 'spell-attack', providerIds: [event.target.value] } });
                  }}>{providerOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
                  : <label className="field"><span>Ability</span><select value={modifier.target.abilities[0] ?? 'strength'} onChange={(event) => {
                    if (modifier.target.kind === 'spell-attack') return;
                    updateModifier(index, { ...modifier, target: { kind: modifier.target.kind, abilities: [event.target.value as AbilityKey] } });
                  }}>{abilityOptions().map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label>}
              </div>
            )}
            {modifier.type === 'spell-save-dc-bonus' && <div className="field-grid field-grid--two"><label className="field"><span>Provider</span><select value={modifier.providerIds[0] ?? ''} onChange={(event) => updateModifier(index, { ...modifier, providerIds: [event.target.value] })}>{providerOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label className="field"><span>DC bonus</span><input type="number" value={modifier.amount} onChange={(event) => updateModifier(index, { ...modifier, amount: Number(event.target.value) })} /></label></div>}
            {modifier.type === 'weapon-damage-bonus' && <div className="field-grid field-grid--two"><label className="field"><span>Attack ability</span><select value={modifier.abilities[0] ?? 'strength'} onChange={(event) => updateModifier(index, { ...modifier, abilities: [event.target.value as AbilityKey] })}>{abilityOptions().map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label><label className="field"><span>Fixed damage bonus</span><input type="number" value={modifier.amount.kind === 'fixed' ? modifier.amount.amount : 1} onChange={(event) => updateModifier(index, { ...modifier, amount: { kind: 'fixed', amount: Number(event.target.value) } })} /></label></div>}
            <button className="button button--secondary" type="button" onClick={() => onChange({ ...entry, definition: { ...definition, modifiers: modifiers.filter((_, candidateIndex) => candidateIndex !== index) } })}>Remove modifier</button>
          </div>
        ))}
      </div>
      <button className="button button--secondary" type="button" onClick={() => onChange({ ...entry, definition: { ...definition, modifiers: [...modifiers, defaultActiveModifier('d20-roll-mode')] } })}>Add modifier</button>

      <div className="forge-inline-actions">
        <label className="forge-check"><input type="checkbox" checked={(definition.restrictions ?? []).some((restriction) => restriction.type === 'concentration')} onChange={(event) => {
          const rest = (definition.restrictions ?? []).filter((restriction) => restriction.type !== 'concentration');
          onChange({ ...entry, definition: { ...definition, restrictions: event.target.checked ? [...rest, { type: 'concentration', mode: 'end-and-block' as const }] : rest } });
        }} /><span>End/block Concentration</span></label>
        <label className="forge-check"><input type="checkbox" checked={(definition.restrictions ?? []).some((restriction) => restriction.type === 'spellcasting')} onChange={(event) => {
          const rest = (definition.restrictions ?? []).filter((restriction) => restriction.type !== 'spellcasting');
          onChange({ ...entry, definition: { ...definition, restrictions: event.target.checked ? [...rest, { type: 'spellcasting', mode: 'block' as const }] : rest } });
        }} /><span>Block Spellcasting</span></label>
        <label className="forge-check"><input type="checkbox" checked={(definition.termination ?? []).some((termination) => termination.type === 'condition')} onChange={(event) => {
          const term = (definition.termination ?? []).filter((termination) => termination.type !== 'condition');
          onChange({ ...entry, definition: { ...definition, termination: event.target.checked ? [...term, { type: 'condition', condition: 'incapacitated' as const }] : term } });
        }} /><span>End when Incapacitated</span></label>
      </div>
      <label className="field forge-field-small"><span>Clear on Rest</span><select value={definition.clearOnRest ?? ''} onChange={(event) => onChange({ ...entry, definition: { ...definition, clearOnRest: event.target.value ? event.target.value as 'short-rest' | 'long-rest' : undefined } })}><option value="">No automatic rest clear</option><option value="short-rest">Short Rest</option><option value="long-rest">Long Rest</option></select></label>
    </article>
  );
}

function CountTableEditor({
  label,
  values,
  minimumLevel,
  onChange,
}: {
  label: string;
  values: readonly { level: number; count: number }[];
  minimumLevel: number;
  onChange: (values: readonly { level: number; count: number }[]) => void;
}) {
  return <div className="forge-level-table">
    <strong>{label}</strong>
    {values.map((row, index) => <div className="forge-level-table__row" key={index}><label className="field"><span>Owner level</span><input type="number" min={minimumLevel} max="20" value={row.level} onChange={(event) => onChange(values.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, level: Number(event.target.value) } : candidate))} /></label><label className="field"><span>Count</span><input type="number" min="0" value={row.count} onChange={(event) => onChange(values.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, count: Number(event.target.value) } : candidate))} /></label><button className="button button--secondary" type="button" onClick={() => onChange(values.filter((_, candidateIndex) => candidateIndex !== index))}>Remove row</button></div>)}
    <button className="button button--secondary" type="button" onClick={() => onChange([...values, { level: Math.min(20, (values.at(-1)?.level ?? minimumLevel - 1) + 1), count: 1 }])}>Add row</button>
  </div>;
}

function ProviderEditor({
  entry,
  featureLevel,
  spellLists,
  spells,
  onChange,
  onRemove,
}: {
  entry: SubclassForgeProviderDraft;
  featureLevel: number;
  spellLists: readonly SpellListReference[];
  spells: readonly SpellContent[];
  onChange: (entry: SubclassForgeProviderDraft) => void;
  onRemove: () => void;
}) {
  const definition = entry.definition;
  const management = definition.spellManagement;
  const contribution = providerContributionKey(definition.multiclassSlotContribution);
  const listId = providerSpellListId(definition) || spellLists[0]?.id || '';
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div><span className="eyebrow">Automated Spellcasting Provider</span><h3>{definition.name || 'Unnamed provider'}</h3><small className="forge-identity">{definition.id}</small></div>
        <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={onRemove}>{entry.persisted ? 'Identity locked on Edit' : 'Remove provider'}</button>
      </div>
      <div className="field-grid field-grid--two">
        <label className="field"><span>Provider name</span><input value={definition.name} onChange={(event) => onChange({ ...entry, definition: { ...definition, name: event.target.value } })} /></label>
        <label className="field"><span>Spellcasting ability</span><select value={definition.spellcastingAbility.ability} onChange={(event) => onChange({ ...entry, definition: { ...definition, spellcastingAbility: { kind: 'fixed', ability: event.target.value as AbilityKey } } })}>{abilityOptions().map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label>
        <label className="field"><span>Multiclass slot contribution</span><select disabled={entry.persisted} value={contribution} onChange={(event) => onChange(replaceProviderContribution(entry, event.target.value as SubclassForgeProviderContribution, featureLevel))}><option value="full">Ordinary full</option><option value="half-up">Ordinary half, round up</option><option value="third-down">Ordinary third, round down</option><option value="pact">Pact Magic</option><option value="independent">Independent</option></select></label>
        <label className="field"><span>Ritual policy</span><select value={definition.ritualCasting} onChange={(event) => onChange({ ...entry, definition: { ...definition, ritualCasting: event.target.value as SpellcastingProviderDefinition['ritualCasting'] } })}><option value="none">None</option><option value="prepared">Prepared spells</option><option value="owned" disabled={management.kind !== 'prepared-from-owned'}>Owned spells</option></select></label>
        <label className="field"><span>Spell management</span><select disabled={entry.persisted} value={management.kind} onChange={(event) => onChange(replaceProviderManagementKind(entry, event.target.value as SpellcastingProviderDefinition['spellManagement']['kind'], listId))}><option value="prepared-from-list">Prepared from list</option><option value="prepared-from-owned">Prepared from owned</option><option value="granted-only">Granted only</option></select></label>
      </div>

      {management.kind === 'granted-only' ? (
        <label className="field forge-field-block"><span>Granted provider Spells</span><select multiple aria-label="Provider granted-only spells" value={[...management.spellIds]} onChange={(event) => onChange({ ...entry, definition: { ...definition, spellManagement: { kind: 'granted-only', spellIds: [...event.currentTarget.selectedOptions].map((option) => option.value) } } })}>{spells.map((spell) => <option key={spell.id} value={spell.id}>{spell.name} · {spell.level === 0 ? 'Cantrip' : 'Level ' + spell.level}</option>)}</select></label>
      ) : (
        <>
          <label className="field forge-field-small"><span>Spell list</span><select value={management.spellListId} onChange={(event) => onChange({ ...entry, definition: { ...definition, spellManagement: { ...management, spellListId: event.target.value } } })}>{spellLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
          <CountTableEditor label="Cantrip capacity" values={management.cantripCount} minimumLevel={featureLevel} onChange={(cantripCount) => onChange({ ...entry, definition: { ...definition, spellManagement: { ...management, cantripCount } } })} />
          <CountTableEditor label="Prepared capacity" values={management.preparedSpellCount} minimumLevel={featureLevel} onChange={(preparedSpellCount) => onChange({ ...entry, definition: { ...definition, spellManagement: { ...management, preparedSpellCount } } })} />
          <label className="field forge-field-small"><span>Replacement policy</span><select value={management.replacement} onChange={(event) => onChange({ ...entry, definition: { ...definition, spellManagement: { ...management, replacement: event.target.value as typeof management.replacement } } })}><option value="long-rest-any">Long Rest: any</option><option value="long-rest-one">Long Rest: one</option><option value="class-level-one">Class level: one</option></select></label>
          {management.kind === 'prepared-from-owned' && <div className="field-grid field-grid--two"><label className="field"><span>Initial owned spells</span><input type="number" min="1" value={management.initialOwnedSpellCount} onChange={(event) => onChange({ ...entry, definition: { ...definition, spellManagement: { ...management, initialOwnedSpellCount: Number(event.target.value) } } })} /></label><label className="field"><span>Initial owned Spell level</span><select value={management.initialOwnedSpellLevel} onChange={(event) => onChange({ ...entry, definition: { ...definition, spellManagement: { ...management, initialOwnedSpellLevel: Number(event.target.value) as LeveledSpellLevel } } })}>{leveledSpellLevels().map((level) => <option key={level} value={level}>{level}</option>)}</select></label></div>}
        </>
      )}

      {(contribution === 'pact' || contribution === 'independent') && definition.slotPool && (
        <div className="forge-subsection">
          <h4>Provider-local slot pool</h4>
          <div className="field-grid field-grid--two">
            <label className="field"><span>Pool name</span><input value={definition.slotPool.name} onChange={(event) => onChange({ ...entry, definition: { ...definition, slotPool: { ...definition.slotPool!, name: event.target.value } } })} /></label>
            <label className="field"><span>Recovery</span><select value={definition.slotPool.recovery[0]?.trigger ?? 'long-rest'} onChange={(event) => onChange({ ...entry, definition: { ...definition, slotPool: { ...definition.slotPool!, recovery: [{ trigger: event.target.value as 'short-rest' | 'long-rest', mode: 'all' }] } } })}><option value="short-rest">Short Rest</option><option value="long-rest">Long Rest</option></select></label>
          </div>
          {definition.slotPool.slotLevels.map((slot, index) => (
            <div className="forge-level-table__row" key={slot.resourceId}>
              <label className="field"><span>Spell level</span><select value={slot.spellLevel} onChange={(event) => {
                const spellLevel = Number(event.target.value) as LeveledSpellLevel;
                onChange({ ...entry, definition: { ...definition, slotPool: { ...definition.slotPool!, slotLevels: definition.slotPool!.slotLevels.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, spellLevel } : candidate), progression: definition.slotPool!.progression.map((row) => ({ ...row, slots: row.slots.map((candidate) => candidate.spellLevel === slot.spellLevel ? { ...candidate, spellLevel } : candidate) })) } } });
              }}>{leveledSpellLevels().map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
              <label className="field"><span>Slot resource name</span><input value={slot.name} onChange={(event) => onChange({ ...entry, definition: { ...definition, slotPool: { ...definition.slotPool!, slotLevels: definition.slotPool!.slotLevels.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, name: event.target.value } : candidate) } } })} /></label>
              <small className="forge-identity">{slot.resourceId}</small>
            </div>
          ))}
          {definition.slotPool.progression.map((row, rowIndex) => (
            <div className="forge-editor-row" key={rowIndex}>
              <label className="field forge-field-small"><span>Owner level</span><input type="number" min={featureLevel} max="20" value={row.level} onChange={(event) => onChange({ ...entry, definition: { ...definition, slotPool: { ...definition.slotPool!, progression: definition.slotPool!.progression.map((candidate, candidateIndex) => candidateIndex === rowIndex ? { ...candidate, level: Number(event.target.value) } : candidate) } } })} /></label>
              {row.slots.map((slot) => <label className="field forge-field-small" key={slot.spellLevel}><span>Level {slot.spellLevel} slots</span><input type="number" min="0" value={slot.maximum} onChange={(event) => onChange({ ...entry, definition: { ...definition, slotPool: { ...definition.slotPool!, progression: definition.slotPool!.progression.map((candidate, candidateIndex) => candidateIndex === rowIndex ? { ...candidate, slots: candidate.slots.map((candidateSlot) => candidateSlot.spellLevel === slot.spellLevel ? { ...candidateSlot, maximum: Number(event.target.value) } : candidateSlot) } : candidate) } } })} /></label>)}
            </div>
          ))}
          <button className="button button--secondary" type="button" disabled={entry.persisted} onClick={() => onChange({ ...entry, definition: { ...definition, slotPool: createProviderSlotPool(featureLevel, contribution === 'pact' ? 'short-rest' : 'long-rest') } })}>Reset bounded slot pool</button>
        </div>
      )}
    </article>
  );
}

function SpellGrantEditor({
  entry,
  providerOptions,
  spells,
  featureLevel,
  onChange,
  onRemove,
}: {
  entry: SubclassForgeSpellGrantDraft;
  providerOptions: readonly { id: ContentId; name: string }[];
  spells: readonly SpellContent[];
  featureLevel: number;
  onChange: (entry: SubclassForgeSpellGrantDraft) => void;
  onRemove: () => void;
}) {
  return <article className="forge-editor-row">
    <div className="forge-editor-row__header"><div><span className="eyebrow">Always Prepared Grant</span><h3>Granted Spells</h3></div><button className="button button--secondary" type="button" disabled={entry.persisted} onClick={onRemove}>{entry.persisted ? 'Grant references locked on Edit' : 'Remove grant'}</button></div>
    <div className="field-grid field-grid--two">
      <label className="field"><span>Provider</span><select disabled={entry.persisted} value={entry.grant.providerId} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, providerId: event.target.value } })}>{providerOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label className="field"><span>Minimum owner level</span><input type="number" min={featureLevel} max="20" disabled={entry.persisted} value={entry.grant.minimumLevel ?? featureLevel} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, minimumLevel: Number(event.target.value) } })} /></label>
    </div>
    <label className="field forge-field-block"><span>Spells</span><select multiple aria-label="Granted Spells" disabled={entry.persisted} value={[...entry.grant.spellIds]} onChange={(event) => onChange({ ...entry, grant: { ...entry.grant, spellIds: [...event.currentTarget.selectedOptions].map((option) => option.value) } })}>{spells.map((spell) => <option key={spell.id} value={spell.id}>{spell.name} · {spell.level === 0 ? 'Cantrip' : 'Level ' + spell.level}{spell.source.type === 'homebrew' ? ' · Homebrew' : ''}</option>)}</select></label>
  </article>;
}

function ReferenceEditor({
  entry,
  onChange,
  onRemove,
}: {
  entry: SubclassForgeReferenceEffectDraft;
  onChange: (entry: SubclassForgeReferenceEffectDraft) => void;
  onRemove: () => void;
}) {
  return <article className="forge-editor-row forge-editor-row--reference">
    <div className="forge-editor-row__header"><div><span className="source-badge">Manual / Reference</span><small className="forge-identity">{entry.id}</small></div><button className="button button--secondary" disabled={entry.persisted} type="button" onClick={onRemove}>{entry.persisted ? 'Identity locked on Edit' : 'Remove reference'}</button></div>
    <label className="field"><span>Name</span><input value={entry.name} onChange={(event) => onChange({ ...entry, name: event.target.value })} /></label>
    <label className="field"><span>Description</span><textarea rows={3} value={entry.description} onChange={(event) => onChange({ ...entry, description: event.target.value })} /></label>
  </article>;
}

export function SubclassForgeFeatureEditor({
  draft,
  feature,
  index,
  featureCount,
  spellLists,
  spells,
  onChange,
  onMove,
  onRemove,
}: {
  draft: SubclassForgeDraft;
  feature: SubclassForgeFeatureDraft;
  index: number;
  featureCount: number;
  spellLists: readonly SpellListReference[];
  spells: readonly SpellContent[];
  onChange: (feature: SubclassForgeFeatureDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [staticType, setStaticType] = useState<FeatForgeStaticEffectType>('initiative-modifier');
  const [diceType, setDiceType] = useState<FeatForgeDiceTransformationType>('reroll-once-use-new');
  const resourceOptions = draftResourceOptions(draft, contentRegistry);
  const providerOptions = draftProviderOptions(draft, contentRegistry);

  return (
    <article className="panel form-section subclass-forge-feature" aria-label={(feature.name || 'Unnamed') + ' subclass feature'}>
      <div className="section-heading section-heading--split">
        <div>
          <span className="eyebrow">Ordered Feature {index + 1}</span>
          <h2>{feature.name || 'Unnamed feature'}</h2>
          <p className="forge-identity">{feature.id}</p>
        </div>
        <div className="forge-inline-actions">
          <button className="button button--secondary" type="button" disabled={index === 0} onClick={() => onMove(-1)}>Move Up</button>
          <button className="button button--secondary" type="button" disabled={index === featureCount - 1} onClick={() => onMove(1)}>Move Down</button>
          <button className="button button--secondary" type="button" disabled={feature.persisted} onClick={onRemove}>{feature.persisted ? 'Identity locked on Edit' : 'Remove Feature'}</button>
        </div>
      </div>

      <div className="field-grid field-grid--two">
        <label className="field"><span>Feature name</span><input value={feature.name} onChange={(event) => onChange({ ...feature, name: event.target.value })} /></label>
        <label className="field"><span>Parent Class level</span><input type="number" min={draft.acquisitionLevel} max="20" disabled={feature.persisted} value={feature.level} onChange={(event) => onChange({ ...feature, level: Number(event.target.value) })} /></label>
      </div>
      <label className="field forge-field-block"><span>Description</span><textarea rows={3} value={feature.description} onChange={(event) => onChange({ ...feature, description: event.target.value })} /></label>

      <details className="forge-feature-details" open>
        <summary>AUTOMATED — Static effects and dice</summary>
        <div className="forge-add-row">
          <label className="field"><span>Static effect</span><select value={staticType} onChange={(event) => setStaticType(event.target.value as FeatForgeStaticEffectType)}>{Object.entries(STATIC_EFFECT_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="button button--secondary" type="button" onClick={() => {
            const next = createStaticEffectDraft(staticType);
            onChange({ ...feature, staticEffects: [...feature.staticEffects, next] });
          }}>Add Static Effect</button>
        </div>
        <div className="forge-editor-list">
          {feature.staticEffects.map((entry) => <FeatForgeStaticEffectEditor key={entry.draftId} entry={entry} onChange={(next) => onChange({ ...feature, staticEffects: replaceByDraftId(feature.staticEffects, next) })} onRemove={() => onChange({ ...feature, staticEffects: removeByDraftId(feature.staticEffects, entry.draftId) })} />)}
        </div>
        <div className="forge-add-row">
          <label className="field"><span>Dice transformation</span><select value={diceType} onChange={(event) => setDiceType(event.target.value as FeatForgeDiceTransformationType)}>{Object.entries(DICE_TRANSFORMATION_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="button button--secondary" type="button" onClick={() => {
            const next = createDiceEffectDraft(diceType);
            onChange({ ...feature, diceEffects: [...feature.diceEffects, next] });
          }}>Add Dice Transformation</button>
        </div>
        <div className="forge-editor-list">
          {feature.diceEffects.map((entry) => <FeatForgeDiceEffectEditor key={entry.draftId} entry={entry} onChange={(next) => onChange({ ...feature, diceEffects: replaceByDraftId(feature.diceEffects, next) })} onRemove={() => onChange({ ...feature, diceEffects: removeByDraftId(feature.diceEffects, entry.draftId) })} />)}
        </div>
      </details>

      <details className="forge-feature-details">
        <summary>AUTOMATED — Resources and actions</summary>
        <div className="forge-inline-actions">
          <button className="button button--secondary" type="button" onClick={() => onChange({ ...feature, resources: [...feature.resources, createSubclassResourceDraft(feature.level)] })}>Add Resource</button>
          <button className="button button--secondary" disabled={resourceOptions.length === 0} type="button" onClick={() => resourceOptions[0] && onChange({ ...feature, consumers: [...feature.consumers, createSubclassConsumerDraft(resourceOptions[0].id)] })}>Add Consumer</button>
          <button className="button button--secondary" disabled={resourceOptions.length === 0} type="button" onClick={() => resourceOptions[0] && onChange({ ...feature, transactions: [...feature.transactions, createSubclassTransactionDraft(resourceOptions[0].id)] })}>Add Transaction</button>
          <button className="button button--secondary" type="button" onClick={() => onChange({ ...feature, activeEffects: [...feature.activeEffects, createSubclassActiveEffectDraft(resourceOptions[0]?.id)] })}>Add Active Self Effect</button>
        </div>
        <div className="forge-editor-list">
          {feature.resources.map((entry) => <ResourceEditor key={entry.draftId} entry={entry} featureLevel={feature.level} onChange={(next) => onChange({ ...feature, resources: replaceByDraftId(feature.resources, next) })} onRemove={() => onChange({ ...feature, resources: removeByDraftId(feature.resources, entry.draftId) })} />)}
          {feature.consumers.map((entry) => <ConsumerEditor key={entry.draftId} entry={entry} resourceOptions={resourceOptions} onChange={(next) => onChange({ ...feature, consumers: replaceByDraftId(feature.consumers, next) })} onRemove={() => onChange({ ...feature, consumers: removeByDraftId(feature.consumers, entry.draftId) })} />)}
          {feature.transactions.map((entry) => <TransactionEditor key={entry.draftId} entry={entry} resourceOptions={resourceOptions} providerOptions={providerOptions} onChange={(next) => onChange({ ...feature, transactions: replaceByDraftId(feature.transactions, next) })} onRemove={() => onChange({ ...feature, transactions: removeByDraftId(feature.transactions, entry.draftId) })} />)}
          {feature.activeEffects.map((entry) => <ActiveEffectEditor key={entry.draftId} entry={entry} resourceOptions={resourceOptions} providerOptions={providerOptions} onChange={(next) => onChange({ ...feature, activeEffects: replaceByDraftId(feature.activeEffects, next) })} onRemove={() => onChange({ ...feature, activeEffects: removeByDraftId(feature.activeEffects, entry.draftId) })} />)}
        </div>
      </details>

      <details className="forge-feature-details">
        <summary>AUTOMATED — Subclass Spellcasting</summary>
        <div className="forge-inline-actions">
          <button className="button button--secondary" type="button" disabled={spellLists.length === 0} onClick={() => spellLists[0] && onChange({ ...feature, providers: [...feature.providers, createSubclassProviderDraft(feature.level, spellLists[0].id)] })}>Add Spellcasting Provider</button>
          <button className="button button--secondary" type="button" disabled={providerOptions.length === 0 || spells.length === 0} onClick={() => providerOptions[0] && spells[0] && onChange({ ...feature, spellGrants: [...feature.spellGrants, createSubclassSpellGrantDraft(providerOptions[0].id, spells[0].id, feature.level)] })}>Add Granted Spells</button>
        </div>
        <div className="forge-editor-list">
          {feature.providers.map((entry) => <ProviderEditor key={entry.draftId} entry={entry} featureLevel={feature.level} spellLists={spellLists} spells={spells} onChange={(next) => onChange({ ...feature, providers: replaceByDraftId(feature.providers, next) })} onRemove={() => onChange({ ...feature, providers: removeByDraftId(feature.providers, entry.draftId) })} />)}
          {feature.spellGrants.map((entry) => <SpellGrantEditor key={entry.draftId} entry={entry} featureLevel={feature.level} providerOptions={providerOptions} spells={spells} onChange={(next) => onChange({ ...feature, spellGrants: replaceByDraftId(feature.spellGrants, next) })} onRemove={() => onChange({ ...feature, spellGrants: removeByDraftId(feature.spellGrants, entry.draftId) })} />)}
        </div>
      </details>

      <details className="forge-feature-details">
        <summary>MANUAL / REFERENCE</summary>
        <p className="field-hint">Generic feature choices, target-state mechanics, conditional branches, and unsupported rules stay descriptive rather than executable.</p>
        <button className="button button--secondary" type="button" onClick={() => onChange({ ...feature, referenceEffects: [...feature.referenceEffects, createSubclassReferenceEffectDraft()] })}>Add Manual / Reference Effect</button>
        <div className="forge-editor-list">
          {feature.referenceEffects.map((entry) => <ReferenceEditor key={entry.draftId} entry={entry} onChange={(next) => onChange({ ...feature, referenceEffects: replaceByDraftId(feature.referenceEffects, next) })} onRemove={() => onChange({ ...feature, referenceEffects: removeByDraftId(feature.referenceEffects, entry.draftId) })} />)}
        </div>
      </details>
    </article>
  );
}
