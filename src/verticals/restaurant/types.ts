import type { Product } from '../../components/operations/shared';

export interface Table {
  id: string;
  code: string;
  name: string | null;
  area: string | null;
  seats: number;
  position_x: number;
  position_y: number;
  status: string;
}

export interface MenuItem {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  description: string | null;
  category_name: string | null;
  unit_price_cents: number;
  tax_rate_bp: number;
  station: string;
  prep_minutes: number;
  is_available: boolean;
  sort_order: number;
}

export interface Order {
  id: string;
  number: number;
  table_id: string | null;
  table_code: string | null;
  order_type: string;
  status: string;
  notes: string | null;
  total_cents: number;
  paid_cents: number;
  created_at: string;
}

export interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  status: string;
  notes: string | null;
}

export interface OrderPayment {
  id: string;
  split_id: string | null;
  method: string;
  amount_cents: number;
  created_at: string;
}

export interface OrderSplit {
  id: string;
  label: string;
  amount_cents: number;
  paid_cents: number;
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  payments: OrderPayment[];
  splits: OrderSplit[];
}

export interface KitchenItem {
  item_id: string;
  order_id: string;
  order_number: number;
  table_code: string | null;
  order_type: string;
  description: string;
  quantity: number;
  notes: string | null;
  status: string;
  station: string | null;
  prep_minutes: number | null;
  created_at: string;
}

export type Tab = 'floor' | 'orders' | 'kitchen' | 'menu';

export type Sheet =
  | { kind: 'none' }
  | { kind: 'new'; orderType: 'dine_in' | 'takeaway'; tableId: string }
  | { kind: 'order'; orderId: string };

export const stationOrder = ['kitchen', 'bar', 'grill', 'dessert', 'other'];
export const stationLabels: Record<string, string> = {
  kitchen: 'Cozinha',
  bar: 'Bar',
  grill: 'Grelha',
  dessert: 'Sobremesas',
  other: 'Outra',
};
export const orderStatusLabels: Record<string, string> = {
  open: 'Aberto',
  in_kitchen: 'Na cozinha',
  ready: 'Pronto',
  served: 'Servido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
};
export const paymentMethods = [
  ['cash', 'Dinheiro'],
  ['multicaixa_express', 'Multicaixa Express'],
  ['card', 'Cartão'],
  ['bank_transfer', 'Transferência'],
  ['other', 'Outro'],
] as const;

export function elapsedMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function tableStatusLabel(status: string): string {
  return { free: 'Livre', occupied: 'Ocupada', reserved: 'Reservada', inactive: 'Inativa' }[status] || status;
}

export type { Product };
