import { useEffect, useMemo, useState } from 'react';
import { request } from '../api/client';
import type { CompanyFeatures, Membership, UserProfile } from '../api/types';
import { Brand } from './Brand';
import { CashRegisterPage } from './operations/CashRegisterPage';
import { CustomersPage } from './operations/CustomersPage';
import { DashboardPage } from './operations/DashboardPage';
import { DocumentsPage } from './operations/DocumentsPage';
import { BarbershopPage } from './operations/BarbershopPage';
import { BillingPage } from './operations/BillingPage';
import { CommercePage } from './operations/CommercePage';
import { HospitalityPage } from './operations/HospitalityPage';
import { PharmacyPage } from './operations/PharmacyPage';
import { PurchasesPage } from './operations/PurchasesPage';
import { ProductsPage } from './operations/ProductsPage';
import { ReceivablesPage } from './operations/ReceivablesPage';
import { RestaurantPage } from './operations/RestaurantPage';
import { SalesPage } from './operations/SalesPage';
import { StockPage } from './operations/StockPage';

type View = string;

const coreNavigation: Array<{ id: View; label: string; icon: string; module: string }> = [
  { id: 'overview', label: 'Visão geral', icon: '⌂', module: 'reports' },
  { id: 'sales', label: 'Vendas', icon: '↗', module: 'sales' },
  { id: 'documents', label: 'Faturas', icon: '▧', module: 'sales' },
  { id: 'receivables', label: 'A receber', icon: '₭', module: 'sales' },
  { id: 'purchases', label: 'Compras', icon: '↙', module: 'purchases' },
  { id: 'cash', label: 'Caixa', icon: '▣', module: 'sales' },
  { id: 'products', label: 'Produtos', icon: '▦', module: 'inventory' },
  { id: 'customers', label: 'Clientes', icon: '♙', module: 'customers' },
  { id: 'stock', label: 'Stock', icon: '▤', module: 'inventory' },
];

const verticalIcons: Record<string, string> = {
  commerce: '▣',
  restaurant: '♨',
  barbershop: '✂',
  pharmacy: '+',
  hospitality: '⌂',
};

export function OperationalWorkspace({
  profile,
  companyId,
  companyName,
  onLogout,
  memberships,
  onCompanyChange,
  isPlatformAdmin,
  onOpenPlatform,
  defaultView,
  billingOnly,
  onSubscriptionChange,
}: {
  profile: UserProfile;
  companyId: string;
  companyName: string;
  onLogout: () => void;
  memberships: Membership[];
  onCompanyChange: (id: string) => void;
  isPlatformAdmin: boolean;
  onOpenPlatform: () => void;
  defaultView: View;
  billingOnly: boolean;
  onSubscriptionChange: () => void;
}) {
  const [view, setView] = useState<View>(defaultView);
  const [refreshKey, setRefreshKey] = useState(0);
  const [features, setFeatures] = useState<CompanyFeatures | null>(null);
  const [featuresError, setFeaturesError] = useState('');
  const canManageBilling = Boolean(profile.companies.find((item) => item.company_id === companyId)?.is_admin);

  useEffect(() => {
    let active = true;
    setFeatures(null);
    setFeaturesError('');
    setView(defaultView);
    if (billingOnly) {
      return () => { active = false; };
    }

    request<CompanyFeatures>('/company/features', { companyId })
      .then((result) => { if (active) setFeatures(result); })
      .catch((reason: unknown) => {
        if (active) setFeaturesError(reason instanceof Error ? reason.message : 'Não foi possível carregar as verticais.');
      });
    return () => { active = false; };
  }, [billingOnly, companyId, defaultView]);

  const navigation = useMemo(() => billingOnly
    ? [{ id: 'billing', label: 'Plano e teste', icon: '◷', module: '' }]
    : [
      ...(features
        ? coreNavigation.filter((item) => features.core_modules.includes(item.module))
        : coreNavigation),
      ...(features?.packs.filter((pack) => pack.enabled && pack.is_primary).map((pack) => ({
        id: `industry:${pack.code}`,
        label: pack.name,
        icon: verticalIcons[pack.code] || '◇',
      })) || []),
      ...(canManageBilling ? [{ id: 'billing', label: 'Plano e teste', icon: '◷', module: '' }] : []),
    ], [billingOnly, canManageBilling, features]);

  useEffect(() => {
    if (features && !navigation.some((item) => item.id === view)) {
      setView(navigation[0]?.id || 'billing');
    }
  }, [features, navigation, view]);

  function navigate(next: string) {
    setView(next);
    setRefreshKey((key) => key + 1);
  }

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <a className="ops-brand" href="#inicio" onClick={(event) => { event.preventDefault(); navigate('overview'); }}>
          <Brand compact />
        </a>
        <div className="ops-company">
          <span className="ops-company__mark">{companyName.slice(0, 1).toUpperCase()}</span>
          {memberships.length > 1 ? (
            <label className="ops-company__select">
              <small>EMPRESA ATIVA</small>
              <select aria-label="Empresa ativa" value={companyId} onChange={(event) => onCompanyChange(event.target.value)}>
                {memberships.map((membership) => <option value={membership.company_id} key={membership.company_id}>{membership.company_name}</option>)}
              </select>
            </label>
          ) : <span><small>EMPRESA ATIVA</small><strong>{companyName}</strong></span>}
          {memberships.length > 1 && <span className="ops-company__chevron">⌄</span>}
        </div>
        <nav className="ops-nav" aria-label="Navegação da empresa">
          <span className="ops-nav__caption">ESPAÇO DE TRABALHO</span>
          {navigation.map((item) => (
            <button type="button" className={view === item.id ? 'ops-nav__item ops-nav__item--active' : 'ops-nav__item'} key={item.id} onClick={() => navigate(item.id)}>
              <span className="ops-nav__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'sales' && <span className="ops-nav__shortcut">POS</span>}
            </button>
          ))}
        </nav>
        <div className="ops-sidebar__bottom">
          {isPlatformAdmin && <button type="button" className="ops-signout ops-platform-link" onClick={onOpenPlatform}>⌘ <span>Administração Nobug Labs</span></button>}
          <div className="ops-user">
            <span className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{profile.full_name}</strong><small>{profile.email}</small></span>
          </div>
          <button type="button" className="ops-signout" onClick={onLogout}>↪ <span>Terminar sessão</span></button>
          <small className="ops-sidebar__copyright">Agatha ERP · Nobug Labs</small>
        </div>
      </aside>
      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-mobile-brand"><Brand compact /></div>
          <div className="ops-breadcrumb"><span>Empresa</span><b>/</b><strong>{navigation.find((item) => item.id === view)?.label}</strong></div>
          <div className="ops-topbar__right">
            <span className="ops-live"><i /> {billingOnly ? 'Gestão da subscrição' : 'Sistema operacional'}</span>
            {isPlatformAdmin && <button type="button" className="ops-admin-shortcut" onClick={onOpenPlatform}>Plataforma</button>}
            <span className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="ops-content">
          {featuresError && <div className="ops-alert ops-alert--error" role="alert">{featuresError}</div>}
          {view === 'overview' && <DashboardPage key={`dashboard-${refreshKey}`} companyId={companyId} onNavigate={navigate} />}
          {view === 'products' && <ProductsPage key={`products-${refreshKey}`} companyId={companyId} />}
          {view === 'documents' && <DocumentsPage key={`documents-${refreshKey}`} companyId={companyId} />}
          {view === 'receivables' && <ReceivablesPage key={`receivables-${refreshKey}`} companyId={companyId} />}
          {view === 'purchases' && <PurchasesPage key={`purchases-${refreshKey}`} companyId={companyId} />}
          {view === 'cash' && <CashRegisterPage key={`cash-${refreshKey}`} companyId={companyId} />}
          {view === 'customers' && <CustomersPage key={`customers-${refreshKey}`} companyId={companyId} />}
          {view === 'stock' && <StockPage key={`stock-${refreshKey}`} companyId={companyId} />}
          {view === 'sales' && <SalesPage key={`sales-${refreshKey}`} companyId={companyId} />}
          {view === 'billing' && <BillingPage key={`billing-${companyId}`} companyId={companyId} canManage={canManageBilling} onSubscriptionChange={onSubscriptionChange} />}
          {view === 'industry:commerce' && <CommercePage key={`commerce-${refreshKey}`} companyId={companyId} />}
          {view === 'industry:restaurant' && <RestaurantPage key={`restaurant-${refreshKey}`} companyId={companyId} />}
          {view === 'industry:barbershop' && <BarbershopPage key={`barbershop-${refreshKey}`} companyId={companyId} />}
          {view === 'industry:pharmacy' && <PharmacyPage key={`pharmacy-${refreshKey}`} companyId={companyId} />}
          {view === 'industry:hospitality' && <HospitalityPage key={`hospitality-${refreshKey}`} companyId={companyId} />}
        </div>
        <footer className="ops-footer">Agatha ERP <span>·</span> Todos os direitos reservados · Nobug Labs</footer>
      </main>
      <nav className="ops-mobile-nav" aria-label="Navegação">
        {navigation.map((item) => (
          <button type="button" className={view === item.id ? 'ops-mobile-nav__item ops-mobile-nav__item--active' : 'ops-mobile-nav__item'} key={item.id} onClick={() => navigate(item.id)}>
            <span aria-hidden="true">{item.icon}</span><small>{item.id === 'overview' ? 'Início' : item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
