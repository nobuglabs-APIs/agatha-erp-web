import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import type { Product } from './shared';
import { dateTime, getErrorMessage, listPage, money, parseAmountCents } from './shared';

interface Supplier {
  id: string;
  name: string;
  trade_name: string | null;
  nif: string | null;
  email: string | null;
  phone: string | null;
  country: string;
  payment_terms_days: number;
  is_active: boolean;
}

interface PurchaseInvoice {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_nif: string | null;
  invoice_number: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  stock_received: boolean;
  created_at: string;
}

const supplierPaymentMethods = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'other', label: 'Outro' },
];

export function PurchasesPage({ companyId }: { companyId: string }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<PurchaseInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [supplierPage, productPage, invoicePage] = await Promise.all([
        listPage<Supplier>('/suppliers', companyId, 100),
        listPage<Product>('/products', companyId, 100),
        request<Page<PurchaseInvoice>>('/purchase-invoices?page=1&per_page=100', { companyId }),
      ]);
      setSuppliers(supplierPage.items.filter((supplier) => supplier.is_active));
      setProducts(productPage.items.filter((product) => product.is_active));
      setInvoices(invoicePage.items);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar compras e fornecedores.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const selectedProducts = useMemo(
    () => products.filter((product) => (quantities[product.id] || 0) > 0),
    [products, quantities],
  );
  const purchaseTotal = selectedProducts.reduce((total, product) => {
    const quantity = quantities[product.id];
    const subtotal = product.cost_price_cents * quantity;
    return total + subtotal + Math.floor((subtotal * product.tax_rate_bp) / 10_000);
  }, 0);

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await request<Supplier>('/suppliers', {
        method: 'POST',
        companyId,
        body: {
          name: String(form.get('name') || '').trim(),
          nif: String(form.get('nif') || '').trim() || null,
          email: String(form.get('email') || '').trim() || null,
          phone: String(form.get('phone') || '').trim() || null,
        },
      });
      setNotice('Fornecedor adicionado.');
      setShowSupplierForm(false);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível adicionar o fornecedor.'));
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId || !invoiceNumber.trim() || !selectedProducts.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request('/purchase-invoices', {
        method: 'POST',
        companyId,
        body: {
          supplier_id: supplierId,
          invoice_number: invoiceNumber.trim(),
          issue_date: null,
          due_date: null,
          notes: null,
          discount_cents: 0,
          items: selectedProducts.map((product) => ({
            product_id: product.id,
            description: product.name,
            quantity: quantities[product.id],
            unit_cost_cents: product.cost_price_cents,
            discount_cents: 0,
            tax_rate_bp: product.tax_rate_bp,
            unit_symbol: 'UN',
          })),
        },
      });
      setNotice('Fatura de fornecedor criada como rascunho. Emita-a para receber o stock.');
      setShowInvoiceForm(false);
      setQuantities({});
      setInvoiceNumber('');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar a fatura de fornecedor.'));
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice(invoice: PurchaseInvoice) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/purchase-invoices/${invoice.id}/issue`, { method: 'POST', companyId });
      setNotice(`Fatura ${invoice.invoice_number} emitida; stock recebido.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível emitir a fatura e receber o stock.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvoice(invoice: PurchaseInvoice) {
    if (!window.confirm(`Anular a fatura ${invoice.invoice_number}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/purchase-invoices/${invoice.id}/cancel`, {
        method: 'POST',
        companyId,
        body: { reason: 'Anulada pelo utilizador no módulo de compras.' },
      });
      setNotice(`Fatura ${invoice.invoice_number} anulada.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível anular a fatura.'));
    } finally {
      setBusy(false);
    }
  }

  async function registerSupplierPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingInvoice) return;
    const amountCents = parseAmountCents(paymentAmount);
    if (!amountCents || amountCents > payingInvoice.balance_cents) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request('/supplier-payments', {
        method: 'POST',
        companyId,
        body: {
          supplier_id: payingInvoice.supplier_id,
          method: paymentMethod,
          amount_cents: amountCents,
          allocations: [{ purchase_invoice_id: payingInvoice.id, amount_cents: amountCents }],
        },
      });
      setNotice(`Pagamento de ${money(amountCents)} registado para ${payingInvoice.invoice_number}.`);
      setPayingInvoice(null);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível registar o pagamento ao fornecedor.'));
    } finally {
      setBusy(false);
    }
  }

  const amountCents = parseAmountCents(paymentAmount);
  const canPay = Boolean(payingInvoice && amountCents && amountCents <= payingInvoice.balance_cents);

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">INVENTÁRIO</span><h1>Compras e fornecedores</h1><p>Registe faturas de compra, receba stock e acompanhe valores a pagar.</p></div>
        <div className="ops-page-actions"><button type="button" className="button button--secondary" onClick={() => setShowSupplierForm((value) => !value)}>Novo fornecedor</button><button type="button" className="button button--primary" onClick={() => setShowInvoiceForm((value) => !value)}>Nova compra</button></div>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {showSupplierForm && <form className="ops-card ops-form-grid" onSubmit={(event) => void createSupplier(event)}>
        <div className="ops-card-heading ops-field--wide"><div><h2>Novo fornecedor</h2><p>Os dados fiscais podem ser preenchidos posteriormente.</p></div></div>
        <label className="ops-field"><span>Nome *</span><input name="name" minLength={2} maxLength={200} required /></label>
        <label className="ops-field"><span>NIF</span><input name="nif" maxLength={20} /></label>
        <label className="ops-field"><span>E-mail</span><input name="email" type="email" maxLength={254} /></label>
        <label className="ops-field"><span>Telefone</span><input name="phone" maxLength={40} /></label>
        <div className="ops-form-actions ops-field--wide"><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'A guardar…' : 'Guardar fornecedor'}</button><button className="button button--secondary" type="button" onClick={() => setShowSupplierForm(false)}>Cancelar</button></div>
      </form>}
      {showInvoiceForm && <form className="ops-card ops-form-grid" onSubmit={(event) => void createInvoice(event)}>
        <div className="ops-card-heading ops-field--wide"><div><h2>Nova fatura de compra</h2><p>Crie o rascunho; a emissão confirma a receção do stock.</p></div></div>
        <label className="ops-field"><span>Fornecedor *</span><select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecionar fornecedor</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
        <label className="ops-field"><span>Número da fatura *</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} maxLength={100} required /></label>
        <div className="ops-field ops-field--wide"><span>Produtos e quantidades</span><div className="ops-pos-product-grid">{products.filter((product) => product.product_type === 'goods').map((product) => <label className="ops-pos-product" key={product.id}><strong>{product.name}</strong><small>{product.sku} · custo {money(product.cost_price_cents)}</small><input type="number" min="0" max="1000000" step="1" value={quantities[product.id] || ''} onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))} aria-label={`Quantidade de ${product.name}`} /></label>)}</div></div>
        <div className="ops-cart-totals ops-field--wide"><div className="ops-cart-total"><span>Total estimado</span><strong>{money(purchaseTotal)}</strong></div></div>
        <div className="ops-form-actions ops-field--wide"><button className="button button--primary" type="submit" disabled={busy || !supplierId || !invoiceNumber.trim() || !selectedProducts.length}>{busy ? 'A guardar…' : 'Criar rascunho'}</button><button className="button button--secondary" type="button" onClick={() => setShowInvoiceForm(false)}>Cancelar</button></div>
      </form>}
      {payingInvoice && <form className="ops-card ops-form-grid" onSubmit={(event) => void registerSupplierPayment(event)}>
        <div className="ops-card-heading ops-field--wide"><div><h2>Registar pagamento</h2><p>{payingInvoice.invoice_number} · saldo {money(payingInvoice.balance_cents)}</p></div></div>
        <label className="ops-field"><span>Valor pago (Kz)</span><input type="number" inputMode="decimal" min="0.01" max={(payingInvoice.balance_cents / 100).toFixed(2)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required /></label>
        <label className="ops-field"><span>Meio de pagamento</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{supplierPaymentMethods.map((method) => <option value={method.value} key={method.value}>{method.label}</option>)}</select></label>
        <div className="ops-form-actions ops-field--wide"><button className="button button--primary" type="submit" disabled={!canPay || busy}>{busy ? 'A registar…' : 'Confirmar pagamento'}</button><button className="button button--secondary" type="button" onClick={() => setPayingInvoice(null)}>Cancelar</button></div>
      </form>}
      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Fornecedores</h2><p>{suppliers.length} fornecedores ativos</p></div></div>
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Nome</th><th>NIF</th><th>Contacto</th><th>Prazo</th></tr></thead><tbody>
          {suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.trade_name || supplier.name}</strong></td><td>{supplier.nif || '—'}</td><td>{supplier.email || supplier.phone || '—'}</td><td>{supplier.payment_terms_days ? `${supplier.payment_terms_days} dias` : '—'}</td></tr>)}
          {!suppliers.length && <tr><td className="ops-table-empty" colSpan={4}>Ainda não existem fornecedores. Adicione um para começar.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Faturas de compra</h2><p>Registos e saldos a pagar</p></div><button type="button" className="ops-icon-button" aria-label="Atualizar compras" onClick={() => void loadData()}>↻</button></div>
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Fatura</th><th>Fornecedor</th><th>Data</th><th>Estado</th><th>Total</th><th>Saldo</th><th>Ações</th></tr></thead><tbody>
          {loading ? <tr><td className="ops-table-empty" colSpan={7}>A carregar compras…</td></tr> : invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoice_number}</strong></td><td>{invoice.supplier_name}</td><td>{invoice.issue_date ? new Date(`${invoice.issue_date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-AO') : dateTime(invoice.created_at)}</td><td><span className={`ops-sale-status ops-sale-status--${invoice.status}`}>{invoice.status === 'draft' ? 'Rascunho' : invoice.status === 'paid' ? 'Paga' : invoice.status === 'cancelled' ? 'Anulada' : 'Emitida'}</span></td><td>{money(invoice.total_cents)}</td><td><strong>{money(invoice.balance_cents)}</strong></td><td><div className="ops-page-actions">{invoice.status === 'draft' && <button type="button" className="ops-text-button" disabled={busy} onClick={() => void issueInvoice(invoice)}>Emitir e receber stock</button>}{invoice.status === 'issued' && invoice.balance_cents > 0 && <button type="button" className="ops-text-button" onClick={() => { setPayingInvoice(invoice); setPaymentAmount((invoice.balance_cents / 100).toFixed(2)); }}>Pagar</button>}{invoice.status !== 'cancelled' && invoice.paid_cents === 0 && <button type="button" className="ops-text-button" disabled={busy} onClick={() => void cancelInvoice(invoice)}>Anular</button>}</div></td></tr>)}
          {!loading && !invoices.length && <tr><td className="ops-table-empty" colSpan={7}>Ainda não existem faturas de compra.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
