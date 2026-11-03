import type { ActionHandler, ActionResult } from '../action-registry';
import { planManaActivation } from '../action-costs';

/**
 * Tapping for mana is validated and proposed by the same planner, so the two
 * phases share one implementation.
 */
const plan: ActionHandler['validate'] = (room, playerId, action): ActionResult => {
  const result = planManaActivation(room, playerId, action);

  // Successful plans pass through untouched; failures are tagged with the phase
  // that produced them so the client can report the right reason.
  return result.success ? result : { ...result, phase: 'validate' };
};

export const tapForManaHandler: ActionHandler = {
  validate: plan,
  propose: plan,
};