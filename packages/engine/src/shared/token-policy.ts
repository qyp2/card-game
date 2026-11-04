import policy from '../config/tokens.json';

if (
  Object.keys(policy).join(',') !== 'maxCreatedPerInstruction' ||
  !Number.isSafeInteger(policy.maxCreatedPerInstruction) ||
  policy.maxCreatedPerInstruction < 1 ||
  policy.maxCreatedPerInstruction > 256
) {
  throw new Error('Invalid token creation limits');
}
export const tokenPolicy = Object.freeze({ ...policy });
