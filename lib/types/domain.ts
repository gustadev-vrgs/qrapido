export interface RestaurantSession {
  sessionToken: string;
  tableNumber?: number;
}

export interface DashboardMetric {
  label: string;
  value: string;
  trend: string;
}
