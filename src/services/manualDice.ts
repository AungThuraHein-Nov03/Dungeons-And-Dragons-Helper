import { rollRequest, systemRandom } from '../dice/diceEngine';
import type { RandomSource, RollDieSize, RollMode, RollResult } from '../dice/types';
import { ruleOk, type RuleResult } from '../rules/result';
import { addRollHistory } from './rollHistory';

export interface ManualDiceOptions {
  readonly rng?: RandomSource;
  readonly historyStorage?: Storage;
  readonly now?: () => Date;
}

function browserStorage(): Storage {
  return window.localStorage;
}

export function rollManualDice(
  characterId: string,
  die: RollDieSize,
  quantity: number,
  modifier: number,
  mode: RollMode = 'normal',
  options: ManualDiceOptions = {},
): RuleResult<RollResult> {
  const result = rollRequest({
    type: 'feature',
    label: `Manual ${quantity}d${die}${modifier === 0 ? '' : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`}`,
    expression: { kind: 'dice', dice: [{ quantity, die }], modifier },
    mode,
    source: { characterId },
    outcome: { kind: 'feature' },
  }, options.rng ?? systemRandom);

  if (!result.ok) return result;
  addRollHistory(result.value, options.historyStorage ?? browserStorage(), options.now ?? (() => new Date()));
  return ruleOk(result.value);
}
