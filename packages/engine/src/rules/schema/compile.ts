import { parseAuthoredEffect, parseModifierDefinition } from './contracts';
import { operationStage } from '../operation-stage';
import type { ModifierDefinition } from './contracts';
import type { ContinuousEffect, StaticEffectDefinition } from '../../types/continuous-effect.types';

/** Compile authored modifier definitions into the static effects the engine evaluates. */
export function compileStaticRules(rules: ModifierDefinition[]): StaticEffectDefinition[] {
  return rules
    .map((rule, i) => parseModifierDefinition(rule, `rules.${i}`))
    .flatMap((rule) => {
      if (rule.family !== 'characteristics' && rule.family !== 'permissions') return [];
      const effect = compileCharacteristicOperation(
        rule.operation as unknown as Record<string, unknown>,
      ) as unknown as ContinuousEffect;
      const stage = operationStage(effect);
      const group = rule.group ?? rule.id;
      return [
        {
          ...(group === 'effect' ? {} : { group }),
          layer: stage >= 70 && stage < 80 ? 7 : stage === 80 ? 8 : stage,
          scope: rule.scope,
          effect,
          ...(rule.condition ? { condition: rule.condition } : {}),
        },
      ];
    });
}

/** Compile only defined instruction/ability positions; text dictionaries are never interpreted as rules. */
export function compileInstruction(input: Record<string, unknown>): Record<string, unknown> {
  const effect = parseAuthoredEffect(input);
  const params = structuredClone(effect.params ?? {}) as Record<string, unknown>;
  if (effect.action === 'PAY_COST') {
    params.then = (params.then as Record<string, unknown>[]).map(compileInstruction);
  }
  if (effect.action === 'CREATE_CONTINUOUS_EFFECT')
    params.effect = compileCharacteristicOperation(params.effect as Record<string, unknown>);
  if (effect.action === 'CREATE_DELAYED_TRIGGER')
    params.ability = compileNormalizedAbility(params.ability as Record<string, unknown>);
  let choice = effect.choice as Record<string, unknown> | undefined;
  if (choice?.kind === 'options' || choice?.kind === 'ordering')
    choice = {
      ...choice,
      options: (choice.options as Record<string, unknown>[]).map(compileMode),
    };
  return { ...effect, ...(effect.params ? { params } : {}), ...(choice ? { choice } : {}) };
}
function compileMode(mode: Record<string, unknown>): Record<string, unknown> {
  return { ...mode, effects: (mode.effects as Record<string, unknown>[]).map(compileInstruction) };
}
/** Compile one authored characteristic operation into its runtime shape. */
export function compileCharacteristicOperation(operation: Record<string, unknown>): Record<string, unknown> {
  if (operation.type === 'ABILITY')
    return {
      ...operation,
      ...(operation.add
        ? {
            add: (operation.add as Record<string, unknown>[]).map(compileNormalizedAbility),
          }
        : {}),
    };
  if (operation.type === 'COPY') {
    const blueprint = operation.blueprint as Record<string, unknown>;
    return {
      ...operation,
      blueprint: {
        ...blueprint,
        abilities: (blueprint.abilities as Record<string, unknown>[]).map(compileNormalizedAbility),
        ...(blueprint.onCastEffects
          ? {
              onCastEffects: (blueprint.onCastEffects as Record<string, unknown>[]).map(compileInstruction),
            }
          : {}),
        ...(blueprint.onEnterEffects
          ? {
              onEnterEffects: (blueprint.onEnterEffects as Record<string, unknown>[]).map(compileInstruction),
            }
          : {}),
      },
    };
  }
  return structuredClone(operation);
}
function compileNormalizedAbility(ability: Record<string, unknown>): Record<string, unknown> {
  if (ability.type === 'static') {
    // Granted/copied abilities must validate retained rule contexts even when effects are already compiled.
    const rules = (ability.rules as ModifierDefinition[] | undefined)?.map((rule, i) =>
      parseModifierDefinition(rule, `rules.${i}`),
    );
    return {
      ...ability,
      ...(rules ? { rules } : {}),
      effects: ability.effects
        ? (ability.effects as Record<string, unknown>[]).map((effect) => ({
            ...effect,
            effect: compileCharacteristicOperation(effect.effect as Record<string, unknown>),
          }))
        : compileStaticRules(rules ?? []),
    };
  }
  return {
    ...ability,
    ...(ability.effect
      ? {
          effect: compileInstruction(ability.effect as Record<string, unknown>),
        }
      : {}),
    ...(ability.effects ? { effects: (ability.effects as Record<string, unknown>[]).map(compileInstruction) } : {}),
    ...(ability.modes ? { modes: (ability.modes as Record<string, unknown>[]).map(compileMode) } : {}),
  };
}
