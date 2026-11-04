import type {
  CardObservation,
  ObservationAudience,
  ObservationRole,
  ObservationVisibility,
} from '../types/card-observation.types';
import limits from '../config/observations.json';

if (
  Object.keys(limits).sort().join(',') !== 'historyLimit,maxWindowCards' ||
  !Number.isSafeInteger(limits.maxWindowCards) ||
  limits.maxWindowCards < 8 ||
  limits.maxWindowCards > 256 ||
  !Number.isSafeInteger(limits.historyLimit) ||
  limits.historyLimit < 1 ||
  limits.historyLimit > 1024
) {
  throw new Error('Invalid observation limits');
}
export const observationLimits = Object.freeze({ ...limits });
export const hiddenObservation: ObservationVisibility = {
  faces: [],
  count: [],
  order: [],
  expires: 'resolution_end',
};
export const publicObservation: ObservationVisibility = {
  faces: ['all_players'],
  count: ['all_players'],
  order: ['all_players'],
  expires: 'resolution_end',
};

/** Resolve role grants once; subsequent source/control changes do not transfer information. */
export function resolveObservationAudience(
  visibility: ObservationVisibility,
  controllerId: string,
  zoneOwnerId: string,
  playerIds: string[],
): ObservationAudience {
  if (!playerIds.includes(controllerId) || !playerIds.includes(zoneOwnerId)) {
    throw new Error('Observation audience must refer to room players');
  }
  const expand = (roles: ObservationRole[]) => [
    ...new Set(
      roles.flatMap((role) => {
        if (role === 'all_players') return playerIds;
        if (role === 'controller') return [controllerId];
        if (role === 'zone_owner') return [zoneOwnerId];
        return playerIds.filter((id) => id !== controllerId);
      }),
    ),
  ];
  return { faces: expand(visibility.faces), count: expand(visibility.count), order: expand(visibility.order) };
}

/** Check audience implications for either possible source owner, before room data are available. */
export function consistentObservationVisibility(visibility: ObservationVisibility): boolean {
  return ['controller', 'other'].every((owner) => {
    const audience = resolveObservationAudience(visibility, 'controller', owner, ['controller', 'other']);
    return (
      audience.faces.every((id) => audience.count.includes(id)) &&
      audience.order.every((id) => audience.faces.includes(id))
    );
  });
}

/** Whether a viewer can receive any actual observation data, independently of private revision counts. */
export function observationHasAudience(observation: CardObservation, playerId: string): boolean {
  if (!observation.members.length) return observation.emptyAudience.count.includes(playerId);
  return (
    observation.members.some((member) => member.audience.faces.includes(playerId)) ||
    observation.members.some((member) => member.audience.count.includes(playerId))
  );
}
