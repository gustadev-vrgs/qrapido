import type {
  DailyMetric,
  MenuCategory,
  MenuItem,
  Order,
  OrderEvent,
  Restaurant,
  RestaurantSettings,
  StaffUser,
  Table,
  TableSession
} from "@/lib/types/domain";

const now = "2026-01-10T18:30:00.000Z";
const restaurantId = "rest_demo_bela_vista";

export const mockRestaurant: Restaurant = {
  id: restaurantId,
  restaurantId,
  name: "Bistrô Bela Vista",
  slug: "bistro-bela-vista",
  description: "Cozinha contemporânea brasileira com atendimento rápido por QR.",
  address: "Rua das Palmeiras, 120 - Centro, São Paulo - SP",
  phone: "+55 11 95555-4400",
  logoUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300",
  isActive: true,
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: now
};

export const mockStaffUsers: StaffUser[] = [
  {
    id: "staff_admin_1",
    uid: "uid_admin_demo",
    restaurantId,
    name: "Ana Rodrigues",
    email: "admin@belavista.demo",
    role: "admin",
    isActive: true,
    createdAt: "2026-01-01T12:10:00.000Z",
    updatedAt: now
  },
  {
    id: "staff_manager_1",
    uid: "uid_manager_demo",
    restaurantId,
    name: "Carlos Menezes",
    email: "manager@belavista.demo",
    role: "manager",
    isActive: true,
    createdAt: "2026-01-01T12:10:00.000Z",
    updatedAt: now
  }
];

export const mockTables: Table[] = [
  {
    id: "table_01",
    restaurantId,
    number: 1,
    label: "Salão - 01",
    status: "active",
    capacity: 4,
    currentPeopleCount: 3,
    activeSessionLimit: 1,
    activeSessionCount: 1,
    currentSessionGroupId: "group_table_01",
    pinCode: "4821",
    qrCodeValue: "https://example.com/mesa/mock-token-01-secure-public-value",
    publicToken: "mock-token-01-secure-public-value",
    isActive: true,
    openedAt: "2026-01-10T18:05:00.000Z",
    closedAt: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: now
  },
  {
    id: "table_02",
    restaurantId,
    number: 2,
    label: "Salão - 02",
    status: "free",
    capacity: 2,
    currentPeopleCount: 0,
    activeSessionLimit: 1,
    activeSessionCount: 0,
    currentSessionGroupId: null,
    pinCode: null,
    qrCodeValue: "https://example.com/mesa/mock-token-02-secure-public-value",
    publicToken: "mock-token-02-secure-public-value",
    isActive: true,
    openedAt: null,
    closedAt: "2026-01-10T17:32:00.000Z",
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: now
  },
  {
    id: "table_03",
    restaurantId,
    number: 3,
    label: "Varanda - 03",
    status: "awaiting_payment",
    capacity: 4,
    currentPeopleCount: 4,
    activeSessionLimit: 1,
    activeSessionCount: 1,
    currentSessionGroupId: "group_table_03",
    pinCode: "9102",
    qrCodeValue: "https://example.com/mesa/mock-token-03-secure-public-value",
    publicToken: "mock-token-03-secure-public-value",
    isActive: true,
    openedAt: "2026-01-10T17:40:00.000Z",
    closedAt: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: now
  }
];

export const mockTableSessions: TableSession[] = [
  {
    id: "session_01",
    restaurantId,
    tableId: "table_01",
    tableNumber: 1,
    sessionToken: "sess_01_demo_token_abcdefghijkl",
    sessionLabel: "Mesa 1 - Jantar",
    customerName: "Marina",
    status: "active",
    deviceFingerprint: "fp_device_001",
    startedAt: "2026-01-10T18:05:00.000Z",
    expiresAt: "2026-01-10T20:05:00.000Z",
    closedAt: null,
    lastActivityAt: "2026-01-10T18:28:00.000Z",
    requestCountWindow: 2,
    peopleCount: 3,
    maxOrdersAllowed: 3,
    completedOrdersCount: 0,
    openedByStaffId: null,
    notes: null,
    createdAt: "2026-01-10T18:05:00.000Z",
    updatedAt: now
  }
];

export const mockMenuCategories: MenuCategory[] = [
  {
    id: "cat_entradas",
    restaurantId,
    name: "Entradas",
    slug: "entradas",
    description: "Para começar a experiência.",
    sortOrder: 1,
    isActive: true,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: now
  },
  {
    id: "cat_principais",
    restaurantId,
    name: "Pratos principais",
    slug: "pratos-principais",
    description: "Seleção da casa para almoço e jantar.",
    sortOrder: 2,
    isActive: true,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: now
  }
];

export const mockMenuItems: MenuItem[] = [
  {
    id: "item_bruschetta",
    restaurantId,
    categoryId: "cat_entradas",
    name: "Bruschetta artesanal",
    slug: "bruschetta-artesanal",
    description: "Pão italiano, tomate confit e manjericão fresco.",
    price: 24.9,
    imageUrl: null,
    preparationTimeMinutes: 10,
    isActive: true,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 1,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: now
  },
  {
    id: "item_risoto",
    restaurantId,
    categoryId: "cat_principais",
    name: "Risoto de cogumelos",
    slug: "risoto-de-cogumelos",
    description: "Arroz arbóreo, mix de cogumelos e parmesão.",
    price: 58,
    imageUrl: null,
    preparationTimeMinutes: 22,
    isActive: true,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 1,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: now
  }
];

export const mockOrders: Order[] = [
  {
    id: "order_1001",
    restaurantId,
    tableId: "table_01",
    tableNumber: 1,
    sessionId: "session_01",
    sessionToken: "sess_01_demo_token_abcdefghijkl",
    customerName: "Marina",
    items: [
      {
        menuItemId: "item_bruschetta",
        nameSnapshot: "Bruschetta artesanal",
        priceSnapshot: 24.9,
        quantity: 1,
        notes: "Sem cebola",
        total: 24.9
      },
      {
        menuItemId: "item_risoto",
        nameSnapshot: "Risoto de cogumelos",
        priceSnapshot: 58,
        quantity: 1,
        notes: null,
        total: 58
      }
    ],
    subtotal: 82.9,
    serviceFee: 8.29,
    total: 91.19,
    paymentMethod: "pix",
    status: "in_preparation",
    notes: "Cliente com alergia leve a nozes.",
    duplicateGuardHash: "dup_order_1001_token",
    receivedAt: "2026-01-10T18:15:00.000Z",
    deliveredAt: null,
    cancelledAt: null,
    createdAt: "2026-01-10T18:15:00.000Z",
    updatedAt: now
  },
  {
    id: "order_1002",
    restaurantId,
    tableId: "table_03",
    tableNumber: 3,
    sessionId: "session_03",
    sessionToken: "sess_03_demo_token_lmnopqrstuv",
    customerName: "Ricardo",
    items: [
      {
        menuItemId: "item_risoto",
        nameSnapshot: "Risoto de cogumelos",
        priceSnapshot: 58,
        quantity: 2,
        notes: null,
        total: 116
      }
    ],
    subtotal: 116,
    serviceFee: 11.6,
    total: 127.6,
    paymentMethod: "credit_card",
    status: "ready",
    notes: null,
    duplicateGuardHash: "dup_order_1002_token",
    receivedAt: "2026-01-10T17:46:00.000Z",
    deliveredAt: null,
    cancelledAt: null,
    createdAt: "2026-01-10T17:46:00.000Z",
    updatedAt: now
  },
  {
    id: "order_1003",
    restaurantId,
    tableId: "table_02",
    tableNumber: 2,
    sessionId: "session_02",
    sessionToken: "sess_02_demo_token_qwertyuio",
    customerName: "Camila",
    items: [
      {
        menuItemId: "item_bruschetta",
        nameSnapshot: "Bruschetta artesanal",
        priceSnapshot: 24.9,
        quantity: 2,
        notes: null,
        total: 49.8
      }
    ],
    subtotal: 49.8,
    serviceFee: 4.98,
    total: 54.78,
    paymentMethod: "debit_card",
    status: "cancelled",
    notes: "Cliente cancelou antes do preparo.",
    duplicateGuardHash: "dup_order_1003_token",
    receivedAt: "2026-01-10T16:40:00.000Z",
    deliveredAt: null,
    cancelledAt: "2026-01-10T16:44:00.000Z",
    createdAt: "2026-01-10T16:40:00.000Z",
    updatedAt: now
  }
];

export const mockOrderEvents: OrderEvent[] = [
  {
    id: "event_01",
    restaurantId,
    orderId: "order_1001",
    tableId: "table_01",
    sessionId: "session_01",
    type: "order_created",
    actorType: "customer",
    actorId: null,
    message: "Pedido enviado pela mesa 1.",
    metadata: { channel: "mobile" },
    createdAt: "2026-01-10T18:15:05.000Z"
  }
];

export const mockRestaurantSettings: RestaurantSettings = {
  id: "settings_main",
  restaurantId,
  acceptedPaymentMethods: ["pix", "cash", "credit_card", "debit_card"],
  pixKey: "belavista@pix.demo",
  businessHours: {
    monday: { isOpen: true, open: "11:00", close: "23:00" },
    tuesday: { isOpen: true, open: "11:00", close: "23:00" },
    wednesday: { isOpen: true, open: "11:00", close: "23:00" },
    thursday: { isOpen: true, open: "11:00", close: "23:00" },
    friday: { isOpen: true, open: "11:00", close: "00:00" },
    saturday: { isOpen: true, open: "11:00", close: "00:00" },
    sunday: { isOpen: true, open: "12:00", close: "22:00" }
  },
  antiSpamWindowSeconds: 120,
  maxOrdersPerWindow: 4,
  defaultSessionDurationMinutes: 120,
  allowSessionPin: true,
  requireCustomerName: false,
  waiterCallEnabled: true,
  billRequestEnabled: true,
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: now
};

export const mockDailyMetrics: DailyMetric[] = [
  {
    id: "metric_2026_01_04",
    restaurantId,
    dateKey: "2026-01-04",
    totalRevenue: 4988.2,
    totalOrders: 81,
    cancelledOrders: 4,
    averageTicket: 61.58,
    averagePreparationMinutes: 20.4,
    occupiedTablesPeak: 14,
    topItems: [
      { menuItemId: "item_risoto", nameSnapshot: "Risoto de cogumelos", quantity: 18, revenue: 1044 },
      { menuItemId: "item_bruschetta", nameSnapshot: "Bruschetta artesanal", quantity: 31, revenue: 771.9 }
    ],
    createdAt: "2026-01-05T00:02:00.000Z",
    updatedAt: "2026-01-05T00:02:00.000Z"
  },
  {
    id: "metric_2026_01_07",
    restaurantId,
    dateKey: "2026-01-07",
    totalRevenue: 5720.4,
    totalOrders: 86,
    cancelledOrders: 3,
    averageTicket: 66.51,
    averagePreparationMinutes: 19,
    occupiedTablesPeak: 15,
    topItems: [
      { menuItemId: "item_risoto", nameSnapshot: "Risoto de cogumelos", quantity: 20, revenue: 1160 },
      { menuItemId: "item_bruschetta", nameSnapshot: "Bruschetta artesanal", quantity: 33, revenue: 821.7 }
    ],
    createdAt: "2026-01-08T00:02:00.000Z",
    updatedAt: "2026-01-08T00:02:00.000Z"
  },
  {
    id: "metric_2026_01_10",
    restaurantId,
    dateKey: "2026-01-10",
    totalRevenue: 6340.5,
    totalOrders: 94,
    cancelledOrders: 3,
    averageTicket: 67.45,
    averagePreparationMinutes: 18.2,
    occupiedTablesPeak: 17,
    topItems: [
      { menuItemId: "item_risoto", nameSnapshot: "Risoto de cogumelos", quantity: 21, revenue: 1218 },
      { menuItemId: "item_bruschetta", nameSnapshot: "Bruschetta artesanal", quantity: 35, revenue: 871.5 }
    ],
    createdAt: "2026-01-11T00:02:00.000Z",
    updatedAt: "2026-01-11T00:02:00.000Z"
  }
];
