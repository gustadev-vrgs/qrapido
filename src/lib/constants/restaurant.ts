export const DEFAULT_RESTAURANT_NAME = "Casa Aurora";
export const RESTAURANT_NAME_UPDATED_EVENT = "qrapido:restaurant-name-updated";

const LEGACY_TEST_RESTAURANT_NAMES = new Set(["func_1"]);

export function resolveRestaurantDisplayName(name?: string | null): string {
  const normalizedName = name?.trim();

  if (!normalizedName || LEGACY_TEST_RESTAURANT_NAMES.has(normalizedName.toLowerCase())) {
    return DEFAULT_RESTAURANT_NAME;
  }

  return normalizedName;
}
