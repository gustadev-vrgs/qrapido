import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { loadPublicMenu, resolveSettings } from "@/lib/server/public-session";
import { toRestaurantDateKey } from "@/lib/utils/date-key";

type Doc = Record<string, any>;

export interface RestaurantPublicData {
  restaurantName: string | null;
  categories: Doc[];
  items: Doc[];
  settings: Doc | null;
}

/** Menu, settings and name change rarely; every customer phone used to re-read them on each poll. */
const PUBLIC_DATA_SECONDS = 300;

export function restaurantPublicTag(restaurantId: string): string {
  return `restaurant-public:${restaurantId}`;
}

async function loadUncached(restaurantId: string): Promise<RestaurantPublicData> {
  const db = getAdminFirestore() as any;
  const [menu, settings, restaurant] = await Promise.all([
    loadPublicMenu(restaurantId),
    resolveSettings(restaurantId),
    db.collection("restaurants").doc(restaurantId).get()
  ]);
  return {
    restaurantName: restaurant.exists ? restaurant.data()?.name ?? null : null,
    categories: menu.categories,
    items: menu.items,
    settings
  };
}

/** Outside the Next.js runtime (unit and integration tests) there is no data cache: read directly. */
function isCacheUnavailable(error: unknown): boolean {
  return error instanceof Error && /incrementalCache missing|static generation store missing/i.test(error.message);
}

/**
 * Restaurant data shown to diners, cached for a few minutes per restaurant and per day
 * (items served only on some weekdays depend on the date). Saving the menu or the
 * settings calls invalidateRestaurantPublicData, so changes show up right away.
 */
export async function loadRestaurantPublicData(restaurantId: string): Promise<RestaurantPublicData> {
  const dateKey = toRestaurantDateKey();
  try {
    return await unstable_cache(() => loadUncached(restaurantId), ["restaurant-public", restaurantId, dateKey], {
      tags: [restaurantPublicTag(restaurantId)],
      revalidate: PUBLIC_DATA_SECONDS
    })();
  } catch (error) {
    if (isCacheUnavailable(error)) return loadUncached(restaurantId);
    throw error;
  }
}

export function invalidateRestaurantPublicData(restaurantId: string): void {
  try {
    revalidateTag(restaurantPublicTag(restaurantId));
  } catch {
    /* outside the Next.js runtime there is nothing to invalidate */
  }
}
