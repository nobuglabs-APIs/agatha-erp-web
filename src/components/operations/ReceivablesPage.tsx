import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import { getErrorMessage, money, parseAmountCents } from './shared';

interface Invoice {
  id: string;
  document_number: string | null;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  created_at: string;
}

interface AgingSummary {
  as_of: string;
  totals: {
    current_cents: number;
    days_1_30_cents: number;
    days_31_60_cents: number;
    days_61_90_cents: number;
    days_90_plus_cents: number;
    total_cents: number;
  };
}

const paymentMethods = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'multicaixa_express', label: 'Multicaixa Express' },
  { value: 'card', label: 'Cartão' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'other', label: 'Outro' },
];

export function ReceivablesPage({ companyId }: { companyId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [agingError, setAgingError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setAgingError('');
    try {
      const [issued, partial] = await Promise.all([
        request<Page<Invoice>>('/sales/documents?doc_type=invoice&status=issued&page=1&per_page=100', { companyId }),
        request<Page<Invoice>>('/sales/documents?doc_type=invoice&status=partially_paid&page=1&per_page=100', { companyId }),
      ]);
      setInvoices([...issued.items, ...partial.items]
        .filter((invoice) => invoice.balance_cents > 0)
        .sort((left, right) => (left.due_date || '9999').localeCompare(right.due_date || '9999')));
      try {
        setAging(await request<AgingSummary>('/reports/receivables-aging', { companyId }));
      } catch (reason) {
        setAging(null);
        setAgingError(getErrorMessage(reason, 'O resumo de vencimentos não está disponível.'));
      }
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar as contas a receber.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  function openPayment(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setAmountInput((invoice.balance_cents / 100).toFixed(2));
    setReference('');
    setError('');
  }

  async function registerPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice) return;
    const amountCents = parseAmountCents(amountInput);
    if (!amountCents || amountCents > selectedInvoice.balance_cents) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/sales/documents/${selectedInvoice.id}/payments`, {
        method: 'POST',
        companyId,
        body: { method, amount_cents: amountCents, reference: reference.trim() || null },
      });
      setNotice(`Cobrança de ${money(amountCents)} registada para ${selectedInvoice.document_number || 'a fatura'}.`);
      setSelectedInvoice(null);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível registar a cobrança.'));
    } finally {
      setBusy(false);
    }
  }

  const amountCents = parseAmountCents(amountInput);
  const canRegister = Boolean(selectedInvoice && amountCents && amountCents <= selectedInvoice.balance_cents);

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">FINANÇAS</span><h1>Contas a receber</h1><p>Acompanhe saldos em aberto e registe cobranças dos clientes.</p></div>
        <button type="button" className="ops-icon-button" aria-label="Atualizar contas a receber" onClick={() => void loadData()}>↻</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {selectedInvoice && (
        <form className="ops-card ops-form-grid" onSubmit={(event) => void registerPayment(event)}>
          <div className="ops-card-heading ops-field--wide">
            <div><h2>Registar cobrança</h2><p>{selectedInvoice.document_number} · saldo {money(selectedInvoice.balance_cents)}</p></div>
            <button type="button" className="ops-icon-button" aria-label="Fechar" onClick={() => setSelectedInvoice(null)}>×</button>
          </div>
          <label className="ops-field"><span>Valor recebido (Kz)</span><input type="number" inputMode="decimal" min="0.01" max={(selectedInvoice.balance_cents / 100).toFixed(2)} step="0.01" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} required /></label>
          <label className="ops-field"><span>Meio de pagamento</span><select value={method} onChange={(event) => setMethod(event.target.value)}>{paymentMethods.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label className="ops-field ops-field--wide"><span>Referência (opcional)</span><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} /></label>
          {amountCents !== null && amountCents > selectedInvoice.balance_cents && <small className="ops-form-help ops-field--wide">O valor não pode exceder o saldo da fatura.</small>}
          <div className="ops-form-actions ops-field--wide"><button className="button button--primary" type="submit" disabled={!canRegister || busy}>{busy ? 'A registar…' : 'Confirmar cobrança'}</button><button className="button button--secondary" type="button" onClick={() => setSelectedInvoice(null)}>Cancelar</button></div>
        </form>
      )}
      <section className="ops-metrics">
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon">₭</span><span className="ops-metric__label">Total em aberto</span></span><strong>{aging ? money(aging.totals.total_cents) : '—'}</strong><small>{aging ? `Atualizado em ${new Date(`${aging.as_of}T12:00:00`).toLocaleDateString('pt-AO')}` : 'Saldo de faturas emitidas'}</small></article>
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon">◷</span><span className="ops-metric__label">Até 30 dias vencidas</span></span><strong>{aging ? money(aging.totals.days_1_30_cents) : '—'}</strong><small>1 a 30 dias de atraso</small></article>
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon">!</span><span className="ops-metric__label">Mais de 30 dias</span></span><strong>{aging ? money(aging.totals.days_31_60_cents + aging.totals.days_61_90_cents + aging.totals.days_90_plus_cents) : '—'}</strong><small>Priorize as cobranças vencidas</small></article>
      </section>
      {agingError && <div className="ops-alert" role="status">{agingError}</div>}
      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Faturas em aberto</h2><p>{invoices.length} faturas por cobrar</p></div></div>
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Fatura</th><th>Cliente</th><th>Vencimento</th><th>Total</th><th>Recebido</th><th>Saldo</th><th>Ação</th></tr></thead><tbody>
          {loading ? <tr><td className="ops-table-empty" colSpan={7}>A carregar faturas…</td></tr> : invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.document_number || '—'}</strong></td><td>{invoice.customer_name || 'Consumidor final'}</td><td>{invoice.due_date ? new Date(`${invoice.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-AO') : '—'}</td><td>{money(invoice.total_cents)}</td><td>{money(invoice.paid_cents)}</td><td><strong>{money(invoice.balance_cents)}</strong></td><td><button type="button" className="ops-text-button" onClick={() => openPayment(invoice)}>Registar cobrança</button></td></tr>)}
          {!loading && !invoices.length && <tr><td className="ops-table-empty" colSpan={7}>Não há faturas em aberto.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
