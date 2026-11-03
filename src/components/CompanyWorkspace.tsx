import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, mediaUrl, request, upload } from '../api/client';
import { OperationalWorkspace } from './OperationalWorkspace';
import { IndustrySettingsPage } from './operations/IndustryPage';
import type {
  Company,
  CompanyDocument,
  CompanyFeatures,
  CompanyInput,
  DocumentRequirement,
  Membership,
  Plan,
  Subscription,
  UserProfile,
} from '../api/types';

const documentNames: Record<string, string> = {
  representative_id: 'Identificação do representante',
  nif_certificate: 'Certificado de NIF',
  commercial_registry: 'Registo comercial',
  activity_license: 'Licença de atividade',
  representation_powers: 'Poderes de representação',
  incorporation_publication: 'Publicação de constituição',
  other: 'Outro documento',
};

const statusNames: Record<string, string> = {
  draft: 'Rascunho',
  submitted: 'Submetida',
  under_review: 'Em análise',
  needs_correction: 'Precisa de correções',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  suspended: 'Suspensa',
  pending_payment: 'A aguardar pagamento',
  trialing: 'Teste grátis',
  active: 'Ativa',
  expired: 'Expirada',
  cancelled: 'Cancelada',
  pending: 'Por validar',
  valid: 'Validado',
  invalid: 'Requer correção',
};

const moduleNames: Record<string, string> = {
  customers: 'Clientes',
  inventory: 'Inventário',
  sales: 'Vendas',
  reports: 'Relatórios',
  fiscal: 'Fiscalidade',
  purchases: 'Compras',
};

const requiredProfileFields: Array<{ key: keyof CompanyInput; label: string }> = [
  { key: 'legal_form', label: 'forma jurídica' },
  { key: 'incorporation_date', label: 'data de constituição' },
  { key: 'address', label: 'morada' },
  { key: 'municipality', label: 'município' },
  { key: 'province', label: 'província' },
  { key: 'business_activity', label: 'atividade da empresa' },
];

function missingProfileLabels(input: CompanyInput): string[] {
  return requiredProfileFields
    .filter(({ key }) => !String(input[key] || '').trim())
    .filter(({ key }) => key !== 'municipality' || !String(input.city || '').trim())
    .map(({ label }) => label);
}

function friendlyError(reason: unknown, fallback: string): string {
  if (!(reason instanceof Error)) return fallback;
  const missing = reason.message.match(/company profile is incomplete; missing:\s*([^.]+)/i);
  if (!missing) return reason.message;

  const labels: Record<string, string> = {
    legal_form: 'forma jurídica',
    incorporation_date: 'data de constituição',
    address: 'morada',
    municipality: 'município',
    province: 'província',
    business_activity: 'atividade da empresa',
  };
  const fields = missing[1].split(',').map((field) => labels[field.trim()] || field.trim());
  return `Complete estes dados do perfil antes de submeter: ${fields.join(', ')}.`;
}

const emptyCompany: CompanyInput = {
  legal_name: '',
  trade_name: null,
  nif: '',
  legal_form: null,
  registration_number: null,
  incorporation_date: null,
  email: '',
  phone: null,
  address: null,
  city: null,
  municipality: null,
  province: null,
  country: 'Angola',
  business_activity: null,
};

function companyInput(company: Company): CompanyInput {
  return {
    legal_name: company.legal_name,
    trade_name: company.trade_name,
    nif: company.nif,
    legal_form: company.legal_form,
    registration_number: company.registration_number,
    incorporation_date: company.incorporation_date,
    email: company.email,
    phone: company.phone,
    address: company.address,
    city: company.city,
    municipality: company.municipality,
    province: company.province,
    country: company.country || 'Angola',
    business_activity: company.business_activity,
  };
}

async function optionalSubscription(companyId: string): Promise<Subscription | null> {
  try {
    return await request<Subscription>('/company/subscription', { companyId });
  } catch (reason) {
    if (reason instanceof ApiError && reason.status === 404) return null;
    throw reason;
  }
}

interface IndustryPacksResponse {
  available: Array<{ code: string; name: string; description: string | null }>;
  selected: Array<{ pack_code: string; name: string; enabled: boolean; is_primary: boolean }>;
}

export function CompanyWorkspace({
  profile,
  selectedCompanyId,
  onCompanyChange,
  onLogout,
  isPlatformAdmin,
  onOpenPlatform,
}: {
  profile: UserProfile;
  selectedCompanyId: string;
  onCompanyChange: (id: string) => void;
  onLogout: () => void;
  isPlatformAdmin: boolean;
  onOpenPlatform: () => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [businessType, setBusinessType] = useState<{ code: string; name: string } | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customModules, setCustomModules] = useState<string[]>([]);
  const [form, setForm] = useState<CompanyInput>(emptyCompany);
  const [selectedDocument, setSelectedDocument] = useState('representative_id');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const membership = profile.companies.find((item) => item.company_id === selectedCompanyId);
  const canEdit = company?.status === 'draft' || company?.status === 'needs_correction';
  const canManage = Boolean(membership?.is_admin);
  const requiredCount = useMemo(() => requirements.filter((item) => item.is_required).length, [requirements]);
  const submittedCount = useMemo(
    () => requirements.filter((item) => item.is_required && documents.some((doc) => doc.doc_type === item.doc_type)).length,
    [documents, requirements],
  );

  const loadCompany = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const [companyData, docs, required, sub, availablePlans, industries] = await Promise.all([
        request<Company>('/company', { companyId: selectedCompanyId }),
        canManage
          ? request<CompanyDocument[]>('/company/documents', { companyId: selectedCompanyId })
          : Promise.resolve([] as CompanyDocument[]),
        canManage
          ? request<DocumentRequirement[]>('/company/document-requirements', { companyId: selectedCompanyId })
          : Promise.resolve([] as DocumentRequirement[]),
        canManage ? optionalSubscription(selectedCompanyId) : Promise.resolve(null),
        request<Plan[]>('/plans'),
        request<IndustryPacksResponse>('/company/industry-packs', { companyId: selectedCompanyId }),
      ]);
      setCompany(companyData);
      setForm(companyInput(companyData));
      setDocuments(docs);
      setRequirements(required);
      setSubscription(sub);
      setPlans(availablePlans);
      const primaryIndustry = industries.selected.find((pack) => pack.enabled && pack.is_primary);
      setBusinessType(primaryIndustry ? { code: primaryIndustry.pack_code, name: primaryIndustry.name } : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados da empresa.');
    } finally {
      setLoading(false);
    }
  }, [canManage, selectedCompanyId]);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await request<Company>('/company', {
        method: 'PUT',
        body: form,
        companyId: selectedCompanyId,
      });
      setCompany(updated);
      setNotice('Perfil da empresa guardado.');
    } catch (reason) {
      setError(friendlyError(reason, 'Não foi possível guardar o perfil.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await upload(`/company/documents/${selectedDocument}/file`, file, selectedCompanyId);
      setFile(null);
      setNotice('Documento enviado. A equipa da plataforma poderá agora validá-lo.');
      await loadCompany();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o documento.');
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!businessType) {
      setError('Escolha o tipo de negócio antes de submeter a empresa para validação.');
      document.getElementById('business-type-step')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const missing = missingProfileLabels(form);
    if (missing.length) {
      setError(`Preencha estes campos no perfil da empresa: ${missing.join(', ')}. Depois guarde os dados para continuar.`);
      document.getElementById('company-profile-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await request<Company>('/company', {
        method: 'PUT',
        body: form,
        companyId: selectedCompanyId,
      });
      setCompany(updated);
      await request<Company>('/company/submit', { method: 'POST', companyId: selectedCompanyId });
      setNotice('Empresa submetida para validação.');
      await loadCompany();
    } catch (reason) {
      setError(friendlyError(reason, 'Não foi possível submeter a empresa.'));
    } finally {
      setBusy(false);
    }
  }

  async function choosePlan(planCode: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const chosen = await request<Subscription>('/company/subscription', {
        method: 'PUT',
        body: {
          plan_code: planCode,
          billing_cycle: 'monthly',
          ...(planCode === 'custom' ? { modules: customModules } : {}),
        },
        companyId: selectedCompanyId,
      });
      setSubscription(chosen);
      setNotice('Plano escolhido. A ativação será confirmada pela equipa da plataforma.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível escolher o plano.');
    } finally {
      setBusy(false);
    }
  }

  const updateForm = (key: keyof CompanyInput, value: string) => {
    setForm((current) => ({ ...current, [key]: value || null }));
  };

  function businessTypeSaved(features: CompanyFeatures) {
    const primary = features.packs.find((pack) => pack.code === features.primary_industry_code);
    if (primary) {
      setBusinessType({ code: primary.code, name: primary.name });
      if (company?.status === 'approved') void loadCompany();
    }
  }

  if (loading) return <main className="workspace-loading"><span className="loading-dot" />A carregar empresa…</main>;
  if (!company) {
    return <main className="workspace-main"><div className="alert alert--error">{error || 'Não foi possível encontrar esta empresa.'}</div><button className="button button--primary" onClick={() => void loadCompany()}>Tentar novamente</button></main>;
  }
  if (company.status === 'approved' && businessType) {
    return (
      <OperationalWorkspace
        profile={profile}
        companyId={selectedCompanyId}
        companyName={company.trade_name || company.legal_name}
        onLogout={onLogout}
        onOpenPlatform={onOpenPlatform}
        isPlatformAdmin={isPlatformAdmin}
        memberships={profile.companies}
        onCompanyChange={onCompanyChange}
        defaultView={canManage && subscription?.status !== 'active' && subscription?.status !== 'trialing' ? 'billing' : 'overview'}
        billingOnly={canManage && subscription?.status !== 'active' && subscription?.status !== 'trialing'}
        onSubscriptionChange={() => void loadCompany()}
      />
    );
  }

  return (
    <main className="workspace-main">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">ESPAÇO DA EMPRESA</span>
          <h1>{company.trade_name || company.legal_name}</h1>
          <p>Dados da empresa, validação e subscrição num só lugar.</p>
        </div>
        <div className="company-controls">
          {profile.companies.length > 1 && (
            <label className="company-select">
              <span>Empresa ativa</span>
              <select value={selectedCompanyId} onChange={(event) => onCompanyChange(event.target.value)}>
                {profile.companies.map((item: Membership) => <option key={item.company_id} value={item.company_id}>{item.company_name}</option>)}
              </select>
            </label>
          )}
          <span className={`status-pill status-pill--${company.status}`}>{statusNames[company.status] || company.status}</span>
        </div>
      </div>

      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}

      <section className="welcome-panel">
        <div className="welcome-panel__copy">
          <span className="welcome-panel__overline">O SEU ESPAÇO DE GESTÃO</span>
          <h2>{company.status === 'approved' ? 'A sua empresa está aprovada.' : 'Vamos preparar a sua empresa.'}</h2>
          <p>{company.status === 'approved'
            ? 'A informação de onboarding e a subscrição ficam reunidas aqui. As operações do ERP serão disponibilizadas conforme os módulos ativos.'
            : 'Complete os dados e envie os documentos necessários. A equipa Agatha valida o registo para ativar a operação.'}</p>
        </div>
        <div className="welcome-orbit" aria-hidden="true"><span>A</span><i /><b /></div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-card__label">Estado da empresa</span>
          <strong>{statusNames[company.status] || company.status}</strong>
          <small>{company.status_reason || 'Acompanhe aqui o estado do processo.'}</small>
        </article>
        <article className="summary-card">
          <span className="summary-card__label">Documentos necessários</span>
          <strong>{submittedCount}<span> / {requiredCount}</span></strong>
          <small>Documentos obrigatórios enviados</small>
        </article>
        <article className="summary-card">
          <span className="summary-card__label">Plano</span>
          <strong>{subscription?.plan_code ? subscription.plan_code.toUpperCase() : 'Por escolher'}</strong>
          <small>{subscription ? statusNames[subscription.status] || subscription.status : 'Escolha depois da aprovação'}</small>
        </article>
      </section>

      {canManage && !businessType && (canEdit || company.status === 'approved') && (
        <div id="business-type-step">
          <IndustrySettingsPage
            companyId={selectedCompanyId}
            canManage={canManage}
            onSaved={businessTypeSaved}
          />
        </div>
      )}

      {businessType && (
        <section className="business-type-lock">
          <span className="business-type-lock__icon" aria-hidden="true">◇</span>
          <div><small>AMBIENTE DE NEGÓCIO</small><strong>{businessType.name}</strong><span>Este tipo de negócio fica fixo para esta empresa.</span></div>
          <span className="business-type-lock__badge">CONFIGURAÇÃO FIXA</span>
        </section>
      )}

      {canManage && canEdit && (
        <section className="content-grid">
          <article className="panel-card">
            <div className="panel-heading">
              <div><span className="step-number">01</span><div><h2>Dados da empresa</h2><p>Informação legal e de contacto.</p></div></div>
            </div>
            <form className="company-form" id="company-profile-form" onSubmit={(event) => void saveProfile(event)}>
              <label className="field"><span>Nome legal</span><input required minLength={2} maxLength={200} value={form.legal_name} onChange={(event) => setForm((current) => ({ ...current, legal_name: event.target.value }))} /></label>
              <div className="field-row">
                <label className="field"><span>Nome comercial</span><input maxLength={200} value={form.trade_name || ''} onChange={(event) => updateForm('trade_name', event.target.value)} placeholder="Opcional" /></label>
                <label className="field"><span>NIF</span><input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.nif} onChange={(event) => setForm((current) => ({ ...current, nif: event.target.value }))} /></label>
              </div>
              <div className="field-row">
                <label className="field"><span>Forma jurídica <b className="required-mark">Obrigatório</b></span><input name="legal_form" required maxLength={60} value={form.legal_form || ''} onChange={(event) => updateForm('legal_form', event.target.value)} placeholder="Ex.: LDA, SA, Empresário em nome individual" /></label>
                <label className="field"><span>Data de constituição <b className="required-mark">Obrigatório</b></span><input name="incorporation_date" required type="date" value={form.incorporation_date || ''} onChange={(event) => updateForm('incorporation_date', event.target.value)} /></label>
              </div>
              <div className="field-row">
                <label className="field"><span>Email da empresa</span><input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label className="field"><span>Telefone</span><input value={form.phone || ''} onChange={(event) => updateForm('phone', event.target.value)} placeholder="+244" /></label>
              </div>
              <div className="field-row">
                <label className="field"><span>Município <b className="required-mark">Obrigatório</b></span><input name="municipality" required value={form.municipality || ''} onChange={(event) => updateForm('municipality', event.target.value)} /></label>
                <label className="field"><span>Província <b className="required-mark">Obrigatório</b></span><input name="province" required value={form.province || ''} onChange={(event) => updateForm('province', event.target.value)} /></label>
              </div>
              <label className="field"><span>Morada <b className="required-mark">Obrigatório</b></span><input name="address" required value={form.address || ''} onChange={(event) => updateForm('address', event.target.value)} /></label>
              <label className="field"><span>Atividade da empresa <b className="required-mark">Obrigatório</b></span><textarea name="business_activity" required rows={3} maxLength={500} value={form.business_activity || ''} onChange={(event) => updateForm('business_activity', event.target.value)} placeholder="Descreva brevemente a atividade principal" /></label>
              <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'A guardar…' : 'Guardar dados'} <span aria-hidden="true">→</span></button>
            </form>
          </article>

          <article className="panel-card">
            <div className="panel-heading">
              <div><span className="step-number">02</span><div><h2>Documentos da empresa</h2><p>Ficheiros PDF, JPG ou PNG.</p></div></div>
            </div>
            <div className="document-list">
              {requirements.map((item) => {
                const doc = documents.find((candidate) => candidate.doc_type === item.doc_type);
                return (
                  <div className="document-row" key={item.doc_type}>
                    <span className={`document-state${doc ? ' document-state--done' : ''}`} aria-hidden="true">{doc ? '✓' : '·'}</span>
                    <span className="document-row__main"><strong>{documentNames[item.doc_type] || item.doc_type}</strong><small>{item.is_required ? 'Obrigatório' : 'Opcional'}{doc?.file_name ? ` · ${doc.file_name}` : ''}</small></span>
                    {doc && <span className={`mini-status mini-status--${doc.status}`}>{statusNames[doc.status] || doc.status}</span>}
                  </div>
                );
              })}
            </div>
            <form className="upload-form" onSubmit={(event) => void submitDocument(event)}>
              <label className="field"><span>Tipo de documento</span>
                <select value={selectedDocument} onChange={(event) => setSelectedDocument(event.target.value)}>
                  {requirements.map((item) => <option key={item.doc_type} value={item.doc_type}>{documentNames[item.doc_type] || item.doc_type}</option>)}
                  {requirements.length === 0 && Object.entries(documentNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </label>
              <label className="file-picker">
                <input type="file" accept=".pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                <span className="file-picker__icon" aria-hidden="true">↑</span>
                <span><strong>{file?.name || 'Escolher ficheiro'}</strong><small>PDF, JPEG ou PNG · até ao limite da API</small></span>
              </label>
              <button className="button button--secondary" type="submit" disabled={busy || !file}>{busy ? 'A enviar…' : 'Enviar documento'}</button>
            </form>
            {company.status === 'needs_correction' && company.status_reason && <div className="alert alert--warning">{company.status_reason}</div>}
            <button className="button button--primary button--full" type="button" disabled={busy || submittedCount < requiredCount} onClick={() => void submitForReview()}>
              {busy ? 'A processar…' : 'Submeter para validação'} <span aria-hidden="true">→</span>
            </button>
            {submittedCount < requiredCount && <small className="button-help">Envie todos os documentos obrigatórios para poder submeter.</small>}
          </article>
        </section>
      )}

      {company.status === 'under_review' && (
        <section className="panel-card review-wait">
          <span className="review-wait__icon">◷</span>
          <div><h2>Registo em análise</h2><p>A equipa Agatha está a validar os dados e documentos. Receberá uma notificação quando houver uma atualização.</p></div>
          <button className="button button--secondary" type="button" onClick={() => void loadCompany()}>Atualizar estado</button>
        </section>
      )}

      {company.status === 'approved' && (
        <section className="panel-card plan-section">
          <div className="panel-heading">
            <div><span className="step-number">✳</span><div><h2>Plano e subscrição</h2><p>Os módulos ficam disponíveis quando a subscrição estiver ativa.</p></div></div>
          </div>
          {subscription && (
            <div className="subscription-banner">
              <div><span className="eyebrow">PLANO ATUAL</span><strong>{subscription.plan_code.toUpperCase()}</strong><small>{statusNames[subscription.status] || subscription.status} · {subscription.billing_cycle === 'monthly' ? 'Mensal' : subscription.billing_cycle}</small></div>
              <div className={`status-pill status-pill--${subscription.status}`}>{statusNames[subscription.status] || subscription.status}</div>
            </div>
          )}
          {subscription?.status !== 'active' && (
            <div className="plan-cards">
              {plans.map((plan) => (
                <article className={`plan-card${plan.code === 'pro' ? ' plan-card--featured' : ''}`} key={plan.code}>
                  {plan.code === 'pro' && <span className="plan-card__tag">MAIS COMPLETO</span>}
                  <span className="eyebrow">AGATHA ERP</span>
                  <h3>{plan.name}</h3>
                  <p>{plan.code === 'starter' ? 'As ferramentas essenciais para começar a gerir a empresa.' : plan.code === 'pro' ? 'Mais recursos para acompanhar todas as áreas do negócio.' : 'Monte um conjunto de módulos ajustado à sua operação.'}</p>
                  {plan.code === 'custom' ? (
                    <fieldset className="custom-modules">
                      <legend>Escolha os módulos</legend>
                      {(plans.find((item) => item.code === 'pro')?.modules || [])
                        .filter((module) => moduleNames[module])
                        .map((module) => (
                          <label key={module}>
                            <input
                              type="checkbox"
                              checked={customModules.includes(module)}
                              onChange={(event) => setCustomModules((current) => event.target.checked
                                ? [...current, module]
                                : current.filter((value) => value !== module))}
                            />
                            <span>{moduleNames[module]}</span>
                          </label>
                        ))}
                    </fieldset>
                  ) : <small>{plan.modules.filter((module) => moduleNames[module]).length} módulos incluídos</small>}
                  <button className="button button--secondary button--full" type="button" disabled={busy || (plan.code === 'custom' && customModules.length === 0)} onClick={() => void choosePlan(plan.code)}>Escolher plano</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {company.status !== 'approved' && !canEdit && company.status !== 'under_review' && (
        <section className="panel-card status-message">
          <span className="eyebrow">ESTADO ATUAL</span>
          <h2>{statusNames[company.status] || company.status}</h2>
          <p>{company.status_reason || 'Consulte a equipa da plataforma para obter mais informações sobre o estado do registo.'}</p>
          <button className="button button--secondary" type="button" onClick={() => void loadCompany()}>Atualizar estado</button>
        </section>
      )}

      {company.status === 'approved' && subscription?.status === 'active' && (
        <section className="panel-card active-modules">
          <div className="panel-heading"><div><span className="step-number">✓</span><div><h2>Módulos disponíveis</h2><p>Funcionalidades incluídas na sua subscrição.</p></div></div></div>
          <div className="module-chips">{subscription.modules.map((module) => <span className="module-chip" key={module}>{module.replaceAll('_', ' ')}</span>)}</div>
          <p className="feature-note">As áreas operacionais serão ativadas nesta interface nas próximas etapas de desenvolvimento.</p>
        </section>
      )}

      {documents.length > 0 && company.status === 'approved' && (
        <section className="panel-card">
          <div className="panel-heading"><div><span className="step-number">✓</span><div><h2>Documentos validados</h2><p>Ficheiros associados ao processo da empresa.</p></div></div></div>
          <div className="document-list">
            {documents.map((doc) => (
              <div className="document-row" key={doc.id}>
                <span className="document-state document-state--done">✓</span>
                <span className="document-row__main"><strong>{documentNames[doc.doc_type] || doc.doc_type}</strong><small>{doc.file_name || 'Documento submetido'}</small></span>
                {doc.reference && <a className="text-link" href={mediaUrl(doc.reference)} target="_blank" rel="noreferrer">Abrir</a>}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
