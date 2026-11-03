import type { CardInstance } from '../types/card.types';
import type { CardCharacteristics, EffectScope } from '../types/continuous-effect.types';
export { validEffectScope } from '../shared/effect-scope-validation';

/** Broad characteristic scopes default to the battlefield; object/zone scopes are explicit. */
export function characteristicScope(scope: EffectScope): EffectScope {
  // A scope that names no zone, card, object list, or self-reference is a broad
  // characteristic filter, which only ever applies on the battlefield.
  return !scope.zones && !scope.cardUuid && !scope.objects && !scope.self
    ? { ...scope, zones: ['battlefield'] }
    : scope;
}

/** True when a card falls inside an effect's scope. */
export function scopeMatches(scope: EffectScope, card: CardInstance, value: CardCharacteristics,
  source: CardInstance | undefined, controller: string | undefined): boolean {
  // Guard: "attached to source" requires both cards on the battlefield and the
  // attachment to still point at this exact incarnation.
  if (
    scope.attachedToSource &&
    (!source || source.state.zone !== 'battlefield' || card.state.zone !== 'battlefield'
      || source.state.attachedTo !== card.uuid
      || source.state.attachedToRevision !== (card.state.zoneRevision ?? 0))
  ) {
    return false;
  }

  // Guard: "self" requires the same card object, not just the same UUID.
  if (
    scope.self &&
    (!source || card.uuid !== source.uuid || card.state.zone !== source.state.zone
      || (card.state.zoneRevision ?? 0) !== (source.state.zoneRevision ?? 0))
  ) {
    return false;
  }

  // Guard: explicit object identity filters.
  if (scope.cardUuid && card.uuid !== scope.cardUuid) return false;
  if (scope.zoneRevision !== undefined && (card.state.zoneRevision ?? 0) !== scope.zoneRevision) return false;
  if (
    scope.objects &&
    !scope.objects.some((o) => o.cardUuid === card.uuid && o.zoneRevision === (card.state.zoneRevision ?? 0))
  ) {
    return false;
  }

  // Guard: zone and characteristic filters.
  if (scope.zones?.length && !scope.zones.includes(card.state.zone)) return false;
  if (scope.cardTypes?.length && !scope.cardTypes.some((t) => value.cardTypes.includes(t))) return false;
  if (scope.subTypes?.length && !scope.subTypes.some((t) => value.subTypes.includes(t))) return false;
  if (scope.colors?.length && !scope.colors.some((t) => value.colors.includes(t))) return false;

  // Guard: controller filter, relative to the effect's controller.
  if (scope.controller === 'self' && value.controllerId !== controller) return false;
  if (scope.controller === 'opponent' && (!controller || value.controllerId === controller)) return false;

  return true;
}
