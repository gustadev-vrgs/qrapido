import "server-only";

import { DEFAULT_BUSINESS_HOURS } from "@/lib/constants/restaurant-settings";

/** Settings a new restaurant starts with (also used by Diagnóstico → Corrigir automaticamente). */
export function defaultRestaurantSettings(restaurantId: string, now: string): Record<string, unknown> {
  return {
    restaurantId,
    acceptedPaymentMethods: ["pix", "cash", "debit_card", "credit_card"],
    pixKey: null,
    pixReceiverName: null,
    pixReceiverCity: null,
    pixInstructions: null,
    businessHours: DEFAULT_BUSINESS_HOURS,
    antiSpamWindowSeconds: 60,
    maxOrdersPerWindow: 5,
    defaultSessionDurationMinutes: 240,
    allowSessionPin: false,
    requireCustomerName: false,
    allowCustomerNotes: true,
    serviceFeePercent: 10,
    waiterCallEnabled: true,
    billRequestEnabled: true,
    createdAt: now,
    updatedAt: now
  };
}
