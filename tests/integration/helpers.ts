import { NextRequest } from "next/server";

import { fakeDb } from "../fakes/firebase-admin";

export const RESTAURANT_ID = "rest-demo";
export const ADMIN_UID = "admin-uid-123";
export const KITCHEN_UID = "kitchen-uid-456";
export const ORIGIN = "https://qrapido.test";

const now = () => new Date().toISOString();

/** Seeds what a real project has after following the README: staff, one table created by the panel and a small menu. */
export function seedRestaurant(options: { withSettings?: boolean; withRestaurantDoc?: boolean } = {}) {
  fakeDb.reset();
  const db = fakeDb;
  if (options.withRestaurantDoc !== false) {
    void db.collection("restaurants").doc(RESTAURANT_ID).set({ restaurantId: RESTAURANT_ID, name: "Cantina Teste", isActive: true, createdAt: now(), updatedAt: now() });
  }
  void db.collection("staffUsers").doc(ADMIN_UID).set({ uid: ADMIN_UID, email: "admin@teste.com", name: "Admin", role: "admin", restaurantId: RESTAURANT_ID, isActive: true });
  void db.collection("staffUsers").doc(KITCHEN_UID).set({ uid: KITCHEN_UID, email: "cozinha@teste.com", name: "Cozinha", role: "kitchen", restaurantId: RESTAURANT_ID, isActive: true });

  // Same shape the "Nova mesa" form writes through the client SDK.
  const publicToken = "k".repeat(10) + "0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghij";
  void db.collection("tables").doc("table-1").set({
    restaurantId: RESTAURANT_ID, number: 1, label: "Mesa 1", status: "free", capacity: 4, currentPeopleCount: 0,
    activeSessionLimit: 1, activeSessionCount: 0, currentSessionGroupId: null, pinCode: null, publicToken,
    isActive: true, qrCodeValue: `${ORIGIN}/mesa/${publicToken}`, openedAt: null, closedAt: null, createdAt: now(), updatedAt: now()
  });

  void db.collection("menuCategories").doc("cat-1").set({ restaurantId: RESTAURANT_ID, name: "Lanches", slug: "lanches", description: "Lanches da casa", sortOrder: 0, isActive: true, createdAt: now(), updatedAt: now() });
  void db.collection("menuCategories").doc("cat-off").set({ restaurantId: RESTAURANT_ID, name: "Sazonal", slug: "sazonal", description: "Fora de época", sortOrder: 1, isActive: false, createdAt: now(), updatedAt: now() });
  void db.collection("menuItems").doc("item-1").set({ restaurantId: RESTAURANT_ID, categoryId: "cat-1", name: "X-Burger", slug: "x-burger", description: "Pão, carne e queijo", price: 25.5, imageUrl: null, preparationTimeMinutes: 15, isActive: true, isAvailable: true, isFeatured: false, sortOrder: 0, createdAt: now(), updatedAt: now() });
  void db.collection("menuItems").doc("item-2").set({ restaurantId: RESTAURANT_ID, categoryId: "cat-1", name: "Suco", slug: "suco", description: "Suco natural", price: 8, imageUrl: null, preparationTimeMinutes: 5, isActive: true, isAvailable: true, isFeatured: false, sortOrder: 1, createdAt: now(), updatedAt: now() });
  void db.collection("menuCategories").doc("cat-drinks").set({ restaurantId: RESTAURANT_ID, name: "Bebidas", slug: "bebidas", description: "", sortOrder: 2, isActive: true, createdAt: now(), updatedAt: now() });
  void db.collection("menuItems").doc("drink-1").set({ restaurantId: RESTAURANT_ID, categoryId: "cat-drinks", name: "Coca-Cola lata", slug: "coca-lata", description: "350 ml", price: 6, imageUrl: null, preparationTimeMinutes: 0, isActive: true, isAvailable: true, isFeatured: false, sortOrder: 3, createdAt: now(), updatedAt: now() });
  void db.collection("menuItems").doc("item-off").set({ restaurantId: RESTAURANT_ID, categoryId: "cat-off", name: "Sopa", slug: "sopa", description: "Sopa de inverno", price: 20, imageUrl: null, preparationTimeMinutes: 10, isActive: true, isAvailable: true, isFeatured: false, sortOrder: 2, createdAt: now(), updatedAt: now() });

  if (options.withSettings) {
    void db.collection("restaurantSettings").doc("settings-1").set({ restaurantId: RESTAURANT_ID, acceptedPaymentMethods: ["cash", "debit_card"], serviceFeePercent: 10, allowCustomerNotes: true, requireCustomerName: false, waiterCallEnabled: true, billRequestEnabled: true, antiSpamWindowSeconds: 60, maxOrdersPerWindow: 5, defaultSessionDurationMinutes: 120, createdAt: now(), updatedAt: now() });
  }
  return { publicToken };
}

/** Minimal cookie jar so the customer keeps the access cookie between requests, like a browser. */
export class Browser {
  cookies = new Map<string, string>();
  csrf = "";
  absorb(response: Response) {
    const header = response.headers.get("set-cookie");
    if (!header) return;
    for (const part of header.split(/,(?=\s*[a-zA-Z0-9_]+=)/)) {
      const [pair] = part.trim().split(";");
      const index = pair.indexOf("=");
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): NextRequest {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (this.cookies.size) headers.cookie = this.cookieHeader();
    if (init.body !== undefined) headers["content-type"] = "application/json";
    return new NextRequest(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  }
}

export function staffRequest(path: string, uid: string, body?: unknown, method = "POST"): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { authorization: `Bearer test-token:${uid}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export async function json(response: Response): Promise<any> {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
