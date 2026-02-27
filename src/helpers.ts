/**
 * Deep merge two objects. Arrays from `overrides` replace `defaults` entirely.
 * Plain objects are merged recursively so new default keys are preserved.
 */
export function deepMerge<T extends Record<string, unknown>>(defaults: T, overrides: Record<string, unknown>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const defaultVal = (defaults as Record<string, unknown>)[key];
    const overrideVal = overrides[key];
    if (
      overrideVal !== null &&
      overrideVal !== undefined &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      typeof defaultVal === 'object' &&
      defaultVal !== null &&
      !Array.isArray(defaultVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(defaultVal as Record<string, unknown>, overrideVal as Record<string, unknown>);
    } else {
      (result as Record<string, unknown>)[key] = overrideVal;
    }
  }
  return result;
}
