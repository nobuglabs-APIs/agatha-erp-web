import { ApiError, request } from '../../api/client';
import type { Page } from '../../api/types';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  product_type: 'goods' | 'service';
  unit_price_cents: number;
  cost_price_cents: number;
  tax_rate_bp: number;
  track_stock: boolean;
  stock_quantity: number;
  min_stock: number;
  is_active: boolean;
  image_url: string | null;
}

export interface Customer {
  id: string;
  name: string;
  trade_name: string | null;
  customer_type: 'company' | 'individual';
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string;
  payment_terms_days: number;
  credit_limit_cents: number;
  is_active: boolean;
}

export interface Sale {
  id: string;
  number: number;
  customer_id: string | null;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  paid_cents: number;
  refunded_cents: number;
  created_at: string;
  invoice_document_id: string | null;
  invoice_document_number: string | null;
  invoice_document_type: string | null;
}

export interface StockMovement {
  id: string;
  product_id: string;
  delta: number;
  reason: string;
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

export interface SalesSummary {
  from: string;
  to: string;
  sales_count: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  by_payment_method: Array<{ method: string; amount_cents: number }>;
}

export function money(cents: number): string {
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: 'AOA',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function parseAmountCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function dateTime(value: string): string {
  return new Date(value).toLocaleString('pt-AO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getErrorMessage(reason: unknown, fallback: string): string {
  if (!(reason instanceof Error)) return fallback;
  if (reason instanceof ApiError && reason.status === 402) {
    return 'Este módulo não está incluído numa subscrição ativa da empresa.';
  }
  if (reason instanceof ApiError && reason.status === 403) {
    return 'O seu perfil não tem permissão para esta operação. Peça ao administrador da empresa para rever o seu papel.';
  }
  return reason.message;
}

export async function listPage<T>(path: string, companyId: string, perPage = 100): Promise<Page<T>> {
  const query = path.includes('?') ? '&' : '?';
  return request<Page<T>>(`${path}${query}page=1&per_page=${perPage}`, { companyId });
}

export function productPayload(form: FormData) {
  const productType = String(form.get('product_type') || 'goods') as Product['product_type'];
  return {
    sku: String(form.get('sku') || '').trim(),
    name: String(form.get('name') || '').trim(),
    description: String(form.get('description') || '').trim() || null,
    category_id: null,
    unit_id: null,
    tax_id: null,
    barcode: String(form.get('barcode') || '').trim() || null,
    product_type: productType,
    unit_price_cents: Math.round(Number(form.get('price') || 0) * 100),
    cost_price_cents: Math.round(Number(form.get('cost') || 0) * 100),
    tax_rate_bp: Math.round(Number(form.get('tax') || 0) * 100),
    track_stock: productType === 'goods',
    min_stock: Math.round(Number(form.get('minimum') || 0)),
    initial_stock: productType === 'goods' ? Math.round(Number(form.get('stock') || 0)) : 0,
  };
}

export function customerPayload(form: FormData) {
  const optional = (key: string) => String(form.get(key) || '').trim() || null;
  return {
    name: String(form.get('name') || '').trim(),
    trade_name: optional('trade_name'),
    customer_type: String(form.get('customer_type') || 'company'),
    nif: optional('nif')?.toUpperCase() || null,
    email: optional('email'),
    phone: optional('phone'),
    address: optional('address'),
    city: optional('city'),
    province: optional('province'),
    country: optional('country') || 'Angola',
    postal_code: null,
    payment_terms_days: Math.round(Number(form.get('payment_terms_days') || 0)),
    credit_limit_cents: Math.round(Number(form.get('credit_limit') || 0) * 100),
    notes: optional('notes'),
  };
}

export type { Page };
