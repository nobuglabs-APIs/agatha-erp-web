import { useEffect, useMemo, useState } from 'react';
import { request } from '../api/client';
import { syncPendingSales } from '../api/offlineSync';
import { listenOfflineChanges, listPendingSales } from '../api/offlineStore';
import type { Company, CompanyFeatures, Membership, UserProfile } from '../api/types';
import { getVertical } from '../verticals/registry';
import { Brand } from './Brand';
import { Icon, type IconName } from './Icon';
import { CashRegisterPage } from './operations/CashRegisterPage';
import { CustomersPage } from './operations/CustomersPage';
import { DashboardPage } from './operations/DashboardPage';
import { DocumentsPage } from './operations/DocumentsPage';
import { BillingPage } from './operations/BillingPage';
import { PurchasesPage } from './operations/PurchasesPage';
import { ProductsPage } from './operations/ProductsPage';
import { ReceivablesPage } from './operations/ReceivablesPage';
import { SalesPage } from './operations/SalesPage';
import { StockPage } from './operations/StockPage';
import { SettingsPage } from './operations/SettingsPage';
import { VerticalWorkspaceHeader } from '../verticals/VerticalWorkspaceHeader';

type View = string;

type NavigationItem = {
  id: View;
  label: string;
  icon: IconName;
  module: string;
  section: 'primary' | 'finance' | 'vertical' | 'management';
};

const coreNavigation: Array<{ id: View; label: string; icon: IconName; module: string; section: 'primary' | 'finance' }> = [
  { id: 'overview', label: 'Visão geral', icon: 'home', module: 'reports', section: 'primary' },
  { id: 'sales', label: 'Vendas', icon: 'trend', module: 'sales', section: 'primary' },
  { id: 'products', label: 'Produtos', icon: 'package', module: 'inventory', section: 'primary' },
  { id: 'customers', label: 'Clientes', icon: 'users', module: 'customers', section: 'primary' },
  { id: 'stock', label: 'Stock', icon: 'layers', module: 'inventory', section: 'primary' },
  { id: 'documents', label: 'Faturas', icon: 'invoice', module: 'sales', section: 'finance' },
  { id: 'receivables', label: 'A receber', icon: 'wallet', module: 'sales', section: 'finance' },
  { id: 'purchases', label: 'Compras', icon: 'bag', module: 'purchases', section: 'finance' },
  { id: 'cash', label: 'Caixa', icon: 'banknote', module: 'sales', section: 'finance' },
];

export function OperationalWorkspace({
  profile,
  companyId,
  companyName,
  company,
  onLogout,
  memberships,
  onCompanyChange,
  defaultView,
  primaryVerticalCode,
  billingOnly,
  onSubscriptionChange,
  onCompanyUpdated,
}: {
  profile: UserProfile;
  companyId: string;
  companyName: string;
  company: Company;
  onLogout: () => void;
  memberships: Membership[];
  onCompanyChange: (id: string) => void;
  defaultView: View;
  primaryVerticalCode: string;
  billingOnly: boolean;
  onSubscriptionChange: () => void;
  onCompanyUpdated: (company: Company) => void;
}) {
  const [view, setView] = useState<View>(defaultView);
  const [refreshKey, setRefreshKey] = useState(0);
  const [features, setFeatures] = useState<CompanyFeatures | null>(null);
  const [featuresError, setFeaturesError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [syncError, setSyncError] = useState('');
  const [verticalTab, setVerticalTab] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const canManageBilling = Boolean(profile.companies.find((item) => item.company_id === companyId)?.is_admin);
  const activeVertical = billingOnly ? undefined : getVertical(primaryVerticalCode);

  useEffect(() => {
    let active = true;
    const refreshPendingCount = async () => {
      const pending = await listPendingSales(companyId);
      if (active) setPendingSaleCount(pending.length);
    };
    const synchronize = async () => {
      setIsOnline(navigator.onLine);
      if (!navigator.onLine) {
        await refreshPendingCount();
        return;
      }
      try {
        await syncPendingSales(companyId);
        if (active) setSyncError('');
      } catch (reason) {
        if (active) setSyncError(reason instanceof Error ? reason.message : 'Não foi possível sincronizar as vendas.');
      }
      await refreshPendingCount();
    };
    const onOffline = () => {
      setIsOnline(false);
      void refreshPendingCount();
    };
    const unsubscribe = listenOfflineChanges((changedCompanyId) => {
      if (changedCompanyId === companyId) void refreshPendingCount();
    });
    window.addEventListener('online', synchronize);
    window.addEventListener('offline', onOffline);
    void synchronize();
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('online', synchronize);
      window.removeEventListener('offline', onOffline);
    };
  }, [companyId]);

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

  const navigation = useMemo<NavigationItem[]>(() => {
    if (billingOnly) {
      return [{ id: 'billing', label: 'Plano e teste', icon: 'card', module: '', section: 'management' }];
    }
    const items: NavigationItem[] = features
      ? coreNavigation
        .filter((item) => features.core_modules.includes(item.module))
        .map((item) => ({ ...item }))
      : [...coreNavigation];
    for (const pack of features?.packs.filter((pack) => pack.enabled && pack.is_primary) || []) {
      items.push({
        id: `industry:${pack.code}`,
        label: getVertical(pack.code)?.name || pack.name,
        icon: getVertical(pack.code)?.icon || 'spark',
        module: '',
        section: 'vertical',
      });
    }
    if (canManageBilling) {
      items.push({ id: 'settings', label: 'Configurações', icon: 'grid', module: '', section: 'management' });
    }
    return items;
  }, [billingOnly, canManageBilling, features]);

  useEffect(() => {
    setVerticalTab(activeVertical?.tabs[0]?.id || '');
  }, [activeVertical?.code, companyId]);

  useEffect(() => {
    const auxiliaryViews = new Set(['billing', 'settings']);
    if (features && !auxiliaryViews.has(view) && !navigation.some((item) => item.id === view)) {
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

  const mobilePrimaryNavigation = navigation
    .filter((item) => item.section === 'primary')
    .slice(0, 4);
  const mobileMenuActive = mobileMenuOpen || !mobilePrimaryNavigation.some((item) => item.id === view);

  function navigate(next: string) {
    setView(next);
    setProfileMenuOpen(false);
    setRefreshKey((key) => key + 1);
    setMobileMenuOpen(false);
  }

  const sidebarNavigation = activeVertical
    ? [
      { id: `industry:${activeVertical.code}`, label: activeVertical.name, icon: activeVertical.icon, module: '', section: 'vertical' as const },
      ...navigation.filter((item) => item.section !== 'vertical'),
    ]
    : navigation;

  function selectVerticalTab(tabId: string) {
    setVerticalTab(tabId);
    const destination = `industry:${activeVertical?.code || primaryVerticalCode}`;
    if (view !== destination) navigate(destination);
    else {
      setProfileMenuOpen(false);
      setMobileMenuOpen(false);
    }
  }

  return (
    <div className={activeVertical ? `ops-shell ops-shell--vertical ops-shell--${activeVertical.code}` : 'ops-shell'} data-vertical={activeVertical?.code}>
      <aside className="ops-sidebar">
        <a className="ops-brand" href="#inicio" onClick={(event) => { event.preventDefault(); navigate('overview'); }}>
          <Brand compact />
        </a>
        <div className="ops-company">
          <span className="ops-company__mark" title={companyName}>{companyName.slice(0, 1).toUpperCase()}</span>
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
          {sidebarNavigation.map((item, index, visibleNavigation) => {
            const section = item.section;
            const previousSection = index > 0
              ? visibleNavigation[index - 1].section
              : null;
            const showCaption = section !== previousSection;
            const captions = {
              primary: 'OPERAÇÕES',
              finance: 'DOCUMENTOS E FINANÇAS',
              vertical: 'VERTICAIS',
              management: 'GESTÃO',
            };
            return (
              <div className="ops-nav__group" key={item.id}>
                {showCaption && <span className="ops-nav__caption">{captions[section as keyof typeof captions]}</span>}
                <button type="button" title={item.label} aria-label={item.label} className={view === item.id ? 'ops-nav__item ops-nav__item--active' : 'ops-nav__item'} key={item.id} onClick={() => navigate(item.id)}>
                  <span className="ops-nav__icon" aria-hidden="true"><Icon name={item.icon} /></span>
                  <span className="ops-nav__label">{item.label}</span>
                  {item.id === 'sales' && <span className="ops-nav__shortcut">POS</span>}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="ops-sidebar__bottom">
          <small className="ops-sidebar__copyright">Ágata ERP · Nobug Labs</small>
        </div>
      </aside>
      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-mobile-brand"><Brand compact /></div>
          <div className="ops-tablet-company" title={companyName}>
            <span>{companyName.slice(0, 1).toUpperCase()}</span>
            <strong>{companyName}</strong>
          </div>
          <div className="ops-breadcrumb">
            <span>Empresa</span>
            <b>/</b>
            <strong>{view === 'billing' ? 'Plano e faturação' : view === 'settings' ? 'Configurações' : navigation.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="ops-topbar__right">
            <span className={isOnline ? 'ops-live' : 'ops-live ops-live--offline'}>
              <i />
              {isOnline
                ? `Online${pendingSaleCount ? ` · ${pendingSaleCount} pendente(s)` : ''}`
                : `Offline${pendingSaleCount ? ` · ${pendingSaleCount} pendente(s)` : ''}`}
            </span>
            <div className="ops-profile">
              <button type="button" className="ops-profile__button" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
                <span className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</span>
                <span><strong>{profile.full_name}</strong><small>Minha conta</small></span>
                <i aria-hidden="true">⌄</i>
              </button>
              {profileMenuOpen && (
                <div className="ops-profile__menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); navigate('settings'); }}><Icon name="users" size={16} /><span>Perfil da conta</span></button>
                  {canManageBilling && (
                    <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); navigate('billing'); }}><Icon name="card" size={16} /><span>Plano e faturação</span></button>
                  )}
                  <button type="button" role="menuitem" className="ops-profile__menu-danger" onClick={onLogout}><Icon name="logout" size={16} /><span>Terminar sessão</span></button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="ops-content">
          {activeVertical && (
            <VerticalWorkspaceHeader
              vertical={activeVertical}
              activeTab={view.startsWith('industry:') ? verticalTab : ''}
              onSelectTab={selectVerticalTab}
            />
          )}
          {featuresError && <div className="ops-alert ops-alert--error" role="alert">{featuresError}</div>}
          {syncError && <div className="ops-alert ops-alert--warning" role="status">{syncError}</div>}
          {view === 'overview' && <DashboardPage key={`dashboard-${refreshKey}`} companyId={companyId} userName={profile.full_name} onNavigate={navigate} />}
          {view === 'products' && <ProductsPage key={`products-${refreshKey}`} companyId={companyId} />}
          {view === 'documents' && <DocumentsPage key={`documents-${refreshKey}`} companyId={companyId} />}
          {view === 'receivables' && <ReceivablesPage key={`receivables-${refreshKey}`} companyId={companyId} />}
          {view === 'purchases' && <PurchasesPage key={`purchases-${refreshKey}`} companyId={companyId} />}
          {view === 'cash' && <CashRegisterPage key={`cash-${refreshKey}`} companyId={companyId} />}
          {view === 'customers' && <CustomersPage key={`customers-${refreshKey}`} companyId={companyId} />}
          {view === 'stock' && <StockPage key={`stock-${refreshKey}`} companyId={companyId} />}
          {view === 'sales' && <SalesPage key={`sales-${refreshKey}`} companyId={companyId} />}
          {view === 'settings' && (
            <SettingsPage
              profileName={profile.full_name}
              profileEmail={profile.email}
              company={company}
              companyId={companyId}
              onCompanyUpdated={onCompanyUpdated}
              canManageBilling={canManageBilling}
              onOpenBilling={() => navigate('billing')}
            />
          )}
          {view === 'billing' && <BillingPage key={`billing-${companyId}`} companyId={companyId} canManage={canManageBilling} onSubscriptionChange={onSubscriptionChange} />}
          {view.startsWith('industry:') && (() => {
            const vertical = getVertical(view.slice('industry:'.length));
            if (!vertical) return null;
            const VerticalPage = vertical.component;
            return (
              <div className="ops-vertical-workspace" data-vertical={vertical.code}>
                <VerticalPage
                  key={`${vertical.code}-${refreshKey}`}
                  companyId={companyId}
                  activeTab={verticalTab}
                  onSelectTab={selectVerticalTab}
                />
              </div>
            );
          })()}
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
              {sidebarNavigation.map((item) => (
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
