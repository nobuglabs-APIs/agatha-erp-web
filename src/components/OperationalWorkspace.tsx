import { useEffect, useMemo, useState } from 'react';
import { request } from '../api/client';
import type { CompanyFeatures, Membership, UserProfile } from '../api/types';
import { Brand } from './Brand';
import { Icon, type IconName } from './Icon';
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

const coreNavigation: Array<{ id: View; label: string; icon: IconName; module: string }> = [
  { id: 'overview', label: 'Visão geral', icon: 'home', module: 'reports' },
  { id: 'sales', label: 'Vendas', icon: 'trend', module: 'sales' },
  { id: 'documents', label: 'Faturas', icon: 'invoice', module: 'sales' },
  { id: 'receivables', label: 'A receber', icon: 'wallet', module: 'sales' },
  { id: 'purchases', label: 'Compras', icon: 'bag', module: 'purchases' },
  { id: 'cash', label: 'Caixa', icon: 'banknote', module: 'sales' },
  { id: 'products', label: 'Produtos', icon: 'package', module: 'inventory' },
  { id: 'customers', label: 'Clientes', icon: 'users', module: 'customers' },
  { id: 'stock', label: 'Stock', icon: 'layers', module: 'inventory' },
];

const verticalIcons: Record<string, IconName> = {
  commerce: 'store',
  restaurant: 'utensils',
  barbershop: 'scissors',
  pharmacy: 'pill',
  hospitality: 'bed',
};

export function OperationalWorkspace({
  profile,
  companyId,
  companyName,
  onLogout,
  memberships,
  onCompanyChange,
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
  defaultView: View;
  billingOnly: boolean;
  onSubscriptionChange: () => void;
}) {
  const [view, setView] = useState<View>(defaultView);
  const [refreshKey, setRefreshKey] = useState(0);
  const [features, setFeatures] = useState<CompanyFeatures | null>(null);
  const [featuresError, setFeaturesError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    ? [{ id: 'billing', label: 'Plano e teste', icon: 'card' as IconName, module: '' }]
    : [
      ...(features
        ? coreNavigation.filter((item) => features.core_modules.includes(item.module))
        : coreNavigation),
      ...(features?.packs.filter((pack) => pack.enabled && pack.is_primary).map((pack) => ({
        id: `industry:${pack.code}`,
        label: pack.name,
        icon: verticalIcons[pack.code] || ('spark' as IconName),
      })) || []),
      ...(canManageBilling ? [{ id: 'billing', label: 'Plano e teste', icon: 'card' as IconName, module: '' }] : []),
    ], [billingOnly, canManageBilling, features]);

  useEffect(() => {
    if (features && !navigation.some((item) => item.id === view)) {
      setView(navigation[0]?.id || 'billing');
    }
  }, [features, navigation, view]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const media = window.matchMedia('(max-width: 780px)');
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    }
    function handleViewportChange() {
      if (!media.matches) {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    media.addEventListener('change', handleViewportChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      media.removeEventListener('change', handleViewportChange);
    };
  }, [mobileMenuOpen]);

  const mobilePrimaryNavigation = navigation.slice(0, 4);
  const mobileMenuActive = mobileMenuOpen || !mobilePrimaryNavigation.some((item) => item.id === view);

  function navigate(next: string) {
    setView(next);
    setRefreshKey((key) => key + 1);
    setMobileMenuOpen(false);
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
              <span className="ops-nav__icon" aria-hidden="true"><Icon name={item.icon} /></span>
              <span>{item.label}</span>
              {item.id === 'sales' && <span className="ops-nav__shortcut">POS</span>}
            </button>
          ))}
        </nav>
        <div className="ops-sidebar__bottom">
          <div className="ops-user">
            <span className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{profile.full_name}</strong><small>{profile.email}</small></span>
          </div>
          <button type="button" className="ops-signout" onClick={onLogout}><Icon name="logout" size={15} /> <span>Terminar sessão</span></button>
          <small className="ops-sidebar__copyright">Ágata ERP · Nobug Labs</small>
        </div>
      </aside>
      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-mobile-brand"><Brand compact /></div>
          <div className="ops-breadcrumb"><span>Empresa</span><b>/</b><strong>{navigation.find((item) => item.id === view)?.label}</strong></div>
          <div className="ops-topbar__right">
            <span className="ops-live"><i /> {billingOnly ? 'Gestão da subscrição' : 'Sistema operacional'}</span>
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
        <footer className="ops-footer">Ágata ERP <span>·</span> Todos os direitos reservados · Nobug Labs</footer>
      </main>
      <nav className="ops-mobile-nav" aria-label="Navegação">
        {mobilePrimaryNavigation.map((item) => (
          <button type="button" className={view === item.id ? 'ops-mobile-nav__item ops-mobile-nav__item--active' : 'ops-mobile-nav__item'} key={item.id} onClick={() => navigate(item.id)}>
            <span aria-hidden="true"><Icon name={item.icon} size={19} /></span><small>{item.id === 'overview' ? 'Início' : item.label}</small>
          </button>
        ))}
        <button type="button" className={mobileMenuActive ? 'ops-mobile-nav__item ops-mobile-nav__item--active' : 'ops-mobile-nav__item'} onClick={() => setMobileMenuOpen(true)} aria-haspopup="dialog" aria-expanded={mobileMenuOpen}>
          <span aria-hidden="true"><Icon name="grid" size={19} /></span><small>Mais</small>
        </button>
      </nav>
      {mobileMenuOpen && (
        <div className="ops-sheet-layer">
          <button type="button" className="ops-sheet-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />
          <div className="ops-sheet" role="dialog" aria-modal="true" aria-label="Menu de navegação">
            <span className="ops-sheet__handle" aria-hidden="true" />
            <div className="ops-sheet__head">
              <div>
                <small>NAVEGAÇÃO</small>
                <strong>{companyName}</strong>
              </div>
              <button type="button" className="ops-icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu"><Icon name="close" size={15} /></button>
            </div>
            {memberships.length > 1 && (
              <label className="ops-sheet__company">
                <small>EMPRESA ATIVA</small>
                <select aria-label="Empresa ativa" value={companyId} onChange={(event) => { setMobileMenuOpen(false); onCompanyChange(event.target.value); }}>
                  {memberships.map((membership) => <option value={membership.company_id} key={membership.company_id}>{membership.company_name}</option>)}
                </select>
              </label>
            )}
            <div className="ops-sheet__grid">
              {navigation.map((item) => (
                <button type="button" className={view === item.id ? 'ops-sheet__item ops-sheet__item--active' : 'ops-sheet__item'} key={item.id} onClick={() => navigate(item.id)}>
                  <span aria-hidden="true"><Icon name={item.icon} size={18} /></span>
                  <small>{item.label}</small>
                </button>
              ))}
            </div>
            <div className="ops-sheet__actions">
              <button type="button" className="ops-sheet__action ops-sheet__action--danger" onClick={() => { setMobileMenuOpen(false); onLogout(); }}><Icon name="logout" size={16} /><span>Terminar sessão</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
