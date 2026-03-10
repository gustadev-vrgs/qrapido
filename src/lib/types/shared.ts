export interface SelectOption<T = string> {
  label: string;
  value: T;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface StatCardData {
  title: string;
  value: string;
  hint?: string;
}
