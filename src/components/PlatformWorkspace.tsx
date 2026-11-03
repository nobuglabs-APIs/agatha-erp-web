import { useCallback, useEffect, useState } from 'react';
import { ApiError, mediaUrl, request } from '../api/client';
import type { Company, CompanyDetail, Page } from '../api/types';

const statuses = [
  { value: '', label: 'Todas as empresas' },
  { value: 'pending_payment', label: 'Planos por ativar' },
  { value: 'submitted', label: 'Submetidas' },
  { value: 'under_review', label: 'Em análise' },
  { value: 'needs_correction', label: 'Correções solicitadas' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'rejected', label: 'Rejeitadas' },
  { value: 'suspended', label: 'Suspensas' },
];

const statusNames: Record<string, string> = {
  draft: 'Rascunho',
  submitted: 'Submetida',
  under_review: 'Em análise',
  needs_correction: 'Precisa de correções',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  suspended: 'Suspensa',
  pending: 'Por validar',
  pending_payment: 'Por ativar',
  trialing: 'Teste grátis',
  valid: 'Validado',
  invalid: 'Inválido',
};

const billingCycleNames: Record<string, string> = {
  monthly: 'Mensal',
  annual: 'Anual',
  usage: 'Por utilização',
};

function subscriptionExpiry(billingCycle: string): string | null {
  const months = billingCycle === 'monthly' ? 1 : billingCycle === 'annual' ? 12 : null;
  if (months === null) return null;

  const start = new Date();
  const expiry = new Date(start);
  const startDay = start.getUTCDate();
  expiry.setUTCDate(1);
  expiry.setUTCMonth(start.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0)).getUTCDate();
  expiry.setUTCDate(Math.min(startDay, lastDay));
  return expiry.toISOString();
}

const documentNames: Record<string, string> = {
  representative_id: 'Identificação do representante',
  nif_certificate: 'Certificado de NIF',
  commercial_registry: 'Registo comercial',
  activity_license: 'Licença de atividade',
  representation_powers: 'Poderes de representação',
  incorporation_publication: 'Publicação de constituição',
  other: 'Outro documento',
};

export function PlatformWorkspace() {
  const [status, setStatus] = useState('submitted');
  const [page, setPage] = useState<Page<Company> | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: '1', per_page: '25' });
      if (status === 'pending_payment') {
        query.set('subscription_status', status);
      } else if (status) {
        query.set('status', status);
      }
      setPage(await request<Page<Company>>(`/platform/companies?${query.toString()}`));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 403) {
        setError('Esta conta não tem acesso à administração da plataforma.');
      } else {
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as empresas.');
      }
    } finally {
      setLoading(false);
    }
  }, [status]);

  const loadDetail = useCallback(async (companyId: string) => {
    setError('');
    try {
      setDetail(await request<CompanyDetail>(`/platform/companies/${companyId}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o processo da empresa.');
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  async function performAction(path: string, method = 'POST', body?: unknown, success?: string) {
    if (!detail) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<Company>(path, { method, body });
      setNotice(success || 'Alteração guardada.');
      await Promise.all([loadCompanies(), loadDetail(detail.company.id)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }

  const startReview = () => void performAction(
    `/platform/companies/${detail?.company.id}/start-review`,
    'POST',
    undefined,
    'A revisão foi iniciada.',
  );
  const approve = () => void performAction(
    `/platform/companies/${detail?.company.id}/approve`,
    'POST',
    undefined,
    'Empresa aprovada.',
  );

  async function activateSubscription() {
    const subscription = detail?.subscription;
    if (!detail || !subscription || !subscription.plan_selected_at
      || !['pending_payment', 'trialing'].includes(subscription.status)) return;
    const confirmed = window.confirm(
      `Confirma que o pagamento do plano ${subscription.plan_code.toUpperCase()} foi recebido? A subscrição será ativada.`,
    );
    if (!confirmed) return;
    await performAction(
      `/platform/companies/${detail.company.id}/subscription/activate`,
      'POST',
      { expires_at: subscriptionExpiry(subscription.billing_cycle) },
      'Pagamento confirmado e subscrição ativada.',
    );
  }

  async function reviewDocument(id: string, documentStatus: 'valid' | 'invalid') {
    const notes = documentStatus === 'invalid' ? window.prompt('Indique o que a empresa deve corrigir:') : null;
    if (documentStatus === 'invalid' && !notes) return;
    await performAction(`/platform/documents/${id}/review`, 'PATCH', {
      status: documentStatus,
      notes,
    }, documentStatus === 'valid' ? 'Documento validado.' : 'Correção registada.');
  }

  async function requestCorrection() {
    const reason = window.prompt('Explique à empresa o que precisa de ser corrigido:');
    if (!reason?.trim()) return;
    await performAction(`/platform/companies/${detail?.company.id}/request-correction`, 'POST', { reason }, 'Pedido de correção enviado.');
  }

  const company = detail?.company;

  return (
    <main className="workspace-main platform-main">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">BACKOFFICE NOBUG LABS</span>
          <h1>Empresas</h1>
          <p>Revise os registos, valide documentos e acompanhe o processo de aprovação.</p>
        </div>
        <div className="platform-heading-actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setStatus('pending_payment')}
          >
            Ver planos por ativar
          </button>
          <button className="button button--secondary" type="button" onClick={() => void loadCompanies()}>↻ <span>Atualizar</span></button>
        </div>
      </div>

      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}

      <section className="summary-grid platform-summary">
        <article className="summary-card"><span className="summary-card__label">Empresas neste filtro</span><strong>{page?.total ?? '—'}</strong><small>Registos encontrados</small></article>
        <article className="summary-card"><span className="summary-card__label">Fila de validação</span><strong>{page?.items.filter((item) => ['submitted', 'under_review'].includes(item.status)).length ?? '—'}</strong><small>Submetidas ou em análise nesta página</small></article>
        <article className="summary-card"><span className="summary-card__label">Área administrativa</span><strong>Protegida</strong><small>Acesso restrito a administradores Nobug Labs</small></article>
      </section>

      <section className={`platform-grid${detail ? ' platform-grid--detail' : ''}`}>
        <article className="panel-card company-queue">
          <div className="panel-heading panel-heading--row">
            <div><div><h2>Fila de empresas</h2><p>Selecione um registo para consultar os detalhes.</p></div></div>
            <label className="filter-select"><span className="sr-only">Filtrar empresas</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {statuses.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {loading ? <div className="inline-loading"><span className="loading-dot" />A carregar empresas…</div> : (
            <div className="company-table-wrap">
              <table className="company-table">
                <thead><tr><th>Empresa</th><th>NIF</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {page?.items.map((item) => (
                    <tr className={detail?.company.id === item.id ? 'company-table__selected' : ''} key={item.id} onClick={() => void loadDetail(item.id)}>
                      <td><strong>{item.trade_name || item.legal_name}</strong><small>{item.email}</small></td>
                      <td>{item.nif}</td>
                      <td>
                        {status === 'pending_payment'
                          ? <span className="status-pill status-pill--pending_payment">Plano por ativar</span>
                          : <span className={`status-pill status-pill--${item.status}`}>{statusNames[item.status] || item.status}</span>}
                      </td>
                      <td><button className="row-open" type="button" onClick={(event) => { event.stopPropagation(); void loadDetail(item.id); }} aria-label={`Abrir ${item.legal_name}`}>→</button></td>
                    </tr>
                  ))}
                  {!page?.items.length && <tr><td className="table-empty" colSpan={4}>Nenhuma empresa encontrada para este filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {page && <div className="table-foot">A mostrar {page.items.length} de {page.total} empresas</div>}
        </article>

        <article className="panel-card company-detail">
          {!detail || !company ? (
            <div className="detail-empty"><span aria-hidden="true">⌕</span><h2>Detalhes da empresa</h2><p>Selecione uma empresa na lista para rever os dados, documentos e histórico.</p></div>
          ) : (
            <>
              <div className="detail-heading">
                <div><span className="eyebrow">PROCESSO DE EMPRESA</span><h2>{company.trade_name || company.legal_name}</h2><p>{company.legal_name}</p></div>
                <button className="icon-close" type="button" onClick={() => setDetail(null)} aria-label="Fechar detalhes">×</button>
              </div>
              <div className="detail-status-line"><span className={`status-pill status-pill--${company.status}`}>{statusNames[company.status] || company.status}</span><span>NIF {company.nif}</span></div>
              {company.status_reason && <div className="alert alert--warning">{company.status_reason}</div>}
              <div className="detail-facts">
                <div><small>Email</small><strong>{company.email}</strong></div>
                <div><small>Telefone</small><strong>{company.phone || '—'}</strong></div>
                <div><small>Localização</small><strong>{[company.municipality || company.city, company.province, company.country].filter(Boolean).join(', ') || '—'}</strong></div>
                <div><small>Atividade</small><strong>{company.business_activity || '—'}</strong></div>
              </div>

              {detail.subscription && (
                <>
                  <div className="detail-section-title"><div><h3>Plano e subscrição</h3></div></div>
                  <div className="subscription-review">
                    <div className="subscription-review__facts">
                      <div><small>Plano</small><strong>{detail.subscription.plan_code.toUpperCase()}</strong></div>
                      <div><small>Periodicidade</small><strong>{billingCycleNames[detail.subscription.billing_cycle] || detail.subscription.billing_cycle}</strong></div>
                      <div><small>Estado</small><strong>{statusNames[detail.subscription.status] || detail.subscription.status}</strong></div>
                    </div>
                    {detail.subscription.plan_selected_at
                      && ['pending_payment', 'trialing'].includes(detail.subscription.status)
                      && company.status === 'approved' && (
                      <>
                        <p>Confirme o recebimento do pagamento para ativar os módulos escolhidos pela empresa.</p>
                        <button className="button button--primary button--full" type="button" disabled={busy} onClick={() => void activateSubscription()}>
                          {busy ? 'A ativar…' : 'Confirmar pagamento e ativar'}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="detail-section-title"><div><h3>Documentos</h3><span>{detail.documents.length} ficheiros</span></div></div>
              <div className="review-documents">
                {detail.documents.map((doc) => (
                  <div className="review-document" key={doc.id}>
                    <div className="review-document__body">
                      <strong>{documentNames[doc.doc_type] || doc.doc_type}</strong>
                      <small>{doc.file_name || doc.document_number || 'Ficheiro submetido'} · {statusNames[doc.status] || doc.status}</small>
                      {doc.review_notes && <small className="review-document__note">{doc.review_notes}</small>}
                    </div>
                    <div className="review-document__actions">
                      {doc.reference && <a className="text-link" href={mediaUrl(doc.reference)} target="_blank" rel="noreferrer">Ver ficheiro</a>}
                      {company.status === 'under_review' && (
                        <>
                          <button className="review-icon review-icon--accept" type="button" title="Validar documento" aria-label="Validar documento" disabled={busy} onClick={() => void reviewDocument(doc.id, 'valid')}>✓</button>
                          <button className="review-icon review-icon--reject" type="button" title="Pedir correção" aria-label="Pedir correção" disabled={busy} onClick={() => void reviewDocument(doc.id, 'invalid')}>!</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {!detail.documents.length && <p className="empty-note">Ainda não foram enviados documentos.</p>}
              </div>

              {detail.document_requirements.length > 0 && (
                <div className="requirements-note">
                  <strong>Requisitos de aprovação</strong>
                  <small>{detail.document_requirements.filter((item) => item.is_required).length} documentos obrigatórios; todos devem estar validados para aprovar.</small>
                </div>
              )}

              <div className="detail-actions">
                {company.status === 'submitted' && <button className="button button--primary button--full" type="button" disabled={busy} onClick={startReview}>Iniciar revisão <span aria-hidden="true">→</span></button>}
                {company.status === 'under_review' && (
                  <>
                    <button className="button button--primary button--full" type="button" disabled={busy} onClick={approve}>Aprovar empresa <span aria-hidden="true">→</span></button>
                    <button className="button button--secondary button--full" type="button" disabled={busy} onClick={() => void requestCorrection()}>Solicitar correções</button>
                  </>
                )}
              </div>
              <div className="detail-history">
                <h3>Histórico</h3>
                {detail.status_history.slice(0, 4).map((item) => (
                  <div className="history-item" key={item.id}><span /><div><strong>{statusNames[item.to_status] || item.to_status}</strong><small>{new Date(item.created_at).toLocaleString('pt-PT')}</small></div></div>
                ))}
                {!detail.status_history.length && <p className="empty-note">Sem alterações registadas.</p>}
              </div>
            </>
          )}
        </article>
      </section>
    </main>
  );
}
