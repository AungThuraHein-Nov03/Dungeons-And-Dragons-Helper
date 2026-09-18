import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import {
  ROLL_DIE_SIZES,
  type D20RollContext,
  type DiceTerm,
  type RandomSource,
  type RollDiceTransformation,
  type RollDiceTransformationApplication,
  type RollExpression,
  type RollRequest,
  type RollResult,
  type RolledDiceGroup,
} from './types';

export const systemRandom: RandomSource = () => Math.random();

function isSupportedDie(value: number): value is (typeof ROLL_DIE_SIZES)[number] {
  return ROLL_DIE_SIZES.includes(value as (typeof ROLL_DIE_SIZES)[number]);
}

function validInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

const ROLL_TYPES = new Set(['ability-check', 'skill-check', 'saving-throw', 'initiative', 'attack', 'damage', 'healing', 'hit-die', 'feature']);
const ROLL_MODES = new Set(['normal', 'advantage', 'disadvantage']);
const OUTCOME_KINDS = new Set(['damage', 'healing', 'check', 'attack', 'save', 'feature']);

export function validateRollExpression(expression: unknown): RuleResult<RollExpression> {
  if (!isRecord(expression) || !validInteger(expression.modifier)) {
    return ruleError('invalid-dice-expression', 'Roll expression and modifier must be valid structured values.');
  }
  if (expression.kind === 'fixed') {
    return validInteger(expression.amount)
      ? ruleOk(expression as unknown as RollExpression)
      : ruleError('invalid-dice-expression', 'Fixed roll amount must be a finite whole number.');
  }
  if (expression.kind !== 'dice' || !Array.isArray(expression.dice) || expression.dice.length === 0) {
    return ruleError('invalid-dice-expression', 'A dice expression must contain at least one die term.');
  }
  for (const rawTerm of expression.dice) {
    if (!isRecord(rawTerm) || !validInteger(rawTerm.quantity) || rawTerm.quantity <= 0) {
      return ruleError('invalid-dice-expression', 'Dice quantity must be a positive whole number.');
    }
    if (!validInteger(rawTerm.die) || !isSupportedDie(rawTerm.die)) {
      return ruleError('invalid-dice-expression', `Unsupported die size: d${String(rawTerm.die)}.`);
    }
  }
  return ruleOk(expression as unknown as RollExpression);
}

function isD20TestExpression(expression: RollExpression): boolean {
  return expression.kind === 'dice' && expression.dice.length === 1 && expression.dice[0].die === 20 && expression.dice[0].quantity === 1;
}

function uniqueNonEmptyStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0) && new Set(value).size === value.length;
}

function validateD20Context(context: unknown): RuleResult<D20RollContext> {
  if (!isRecord(context)) return ruleError('invalid-roll-context', 'D20 roll context must be structured data.');
  if (context.modifiers !== undefined) {
    if (!Array.isArray(context.modifiers)) return ruleError('invalid-roll-context', 'D20 contextual modifiers must be a list.');
    for (const modifier of context.modifiers) {
      if (!isRecord(modifier) || typeof modifier.label !== 'string' || !modifier.label.trim() || !validInteger(modifier.amount)) {
        return ruleError('invalid-roll-context', 'D20 contextual modifiers require a label and finite whole-number amount.');
      }
    }
  }
  if (context.advantageSources !== undefined && !uniqueNonEmptyStrings(context.advantageSources)) {
    return ruleError('invalid-roll-context', 'D20 Advantage sources must be unique non-empty labels.');
  }
  if (context.disadvantageSources !== undefined && !uniqueNonEmptyStrings(context.disadvantageSources)) {
    return ruleError('invalid-roll-context', 'D20 Disadvantage sources must be unique non-empty labels.');
  }
  return ruleOk(context as unknown as D20RollContext);
}

function validateDiceTransformations(value: unknown): RuleResult<readonly RollDiceTransformation[]> {
  if (!Array.isArray(value)) return ruleError('invalid-dice-transformation', 'Dice transformations must be a structured list.');
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim() || typeof raw.sourceLabel !== 'string' || !raw.sourceLabel.trim() || typeof raw.optional !== 'boolean' || typeof raw.type !== 'string') {
      return ruleError('invalid-dice-transformation', 'Dice transformations require stable IDs, source labels, and supported types.');
    }
    if (ids.has(raw.id)) return ruleError('invalid-dice-transformation', 'Dice transformation IDs must be unique per roll request.', raw.id);
    ids.add(raw.id);
    if (raw.type === 'reroll-once-use-new') {
      if (!hasOnlyKeys(raw, ['id', 'sourceLabel', 'optional', 'type', 'die', 'qualifyingFaces'])
        || raw.die !== 20
        || !Array.isArray(raw.qualifyingFaces)
        || raw.qualifyingFaces.length === 0
        || new Set(raw.qualifyingFaces).size !== raw.qualifyingFaces.length
        || raw.qualifyingFaces.some((face) => !validInteger(face) || face < 1 || face > 20)
      ) {
        return ruleError('invalid-dice-transformation', 'Reroll-once/use-new transformation is malformed.', raw.id);
      }
      continue;
    }
    if (raw.type === 'minimum-die-face') {
      if (!hasOnlyKeys(raw, ['id', 'sourceLabel', 'optional', 'type', 'die', 'minimum'])
        || raw.optional !== false
        || !validInteger(raw.die)
        || ![4, 6, 8, 10, 12].includes(raw.die)
        || !validInteger(raw.minimum)
        || raw.minimum < 1
        || raw.minimum > raw.die
      ) {
        return ruleError('invalid-dice-transformation', 'Minimum-die-face transformation is malformed.', raw.id);
      }
      continue;
    }
    return ruleError('invalid-dice-transformation', 'Unsupported dice transformation kind.', raw.id);
  }
  return ruleOk(value as readonly RollDiceTransformation[]);
}

export interface ResolvedD20Context {
  readonly mode: RollRequest['mode'];
  readonly contextualModifier: number;
}

export function resolveD20RollContext(manualMode: RollRequest['mode'], context: D20RollContext = {}): ResolvedD20Context {
  const hasAdvantage = manualMode === 'advantage' || (context.advantageSources?.length ?? 0) > 0;
  const hasDisadvantage = manualMode === 'disadvantage' || (context.disadvantageSources?.length ?? 0) > 0;
  const mode = hasAdvantage && hasDisadvantage ? 'normal' : hasAdvantage ? 'advantage' : hasDisadvantage ? 'disadvantage' : 'normal';
  const contextualModifier = context.modifiers?.reduce((total, source) => total + source.amount, 0) ?? 0;
  return { mode, contextualModifier };
}

export function mergeD20RollContexts(...contexts: readonly (D20RollContext | undefined)[]): D20RollContext | undefined {
  const modifiers = contexts.flatMap((context) => context?.modifiers ?? []);
  const advantageSources = [...new Set(contexts.flatMap((context) => context?.advantageSources ?? []))];
  const disadvantageSources = [...new Set(contexts.flatMap((context) => context?.disadvantageSources ?? []))];
  if (modifiers.length === 0 && advantageSources.length === 0 && disadvantageSources.length === 0) return undefined;
  return {
    ...(modifiers.length > 0 ? { modifiers } : {}),
    ...(advantageSources.length > 0 ? { advantageSources } : {}),
    ...(disadvantageSources.length > 0 ? { disadvantageSources } : {}),
  };
}

export function validateRollRequest(request: unknown): RuleResult<RollRequest> {
  if (!isRecord(request) || typeof request.label !== 'string' || !request.label.trim()) {
    return ruleError('invalid-roll-request', 'Roll request is missing a label or structured context.');
  }
  if (typeof request.type !== 'string' || !ROLL_TYPES.has(request.type) || typeof request.mode !== 'string' || !ROLL_MODES.has(request.mode)) {
    return ruleError('invalid-roll-request', 'Roll request has an unsupported type or roll mode.');
  }
  if (!isRecord(request.source) || typeof request.source.characterId !== 'string' || !request.source.characterId) {
    return ruleError('invalid-roll-request', 'Roll request is missing a source character.');
  }
  if (!isRecord(request.outcome) || typeof request.outcome.kind !== 'string' || !OUTCOME_KINDS.has(request.outcome.kind)) {
    return ruleError('invalid-roll-request', 'Roll request is missing outcome context.');
  }
  const expression = validateRollExpression(request.expression);
  if (!expression.ok) return expression;
  const typedRequest = { ...request, expression: expression.value } as unknown as RollRequest;
  if (typedRequest.d20Context !== undefined) {
    if (!isD20TestExpression(typedRequest.expression)) return ruleError('invalid-roll-context', 'D20 roll context requires a single d20 test.');
    const context = validateD20Context(typedRequest.d20Context);
    if (!context.ok) return context;
  }
  if (typedRequest.diceTransformations !== undefined) {
    if (typedRequest.expression.kind !== 'dice') return ruleError('invalid-dice-transformation', 'Dice transformations require a dice expression.');
    const transformations = validateDiceTransformations(typedRequest.diceTransformations);
    if (!transformations.ok) return transformations;
  }
  if (typedRequest.criticalThreshold !== undefined) {
    if (typedRequest.type !== 'attack' || !isD20TestExpression(typedRequest.expression) || !validInteger(typedRequest.criticalThreshold) || typedRequest.criticalThreshold < 2 || typedRequest.criticalThreshold > 20) {
      return ruleError('invalid-critical-threshold', 'Critical thresholds require a d20 attack and a whole-number threshold from 2 through 20.');
    }
  }
  if (typedRequest.mode !== 'normal' && !isD20TestExpression(typedRequest.expression)) {
    return ruleError('invalid-roll-mode', 'Advantage and Disadvantage require a single d20 test.');
  }
  return ruleOk(typedRequest);
}

function rollSingleDie(die: number, rng: RandomSource): RuleResult<number> {
  const randomValue = rng();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    return ruleError('invalid-rng', 'Random source must return a finite number from 0 inclusive to 1 exclusive.');
  }
  return ruleOk(Math.floor(randomValue * die) + 1);
}

function applyDiceTransformations(
  die: DiceTerm['die'],
  original: number,
  transformations: readonly RollDiceTransformation[],
  rng: RandomSource,
  applications: RollDiceTransformationApplication[],
  usedRerollTransformationIds: Set<string>,
): RuleResult<number> {
  let current = original;
  const rerolls = transformations.filter((transformation): transformation is Extract<RollDiceTransformation, { type: 'reroll-once-use-new' }> => transformation.type === 'reroll-once-use-new' && transformation.die === die);
  const floors = transformations.filter((transformation): transformation is Extract<RollDiceTransformation, { type: 'minimum-die-face' }> => transformation.type === 'minimum-die-face' && transformation.die === die);

  for (const transformation of rerolls) {
    if (usedRerollTransformationIds.has(transformation.id) || !transformation.qualifyingFaces.includes(current)) continue;
    const replacement = rollSingleDie(die, rng);
    if (!replacement.ok) return replacement;
    usedRerollTransformationIds.add(transformation.id);
    applications.push({
      transformationId: transformation.id,
      sourceLabel: transformation.sourceLabel,
      type: 'reroll-once-use-new',
      die,
      original: current,
      replacement: replacement.value,
      final: replacement.value,
    });
    current = replacement.value;
  }

  for (const transformation of floors) {
    if (current >= transformation.minimum) continue;
    const before = current;
    current = transformation.minimum;
    applications.push({
      transformationId: transformation.id,
      sourceLabel: transformation.sourceLabel,
      type: 'minimum-die-face',
      die,
      original: before,
      final: current,
    });
  }

  return ruleOk(current);
}

function rollTerm(
  term: DiceTerm,
  rng: RandomSource,
  transformations: readonly RollDiceTransformation[],
  applications: RollDiceTransformationApplication[],
  usedRerollTransformationIds: Set<string>,
): RuleResult<RolledDiceGroup> {
  const values: number[] = [];
  for (let index = 0; index < term.quantity; index += 1) {
    const rolled = rollSingleDie(term.die, rng);
    if (!rolled.ok) return rolled;
    const transformed = applyDiceTransformations(term.die, rolled.value, transformations, rng, applications, usedRerollTransformationIds);
    if (!transformed.ok) return transformed;
    values.push(transformed.value);
  }
  return ruleOk({ die: term.die, values });
}

export function doubleDiceForCritical(expression: RollExpression): RollExpression {
  if (expression.kind === 'fixed') return expression;
  return {
    ...expression,
    dice: expression.dice.map((term) => ({ ...term, quantity: term.quantity * 2 })),
  };
}

export function rollRequest(request: RollRequest, rng: RandomSource = systemRandom): RuleResult<RollResult> {
  const valid = validateRollRequest(request);
  if (!valid.ok) return valid;

  if (request.expression.kind === 'fixed') {
    return ruleOk({
      request,
      dice: [],
      modifier: request.expression.modifier,
      total: request.expression.amount + request.expression.modifier,
      effects: [],
    });
  }

  const transformations = (request.diceTransformations ?? []).filter((transformation) => !transformation.optional);
  const applications: RollDiceTransformationApplication[] = [];
  const usedRerollTransformationIds = new Set<string>();
  const isSingleD20 = isD20TestExpression(request.expression);
  const d20Resolution = isSingleD20 ? resolveD20RollContext(request.mode, request.d20Context) : undefined;
  const effectiveModifier = request.expression.modifier + (d20Resolution?.contextualModifier ?? 0);

  if (d20Resolution && d20Resolution.mode !== 'normal') {
    const firstRaw = rollSingleDie(20, rng);
    if (!firstRaw.ok) return firstRaw;
    const first = applyDiceTransformations(20, firstRaw.value, transformations, rng, applications, usedRerollTransformationIds);
    if (!first.ok) return first;
    const secondRaw = rollSingleDie(20, rng);
    if (!secondRaw.ok) return secondRaw;
    const second = applyDiceTransformations(20, secondRaw.value, transformations, rng, applications, usedRerollTransformationIds);
    if (!second.ok) return second;
    const keptD20 = d20Resolution.mode === 'advantage'
      ? Math.max(first.value, second.value)
      : Math.min(first.value, second.value);
    return ruleOk({
      request,
      dice: [{ die: 20, values: [first.value, second.value] }],
      modifier: effectiveModifier,
      total: keptD20 + effectiveModifier,
      keptD20,
      natural: keptD20 === 20 ? 'nat20' : keptD20 === 1 ? 'nat1' : undefined,
      ...(request.type === 'attack' ? { critical: keptD20 >= (request.criticalThreshold ?? 20) } : {}),
      resolvedMode: d20Resolution.mode,
      contextualModifier: d20Resolution.contextualModifier,
      ...(applications.length > 0 ? { diceTransformationApplications: applications } : {}),
      effects: [],
    });
  }

  const dice: RolledDiceGroup[] = [];
  let diceTotal = 0;
  for (const term of request.expression.dice) {
    const rolled = rollTerm(term, rng, transformations, applications, usedRerollTransformationIds);
    if (!rolled.ok) return rolled;
    dice.push(rolled.value);
    diceTotal += rolled.value.values.reduce((sum, value) => sum + value, 0);
  }
  const keptD20 = isSingleD20 ? dice[0].values[0] : undefined;
  return ruleOk({
    request,
    dice,
    modifier: effectiveModifier,
    total: diceTotal + effectiveModifier,
    keptD20,
    natural: keptD20 === 20 ? 'nat20' : keptD20 === 1 ? 'nat1' : undefined,
    ...(request.type === 'attack' && keptD20 !== undefined ? { critical: keptD20 >= (request.criticalThreshold ?? 20) } : {}),
    ...(d20Resolution ? { resolvedMode: d20Resolution.mode, contextualModifier: d20Resolution.contextualModifier } : {}),
    ...(applications.length > 0 ? { diceTransformationApplications: applications } : {}),
    effects: [],
  });
}

export function listEligibleOptionalDiceTransformations(result: RollResult): readonly RollDiceTransformation[] {
  const applied = new Set((result.diceTransformationApplications ?? []).map((application) => application.transformationId));
  return (result.request.diceTransformations ?? []).filter((transformation) => {
    if (!transformation.optional || applied.has(transformation.id) || transformation.type !== 'reroll-once-use-new') return false;
    const group = result.dice.find((candidate) => candidate.die === transformation.die);
    return !!group?.values.some((value) => transformation.qualifyingFaces.includes(value));
  });
}

export function applyOptionalDiceTransformation(
  result: RollResult,
  transformationId: string,
  rng: RandomSource = systemRandom,
): RuleResult<RollResult> {
  const validRequest = validateRollRequest(result.request);
  if (!validRequest.ok) return validRequest;
  const transformation = (result.request.diceTransformations ?? []).find((candidate) => candidate.id === transformationId);
  if (!transformation || !transformation.optional || transformation.type !== 'reroll-once-use-new') {
    return ruleError('invalid-dice-transformation', 'Optional dice transformation is not available for this roll.', transformationId);
  }
  if ((result.diceTransformationApplications ?? []).some((application) => application.transformationId === transformationId)) {
    return ruleError('invalid-dice-transformation', 'Optional dice transformation has already been used for this roll.', transformationId);
  }

  const groupIndex = result.dice.findIndex((group) => group.die === transformation.die);
  if (groupIndex < 0) return ruleError('invalid-dice-transformation', 'No qualifying die is present for this transformation.', transformationId);
  const group = result.dice[groupIndex];
  const valueIndex = group.values.findIndex((value) => transformation.qualifyingFaces.includes(value));
  if (valueIndex < 0) return ruleError('invalid-dice-transformation', 'This roll is not eligible for the optional transformation.', transformationId);

  const replacement = rollSingleDie(transformation.die, rng);
  if (!replacement.ok) return replacement;
  const nextValues = [...group.values];
  const original = nextValues[valueIndex];
  nextValues[valueIndex] = replacement.value;
  const dice = result.dice.map((candidate, index) => index === groupIndex ? { ...candidate, values: nextValues } : candidate);

  const isSingleD20 = isD20TestExpression(result.request.expression);
  const resolvedMode = result.resolvedMode ?? (isSingleD20 ? resolveD20RollContext(result.request.mode, result.request.d20Context).mode : undefined);
  const d20Values = isSingleD20 ? dice[0]?.values ?? [] : [];
  const keptD20 = isSingleD20
    ? resolvedMode === 'advantage'
      ? Math.max(...d20Values)
      : resolvedMode === 'disadvantage'
        ? Math.min(...d20Values)
        : d20Values[0]
    : result.keptD20;
  const total = keptD20 !== undefined ? keptD20 + result.modifier : result.total;
  const applications: RollDiceTransformationApplication[] = [
    ...(result.diceTransformationApplications ?? []),
    {
      transformationId: transformation.id,
      sourceLabel: transformation.sourceLabel,
      type: 'reroll-once-use-new',
      die: transformation.die,
      original,
      replacement: replacement.value,
      final: replacement.value,
    },
  ];

  return ruleOk({
    ...result,
    dice,
    total,
    ...(keptD20 !== undefined ? { keptD20 } : {}),
    natural: keptD20 === 20 ? 'nat20' : keptD20 === 1 ? 'nat1' : undefined,
    ...(result.request.type === 'attack' && keptD20 !== undefined ? { critical: keptD20 >= (result.request.criticalThreshold ?? 20) } : {}),
    ...(resolvedMode ? { resolvedMode } : {}),
    diceTransformationApplications: applications,
  });
}
