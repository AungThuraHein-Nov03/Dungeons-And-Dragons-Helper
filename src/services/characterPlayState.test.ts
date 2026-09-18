import { describe, expect, it } from 'vitest';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { PALADIN_LAY_ON_HANDS_RESOURCE_ID } from '../content/srd/paladin';
import { srdId } from '../content/srd/source';
import { fighterInput } from '../test/fixtures';
import { deriveCharacterState } from '../rules/deriveCharacter';
import {
  applyCharacterDamage,
  finishCharacterLongRest,
  finishCharacterShortRest,
  healCharacter,
  setCharacterTemporaryHp,
  spendCharacterHitDie,
  consumeCharacterResource,
} from './characterPlayState';
import { contentRegistry } from './contentRegistry';
import { createCharacter, getCharacterById } from './characterStorage';

function resourceConsumers(characterId: string) {
  const character = getCharacterById(characterId)!;
  const derived = deriveCharacterState(character, contentRegistry);
  if (!derived.ok) throw new Error(derived.error.message);
  const secondWind = derived.value.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)!;
  const actionSurge = derived.value.resources.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)!;
  return {
    secondWind: secondWind.consumers.find((consumer) => consumer.name === 'Second Wind')!.id,
    tacticalMind: secondWind.consumers.find((consumer) => consumer.name === 'Tactical Mind')!.id,
    actionSurge: actionSurge.consumers.find((consumer) => consumer.name === 'Action Surge')!.id,
  };
}

describe('character play-state mutation service', () => {
  it('persists damage, Temporary HP absorption, and healing', () => {
    const created = createCharacter(fighterInput());
    expect(applyCharacterDamage(created.id, 10)).toMatchObject({ ok: true, value: { playState: { currentHp: 26 } } });
    expect(setCharacterTemporaryHp(created.id, 5)).toMatchObject({ ok: true, value: { playState: { temporaryHp: 5 } } });
    expect(applyCharacterDamage(created.id, 8)).toMatchObject({ ok: true, value: { playState: { currentHp: 23, temporaryHp: 0 } } });
    expect(healCharacter(created.id, 6)).toMatchObject({ ok: true, value: { playState: { currentHp: 29, temporaryHp: 0 } } });
    expect(getCharacterById(created.id)?.playState.currentHp).toBe(29);
  });

  it('spends a manually entered Hit Die result and persists the result', () => {
    const created = createCharacter(fighterInput());
    applyCharacterDamage(created.id, 20);
    const spent = spendCharacterHitDie(created.id, 7);
    expect(spent).toMatchObject({ ok: true, value: { playState: { currentHp: 25, hitDiceRemaining: 3 } } });
    expect(getCharacterById(created.id)?.playState.hitDiceRemaining).toBe(3);
  });

  it('uses Second Wind healing and Tactical Mind from the exact same resource pool', () => {
    const created = createCharacter(fighterInput());
    applyCharacterDamage(created.id, 20);
    const consumers = resourceConsumers(created.id);

    const healed = consumeCharacterResource(created.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumers.secondWind, 6);
    expect(healed).toMatchObject({ ok: true, value: { playState: { currentHp: 26, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2 } } } });

    const tactical = consumeCharacterResource(created.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumers.tacticalMind);
    expect(tactical).toMatchObject({ ok: true, value: { playState: { resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1 } } } });
  });

  it('does not consume Second Wind when its manual healing result is invalid', () => {
    const created = createCharacter(fighterInput());
    const consumers = resourceConsumers(created.id);
    const result = consumeCharacterResource(created.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumers.secondWind, 11);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(getCharacterById(created.id)?.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(3);
  });

  it('tracks Action Surge and restores resources on a Short Rest using metadata', () => {
    const created = createCharacter(fighterInput());
    const consumers = resourceConsumers(created.id);
    consumeCharacterResource(created.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumers.tacticalMind);
    consumeCharacterResource(created.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumers.tacticalMind);
    consumeCharacterResource(created.id, FIGHTER_ACTION_SURGE_RESOURCE_ID, consumers.actionSurge);

    const rested = finishCharacterShortRest(created.id);
    expect(rested).toMatchObject({
      ok: true,
      value: { playState: { resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 } } },
    });
  });

  it('persists bounded variable expenditure from a numeric class resource without applying target-side effects', () => {
    const created = createCharacter(fighterInput({
      classId: srdId('class', 'paladin'),
      subclassId: srdId('subclass', 'paladin:oath-of-devotion'),
      level: 5,
      skillProficiencies: ['athletics', 'medicine'],
      abilityScores: { charisma: 16 },
    }));
    const spent = consumeCharacterResource(created.id, PALADIN_LAY_ON_HANDS_RESOURCE_ID, srdId('class-resource-consumer', 'paladin:lay-on-hands'), { expenditureAmount: 7 });
    expect(spent).toMatchObject({ ok: true, value: { playState: { resourceUses: { [PALADIN_LAY_ON_HANDS_RESOURCE_ID]: 18 } } } });
    expect(getCharacterById(created.id)?.playState.resourceUses[PALADIN_LAY_ON_HANDS_RESOURCE_ID]).toBe(18);
    expect(consumeCharacterResource(created.id, PALADIN_LAY_ON_HANDS_RESOURCE_ID, srdId('class-resource-consumer', 'paladin:lay-on-hands'), { expenditureAmount: 19 })).toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
  });

  it('Long Rest restores HP, Hit Dice, resources, and removes Temporary HP', () => {
    const created = createCharacter(fighterInput());
    const consumers = resourceConsumers(created.id);
    applyCharacterDamage(created.id, 20);
    setCharacterTemporaryHp(created.id, 7);
    spendCharacterHitDie(created.id, 5);
    consumeCharacterResource(created.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumers.tacticalMind);
    consumeCharacterResource(created.id, FIGHTER_ACTION_SURGE_RESOURCE_ID, consumers.actionSurge);

    const rested = finishCharacterLongRest(created.id);
    expect(rested).toMatchObject({
      ok: true,
      value: {
        playState: {
          currentHp: 36,
          temporaryHp: 0,
          hitDiceRemaining: 4,
          resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 },
        },
      },
    });
  });
});
