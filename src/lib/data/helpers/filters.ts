import { QueryConstraint, where } from "firebase/firestore";

export interface RestaurantScopedFilter {
  restaurantId: string;
}

export interface ActiveFilter {
  isActive?: boolean;
}

export interface StatusFilter {
  status?: string;
}

export function buildRestaurantScope(filter: RestaurantScopedFilter): QueryConstraint[] {
  return [where("restaurantId", "==", filter.restaurantId)];
}

export function buildActiveFilter(filter: ActiveFilter): QueryConstraint[] {
  return typeof filter.isActive === "boolean" ? [where("isActive", "==", filter.isActive)] : [];
}

export function buildStatusFilter(filter: StatusFilter): QueryConstraint[] {
  return filter.status ? [where("status", "==", filter.status)] : [];
}
