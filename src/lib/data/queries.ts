import { QueryConstraint, orderBy, where } from "firebase/firestore";

import { buildRestaurantScope } from "@/lib/data/helpers/filters";

export function byRestaurant(restaurantId: string): QueryConstraint[] {
  return [...buildRestaurantScope({ restaurantId })];
}

export function byRestaurantOrdered(restaurantId: string, field: string, direction: "asc" | "desc" = "asc"): QueryConstraint[] {
  return [...buildRestaurantScope({ restaurantId }), orderBy(field, direction)];
}

export function byRestaurantAndStatus(restaurantId: string, status: string): QueryConstraint[] {
  return [...buildRestaurantScope({ restaurantId }), where("status", "==", status)];
}

export function byRestaurantAndTable(restaurantId: string, tableId: string): QueryConstraint[] {
  return [...buildRestaurantScope({ restaurantId }), where("tableId", "==", tableId)];
}

export function byRestaurantAndSessionToken(restaurantId: string, sessionToken: string): QueryConstraint[] {
  return [...buildRestaurantScope({ restaurantId }), where("sessionToken", "==", sessionToken)];
}
