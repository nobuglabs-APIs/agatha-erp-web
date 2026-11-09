import { useCallback, useEffect, useState } from 'react';
import { ApiError, request } from '../../api/client';
import type { Plan, Subscription, SubscriptionCheckoutResponse } from '../../api/types';
import { getErrorMessage } from './shared';

const moduleLabels: Record<string, string> = {
  customers: 'Clientes',
  inventory: 'Inventário',
  sales: 'Vendas e faturação',
  purchases: 'Compras',
  reports: 'Relatórios',
  fiscal: 'Fiscalidade',
  accounting: 'Contabilidade',
  hr: 'Recursos humanos',
};

const planDescriptions: Record<string, string> = {
  starter: 'As ferramentas essenciais para gerir a operação do dia a dia.',
  pro: 'Mais recursos para acompanhar todas as áreas do negócio.',
  custom: 'Escolha os módulos que fazem sentido para a sua operação.',
};

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

async function loadSubscription(companyId: string): Promise<Subscription | null> {
  try {
    return await request<Subscription>('/company/subscription', { companyId });
  } catch (reason) {
    if (reason instanceof ApiError && reason.status === 404) return null;
    throw reason;
  }
}

export function BillingPage({
  companyId,
  canManage,
  onSubscriptionChange,
}: {
  companyId: string;
  canManage: boolean;
  onSubscriptionChange: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [customModules, setCustomModules] = useState<string[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [payment, setPayment] = useState<SubscriptionCheckoutResponse['payment'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [availablePlans, currentSubscription] = await Promise.all([
        request<Plan[]>('/plans'),
        loadSubscription(companyId),
      ]);
      setPlans(availablePlans);
      setSubscription(currentSubscription);
      setPayment(null);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar os planos.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function choosePlan(planCode: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const chosen = await request<Subscription>('/company/subscription', {
        method: 'PUT',
        companyId,
        body: {
          plan_code: planCode,
          billing_cycle: planCode === 'custom' ? 'usage' : billingCycle,
          ...(planCode === 'custom' ? { modules: customModules } : {}),
        },
      });
      setSubscription(chosen);
      setPayment(null);
      setNotice(chosen.status === 'trialing'
        ? 'Plano registado. O teste grátis continua ativo; pode concluir o checkout quando estiver pronto.'
        : 'Plano escolhido. Conclua o checkout disponível neste ambiente ou aguarde a confirmação da plataforma.');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível escolher o plano.'));
    } finally {
      setBusy(false);
    }
  }

  async function simulatePayment() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request<SubscriptionCheckoutResponse>('/company/subscription/checkout', {
        method: 'POST',
        companyId,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      setSubscription(result.subscription);
      setPayment(result.payment);
      setNotice('Pagamento confirmado. O plano foi ativado neste ambiente de testes; nenhum valor real foi cobrado.');
      onSubscriptionChange();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível concluir o pagamento.'));
    } finally {
      setBusy(false);
    }
  }

  const trialDays = subscription?.status === 'trialing' && subscription.expires_at
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">SUBSCRIÇÃO DA EMPRESA</span><h1>Plano e período grátis</h1><p>Escolha o plano que pretende manter após o teste do seu ambiente de negócio.</p></div>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar planos…</div> : (
        <>
          <label className="field billing-cycle-field">
            <span>Periodicidade</span>
            <select
              value={billingCycle}
              disabled={!canManage || busy}
              onChange={(event) => setBillingCycle(event.target.value as 'monthly' | 'annual')}
            >
              <option value="monthly">Mensal</option>
              <option value="annual">Anual</option>
            </select>
          </label>
          {subscription?.status === 'trialing' && subscription.expires_at && (
            <section className="trial-banner">
              <span className="trial-banner__mark">7</span>
              <div><strong>{trialDays === 0 ? 'Último dia do teste grátis' : `${trialDays} ${trialDays === 1 ? 'dia' : 'dias'} restantes no teste grátis`}</strong><p>Tem acesso ao ERP essencial e a todas as operações do tipo de negócio escolhido. O teste termina em {new Date(subscription.expires_at).toLocaleDateString('pt-PT')}.</p></div>
              <span className="trial-banner__badge">TESTE GRÁTIS</span>
            </section>
          )}
          {subscription?.status === 'expired' && (
            <section className="trial-banner trial-banner--expired">
              <span className="trial-banner__mark">!</span>
              <div><strong>O período grátis terminou</strong><p>Escolha um plano para solicitar a ativação e voltar a operar.</p></div>
            </section>
          )}
          {subscription?.status === 'pending_payment' && (
            <section className="trial-banner">
              <span className="trial-banner__mark">◷</span>
              <div><strong>Plano à espera de ativação</strong><p>A equipa Ágata confirmará a subscrição. Até lá, as operações ficam suspensas.</p></div>
            </section>
          )}
          {subscription?.status === 'active' && (
            <section className="trial-banner">
              <span className="trial-banner__mark">✓</span>
              <div><strong>Subscrição ativa · {subscription.plan_code.toUpperCase()}</strong><p>A sua empresa está a usar o plano selecionado.</p></div>
            </section>
          )}
          <div className="plan-cards">
            {plans.map((plan) => (
              <article className={`plan-card${plan.code === 'pro' ? ' plan-card--featured' : ''}`} key={plan.code}>
                {plan.code === 'pro' && <span className="plan-card__tag">MAIS COMPLETO</span>}
                <span className="eyebrow">ÁGATA ERP</span>
                <h3>{plan.name}</h3>
                <p>{planDescriptions[plan.code] || plan.description}</p>
                <p className="plan-card__price">
                  {plan.usage_rate_bp !== null
                    ? `${(plan.usage_rate_bp / 100).toLocaleString('pt-PT')}% das vendas mensais de produtos`
                    : formatMoney(((billingCycle === 'annual'
                      ? plan.annual_price_cents
                      : plan.monthly_price_cents) || 0), plan.currency)}
                  {plan.usage_rate_bp === null && <span> / {billingCycle === 'annual' ? 'ano' : 'mês'}</span>}
                </p>
                {plan.usage_rate_bp !== null && (
                  <p className="field-hint">5% das vendas de produtos pagas no mês anterior, sem impostos e após descontos e devoluções.</p>
                )}
                {plan.code === 'custom' ? (
                  <fieldset className="custom-modules">
                    <legend>Escolha os módulos</legend>
                    {(plans.find((item) => item.code === 'pro')?.modules || [])
                      .filter((module) => moduleLabels[module])
                      .map((module) => (
                        <label key={module}>
                          <input
                            type="checkbox"
                            checked={customModules.includes(module)}
                            disabled={!canManage || subscription?.status === 'active'}
                            onChange={(event) => setCustomModules((current) => event.target.checked
                              ? [...current, module]
                              : current.filter((value) => value !== module))}
                          />
                          <span>{moduleLabels[module]}</span>
                        </label>
                      ))}
                  </fieldset>
                ) : (
                  <ul className="plan-feature-list">
                    {plan.modules.filter((module) => moduleLabels[module]).map((module) => <li key={module}>{moduleLabels[module]}</li>)}
                  </ul>
                )}
                <button
                  type="button"
                  className={plan.code === 'pro' ? 'button button--primary button--full' : 'button button--secondary button--full'}
                  disabled={!canManage || busy || subscription?.status === 'active' || (plan.code === 'custom' && customModules.length === 0)}
                  onClick={() => void choosePlan(plan.code)}
                >
                  {busy ? 'A guardar…' : subscription?.plan_selected_at && subscription.plan_code === plan.code && subscription.billing_cycle === (plan.code === 'custom' ? 'usage' : billingCycle) ? 'Plano selecionado' : 'Escolher plano'}
                </button>
              </article>
            ))}
          </div>
          {import.meta.env.DEV && canManage && subscription?.plan_selected_at
            && subscription.status !== 'active' && (
              <section className="trial-banner">
                <div>
                  <strong>Ambiente de testes</strong>
                  <p>Esta confirmação só é válida neste ambiente de testes; nenhum valor real será cobrado.</p>
                  {payment && (
                    <p>
                      Referência {payment.provider_reference || payment.id} ·
                      {' '}{formatMoney(payment.amount_cents, payment.currency)} ·
                      {' '}período {new Date(payment.period_start).toLocaleDateString('pt-PT')}–{new Date(payment.period_end).toLocaleDateString('pt-PT')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={busy || subscription.status === 'active'}
                  onClick={() => void simulatePayment()}
                >
                  {busy ? 'A confirmar…' : 'Confirmar pagamento'}
                </button>
              </section>
            )}
          {!canManage && <p className="field-hint">Só um administrador da empresa pode gerir a subscrição.</p>}
        </>
      )}
    </div>
  );
}
