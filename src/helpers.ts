/**
 * Deep merge two objects. Arrays from `overrides` replace `defaults` entirely.
 * Plain objects are merged recursively so new default keys are preserved.
 */
export function deepMerge<T extends Record<string, any>>(defaults: T, overrides: Record<string, any>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const defaultVal = (defaults as Record<string, any>)[key];
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
      (result as Record<string, any>)[key] = deepMerge(defaultVal, overrideVal);
    } else {
      (result as Record<string, any>)[key] = overrideVal;
    }
  }
  return result;
}
