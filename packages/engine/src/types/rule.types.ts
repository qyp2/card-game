export type RuleValue = string | number | boolean | null | { path: string } | { numeric: import('./numeric-value.types').NumericExpression };
/** Serializable counter identity used by committed cost/replacement modifiers. */
export interface RuleUse { key: string; period: 'turn' | 'game'; limit: number }
export type RuleCondition =
  | { all: RuleCondition[] }
  | { any: RuleCondition[] }
  | { not: RuleCondition }
  | { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes'; left: RuleValue; right: RuleValue };
