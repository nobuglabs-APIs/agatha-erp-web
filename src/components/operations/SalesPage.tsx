import { useCallback, useEffect, useMemo, useState } from 'react';
import { mediaUrl, NetworkError, request } from '../../api/client';
import { syncPendingSales } from '../../api/offlineSync';
import {
  listenOfflineChanges,
  listPendingSales,
  queuePendingSale,
  retryPendingSale,
} from '../../api/offlineStore';
import type { Customer, Product, Sale } from './shared';
import { dateTime, getErrorMessage, listPage, money, parseAmountCents } from './shared';
import { DocumentSheet } from './DocumentSheet';

const paymentMethods = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'multicaixa_express', label: 'Multicaixa Express' },
  { value: 'card', label: 'Cartão' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'other', label: 'Outro' },
];

type PaymentMode = 'full' | 'partial' | 'credit';

export function SalesPage({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [partialAmountInput, setPartialAmountInput] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sheetDocumentId, setSheetDocumentId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productResult, customerResult, salesResult, pendingSales] = await Promise.all([
        listPage<Product>('/products', companyId, 100),
        listPage<Customer>('/customers', companyId, 100),
        listPage<Sale>('/sales', companyId, 10),
        listPendingSales<Sale>(companyId),
      ]);
      setProducts(productResult.items);
      setCustomers(customerResult.items);
      setSales([
        ...pendingSales.map((pending) => ({
          ...pending.preview,
          offline_sync_status: pending.status,
          offline_sync_error: pending.error,
        })),
        ...salesResult.items,
      ]);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar o ponto de venda.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => listenOfflineChanges((changedCompanyId) => {
    if (changedCompanyId === companyId) void loadData();
  }), [companyId, loadData]);

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase();
    return products.filter((product) => !query
      || product.name.toLocaleLowerCase().includes(query)
      || product.sku.toLocaleLowerCase().includes(query)
      || product.barcode?.toLocaleLowerCase().includes(query));
  }, [productQuery, products]);
  const cartEntries = products.filter((product) => cart[product.id] > 0);
  const subtotalCents = cartEntries.reduce((sum, product) => sum + product.unit_price_cents * cart[product.id], 0);
  const taxCents = cartEntries.reduce((sum, product) => {
    const lineSubtotal = BigInt(product.unit_price_cents) * BigInt(cart[product.id]);
    const tax = (lineSubtotal * BigInt(product.tax_rate_bp) + 5_000n) / 10_000n;
    return sum + Number(tax);
  }, 0);
  const totalCents = subtotalCents + taxCents;
  const paidCents = paymentMode === 'full'
    ? totalCents
    : paymentMode === 'partial'
      ? parseAmountCents(partialAmountInput)
      : 0;
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const filteredCustomers = useMemo(() => {
    const query = customerQuery.trim().toLocaleLowerCase();
    if (!query) return customers.slice(0, 6);
    return customers.filter((customer) => [
      customer.name,
      customer.trade_name,
      customer.nif,
      customer.email,
      customer.phone,
      customer.address,
      customer.province,
      customer.country,
      customer.customer_type,
    ].some((value) => value?.toLocaleLowerCase().includes(query))).slice(0, 8);
  }, [customerQuery, customers]);
  const canCheckout = cartEntries.length > 0
    && totalCents > 0
    && paidCents !== null
    && paidCents >= 0
    && paidCents <= totalCents
    && (paidCents === totalCents || Boolean(selectedCustomerId))
    && cartEntries.every((product) => !product.track_stock || product.stock_quantity >= cart[product.id]);

  function addToCart(product: Product) {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }));
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => {
      const quantity = (current[productId] || 0) + delta;
      if (quantity <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: quantity };
    });
  }

  async function retrySale(sale: Sale) {
    if (!sale.offline_idempotency_key) {
      setError('Não foi possível identificar a venda offline para tentar novamente.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await retryPendingSale(companyId, sale.offline_idempotency_key);
      await syncPendingSales(companyId);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível tentar sincronizar a venda novamente.'));
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!canCheckout) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        customer_id: selectedCustomerId || null,
        items: cartEntries.map((product) => ({ product_id: product.id, quantity: cart[product.id] })),
        payments: paidCents ? [{ method: paymentMethod, amount_cents: paidCents }] : [],
      };
      let sale: Sale;
      try {
        sale = await request<Sale>('/sales', {
          method: 'POST',
          companyId,
          headers: { 'Idempotency-Key': idempotencyKey },
          body: payload,
        });
      } catch (reason) {
        if (!(reason instanceof NetworkError)) throw reason;
        const preview: Sale = {
          id: `offline:${idempotencyKey}`,
          offline_idempotency_key: idempotencyKey,
          number: 0,
          customer_id: selectedCustomerId || null,
          status: 'pending_sync',
          subtotal_cents: subtotalCents,
          tax_cents: taxCents,
          discount_cents: 0,
          total_cents: totalCents,
          paid_cents: paidCents,
          refunded_cents: 0,
          created_at: new Date().toISOString(),
          invoice_document_id: null,
          invoice_document_number: null,
          invoice_document_type: null,
          offline_sync_status: 'pending',
        };
        await queuePendingSale({
          idempotencyKey,
          companyId,
          payload,
          preview,
          createdAt: preview.created_at,
          status: 'pending',
          error: null,
        });
        setNotice('Venda guardada neste dispositivo. Valores, stock e documento fiscal serão confirmados pela API ao sincronizar.');
        setCart({});
        setSelectedCustomerId('');
        setCustomerQuery('');
        setCustomerSearchOpen(false);
        setPaymentMode('full');
        setPartialAmountInput('');
        await loadData();
        return;
      }
      const documentLabel = sale.invoice_document_type === 'invoice_receipt' ? 'fatura-recibo' : 'fatura';
      setNotice(sale.invoice_document_number
        ? `Venda #${sale.number} registada e ${documentLabel} ${sale.invoice_document_number} emitida.`
        : `Venda #${sale.number} registada. Documento fiscal não retornado.`);
      setCart({});
      setSelectedCustomerId('');
      setCustomerQuery('');
      setCustomerSearchOpen(false);
      setPaymentMode('full');
      setPartialAmountInput('');
      if (sale.invoice_document_id) setSheetDocumentId(sale.invoice_document_id);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível concluir a venda.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">PONTO DE VENDA</span><h1>Vendas</h1><p>Registe vendas com preços do catálogo e atualização automática do stock.</p></div>
        <span className="ops-pos-live"><i /> Caixa pronto</span>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      <section className="ops-pos-layout">
        <div className="ops-card ops-pos-catalog">
          <div className="ops-table-toolbar">
            <div><h2>Selecionar artigos</h2><p>{products.length} produtos ativos</p></div>
            <label className="ops-search ops-search--inline"><span aria-hidden="true">⌕</span><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Nome, SKU ou código" /></label>
          </div>
          {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar artigos…</div> : (
            <div className="ops-pos-product-grid">
              {filteredProducts.map((product) => {
                const unavailable = product.track_stock && product.stock_quantity <= 0;
                return <button type="button" className="ops-pos-product" disabled={unavailable} key={product.id} onClick={() => addToCart(product)}>
                  <span className="ops-pos-product__image">
                    {product.image_url
                      ? <img src={mediaUrl(product.image_url)} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                      : null}
                    <span>{product.name.slice(0, 1).toUpperCase()}</span>
                    <b>＋</b>
                  </span>
                  <strong>{product.name}</strong><small>{product.sku}{product.track_stock ? ` · ${product.stock_quantity} un.` : ''}</small>
                  <span className="ops-pos-product__price">{money(product.unit_price_cents)}</span>
                  {unavailable && <i className="ops-pos-product__unavailable">Sem stock</i>}
                </button>;
              })}
              {!filteredProducts.length && <div className="ops-pos-empty">Não existem produtos com essa pesquisa. Adicione produtos no catálogo para começar.</div>}
            </div>
          )}
        </div>

        <aside className="ops-card ops-pos-cart">
          <div className="ops-card-heading"><div><h2>Venda atual</h2><p>{cartEntries.reduce((sum, product) => sum + cart[product.id], 0)} artigos</p></div><button type="button" className="ops-text-button" onClick={() => setCart({})} disabled={!cartEntries.length}>Limpar</button></div>
          <div className="ops-pos-customer">
            <label className="ops-field">
              <span>Cliente</span>
              <span className="ops-pos-customer__input">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  role="combobox"
                  aria-expanded={customerSearchOpen}
                  aria-controls="ops-pos-customer-results"
                  autoComplete="off"
                  value={customerSearchOpen ? customerQuery : selectedCustomer ? (selectedCustomer.trade_name || selectedCustomer.name) : customerQuery}
                  placeholder="Nome, NIF, telefone ou email"
                  onFocus={() => setCustomerSearchOpen(true)}
                  onChange={(event) => {
                    setCustomerQuery(event.target.value);
                    setCustomerSearchOpen(true);
                  }}
                  onBlur={() => window.setTimeout(() => setCustomerSearchOpen(false), 120)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setCustomerSearchOpen(false);
                  }}
                />
                {selectedCustomerId && (
                  <button
                    type="button"
                    aria-label="Remover cliente da venda"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedCustomerId('');
                      setCustomerQuery('');
                      setCustomerSearchOpen(false);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
            {customerSearchOpen && (
              <div className="ops-pos-customer__results" id="ops-pos-customer-results" role="listbox">
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedCustomerId}
                  className={!selectedCustomerId ? 'ops-pos-customer__result ops-pos-customer__result--active' : 'ops-pos-customer__result'}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelectedCustomerId('');
                    setCustomerQuery('');
                    setCustomerSearchOpen(false);
                  }}
                >
                  <span className="ops-pos-customer__avatar">CF</span>
                  <span><strong>Consumidor final</strong><small>Venda sem identificação do cliente</small></span>
                  {!selectedCustomerId && <b>✓</b>}
                </button>
                {filteredCustomers.map((customer) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedCustomerId === customer.id}
                    className={selectedCustomerId === customer.id ? 'ops-pos-customer__result ops-pos-customer__result--active' : 'ops-pos-customer__result'}
                    key={customer.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setCustomerQuery('');
                      setCustomerSearchOpen(false);
                    }}
                  >
                    <span className="ops-pos-customer__avatar">{(customer.trade_name || customer.name).slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{customer.trade_name || customer.name}</strong>
                      <small>{[customer.nif, customer.phone, customer.email].filter(Boolean).join(' · ') || 'Cliente sem dados de contacto'}</small>
                    </span>
                    {selectedCustomerId === customer.id && <b>✓</b>}
                  </button>
                ))}
                {!filteredCustomers.length && (
                  <div className="ops-pos-customer__empty">Nenhum cliente corresponde à pesquisa.</div>
                )}
              </div>
            )}
          </div>
          <div className="ops-cart-lines">
            {cartEntries.map((product) => (
              <div className="ops-cart-line" key={product.id}>
                <span className="ops-cart-line__image">
                  {product.image_url
                    ? <img src={mediaUrl(product.image_url)} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                    : null}
                  <b>{product.name.slice(0, 1).toUpperCase()}</b>
                </span>
                <span className="ops-cart-line__info"><strong>{product.name}</strong><small>{money(product.unit_price_cents)} cada</small></span>
                <span className="ops-quantity"><button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label={`Remover uma unidade de ${product.name}`}>−</button><strong>{cart[product.id]}</strong><button type="button" disabled={product.track_stock && cart[product.id] >= product.stock_quantity} onClick={() => changeQuantity(product.id, 1)} aria-label={`Adicionar uma unidade de ${product.name}`}>＋</button></span>
              </div>
            ))}
            {!cartEntries.length && <div className="ops-cart-empty"><span>＋</span><strong>Adicione artigos à venda</strong><small>Escolha um produto no catálogo.</small></div>}
          </div>
          <div className="ops-cart-totals"><div><span>Subtotal</span><strong>{money(subtotalCents)}</strong></div><div><span>Impostos</span><strong>{money(taxCents)}</strong></div><div className="ops-cart-total"><span>Total</span><strong>{money(totalCents)}</strong></div></div>
          <label className="ops-field"><span>Pagamento</span><select value={paymentMode} onChange={(event) => {
            const mode = event.target.value as PaymentMode;
            setPaymentMode(mode);
            if (mode === 'partial' && !partialAmountInput) setPartialAmountInput((totalCents / 100).toFixed(2));
          }}><option value="full">Pagamento total</option><option value="partial">Pagamento parcial</option><option value="credit">A crédito</option></select></label>
          {paymentMode === 'partial' && <label className="ops-field"><span>Valor recebido agora (Kz)</span><input type="number" inputMode="decimal" min="0.01" max={(totalCents / 100).toFixed(2)} step="0.01" value={partialAmountInput} onChange={(event) => setPartialAmountInput(event.target.value)} placeholder="0,00" /></label>}
          {paymentMode !== 'credit' ? (
            <label className="ops-field"><span>Meio de pagamento</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
          ) : <p className="ops-credit-note">{selectedCustomer ? `Venda a crédito para ${selectedCustomer.name}.` : 'Selecione um cliente para registar uma venda a crédito.'}</p>}
          {paymentMode === 'partial' && paidCents !== null && paidCents >= 0 && paidCents < totalCents && !selectedCustomerId && <small className="ops-form-help">Selecione um cliente para registar o saldo em aberto.</small>}
          {paymentMode === 'partial' && (paidCents === null || paidCents > totalCents) && <small className="ops-form-help">Indique um valor válido, até ao total da venda.</small>}
          <button className="button button--primary button--full ops-checkout" type="button" disabled={!canCheckout || busy} onClick={() => void checkout()}>{busy ? 'A registar venda…' : 'Confirmar venda'} <span aria-hidden="true">→</span></button>
          {cartEntries.length > 0 && totalCents === 0 && <small className="ops-form-help">O total precisa ser maior que zero para emitir o documento fiscal.</small>}
          {!canCheckout && cartEntries.some((product) => product.track_stock && product.stock_quantity < cart[product.id]) && <small className="ops-form-help">Quantidade superior ao stock disponível. Ajuste o stock ou reduza os artigos.</small>}
          <small className="ops-pos-footnote">Os preços e impostos são recalculados pela API a partir do catálogo.</small>
        </aside>
      </section>

      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Vendas recentes</h2><p>Últimos registos da empresa</p></div><button type="button" className="ops-icon-button" aria-label="Atualizar vendas" onClick={() => void loadData()}>↻</button></div>
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Número</th><th>Data</th><th>Estado</th><th>Total</th><th>Recebido</th><th>Documento fiscal</th></tr></thead><tbody>
          {sales.map((sale) => <tr key={sale.id}><td><strong>{sale.status === 'pending_sync' ? 'Pendente' : `#${sale.number}`}</strong></td><td>{dateTime(sale.created_at)}</td><td><span className={`ops-sale-status ops-sale-status--${sale.offline_sync_status === 'failed' ? 'sync-failed' : sale.status}`}>{sale.offline_sync_status === 'failed' ? 'Requer atenção' : sale.offline_sync_status === 'pending' ? 'A sincronizar' : sale.status === 'paid' ? 'Pago' : sale.status === 'cancelled' ? 'Anulado' : sale.status === 'partially_paid' ? 'Parcial' : 'Em aberto'}</span>{sale.offline_sync_error && <small className="ops-offline-error">{sale.offline_sync_error}</small>}{sale.offline_sync_status === 'failed' && <button type="button" className="ops-text-button" disabled={busy} onClick={() => void retrySale(sale)}>Tentar novamente</button>}</td><td><strong>{money(sale.total_cents)}</strong></td><td>{money(sale.paid_cents)}</td><td>{sale.invoice_document_id ? <button type="button" className="ops-text-button" onClick={() => setSheetDocumentId(sale.invoice_document_id)}>{sale.invoice_document_number} · Ver fatura</button> : sale.offline_sync_status === 'pending' ? 'Emitido após sincronização' : '—'}</td></tr>)}
          {!sales.length && <tr><td className="ops-table-empty" colSpan={6}>As vendas concluídas aparecerão aqui.</td></tr>}
        </tbody></table></div>
      </section>

      {sheetDocumentId && (
        <DocumentSheet companyId={companyId} documentId={sheetDocumentId} onClose={() => setSheetDocumentId(null)} />
      )}
    </div>
  );
}
