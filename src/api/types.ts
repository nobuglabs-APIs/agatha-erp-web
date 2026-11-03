export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Membership {
  company_id: string;
  company_name: string;
  company_status: string;
  is_admin: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  companies: Membership[];
}

export interface Company {
  id: string;
  legal_name: string;
  trade_name: string | null;
  nif: string;
  legal_form: string | null;
  registration_number: string | null;
  incorporation_date: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  municipality: string | null;
  province: string | null;
  country: string;
  business_activity: string | null;
  status: string;
  status_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface CompanyInput {
  legal_name: string;
  trade_name: string | null;
  nif: string;
  legal_form: string | null;
  registration_number: string | null;
  incorporation_date: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  municipality: string | null;
  province: string | null;
  country: string;
  business_activity: string | null;
}

export interface CompanyDocument {
  id: string;
  doc_type: string;
  reference: string;
  document_number: string | null;
  status: string;
  review_notes: string | null;
  file_name: string | null;
  content_type: string | null;
  byte_size: number | null;
  created_at: string;
}

export interface DocumentRequirement {
  doc_type: string;
  is_required: boolean;
  note: string | null;
}

export interface Subscription {
  plan_code: string;
  billing_cycle: string;
  status: string;
  modules: string[];
  starts_at: string | null;
  expires_at: string | null;
  plan_selected_at: string | null;
}

export interface Plan {
  code: string;
  name: string;
  description: string;
  modules: string[];
  customizable: boolean;
  billing_cycles: string[];
  monthly_price_cents: number | null;
  annual_price_cents: number | null;
  usage_rate_bp: number | null;
  currency: string;
}

export interface SubscriptionPaymentAttempt {
  id: string;
  provider: string;
  provider_reference: string | null;
  plan_code: string;
  billing_cycle: string;
  amount_cents: number;
  currency: string;
  status: string;
  period_start: string;
  period_end: string;
  created_at: string;
  paid_at: string | null;
}

export interface SubscriptionCheckoutResponse {
  payment: SubscriptionPaymentAttempt;
  subscription: Subscription;
}

export interface Page<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
}

export interface CompanyDetail {
  company: Company;
  subscription: Subscription | null;
  documents: CompanyDocument[];
  document_requirements: DocumentRequirement[];
  status_history: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    reason: string | null;
    created_at: string;
  }>;
}

export interface CompanyFeatures {
  primary_industry_code: string | null;
  core_modules: string[];
  packs: Array<{
    code: string;
    name: string;
    is_primary: boolean;
    enabled: boolean;
    capabilities: string[];
  }>;
  capabilities: string[];
}
