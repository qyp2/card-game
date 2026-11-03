import { defaultRuntimeContext, type RuntimeContext } from '../shared/runtime-context';

/** Effect dependencies never enter room snapshots or serialized continuations. */
export type EffectContext = Pick<RuntimeContext, 'random'>;

/** Fallback context used when a caller does not supply its own RNG. */
export const defaultEffectContext: EffectContext = {
  random: defaultRuntimeContext.random,
};
