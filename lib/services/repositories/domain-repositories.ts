import type { Firestore } from "firebase/firestore";
import {
  parseDailyMetric,
  parseMenuCategory,
  parseMenuItem,
  parseOrder,
  parseOrderEvent,
  parseRestaurant,
  parseRestaurantSettings,
  parseStaffUser,
  parseTable,
  parseTableSession
} from "@/lib/schemas";
import { BaseFirestoreRepository } from "@/lib/services/repositories/base-firestore-repository";
import { collections } from "@/lib/services/repositories/collections";

export const buildDomainRepositories = (db: Firestore) => ({
  restaurants: new BaseFirestoreRepository(db, collections.restaurants, parseRestaurant),
  staffUsers: new BaseFirestoreRepository(db, collections.staffUsers, parseStaffUser),
  tables: new BaseFirestoreRepository(db, collections.tables, parseTable),
  tableSessions: new BaseFirestoreRepository(db, collections.tableSessions, parseTableSession),
  menuCategories: new BaseFirestoreRepository(db, collections.menuCategories, parseMenuCategory),
  menuItems: new BaseFirestoreRepository(db, collections.menuItems, parseMenuItem),
  orders: new BaseFirestoreRepository(db, collections.orders, parseOrder),
  orderEvents: new BaseFirestoreRepository(db, collections.orderEvents, parseOrderEvent),
  restaurantSettings: new BaseFirestoreRepository(db, collections.restaurantSettings, parseRestaurantSettings),
  dailyMetrics: new BaseFirestoreRepository(db, collections.dailyMetrics, parseDailyMetric)
});

export type DomainRepositories = ReturnType<typeof buildDomainRepositories>;
