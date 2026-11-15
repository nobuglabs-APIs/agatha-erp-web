import { useCallback, useEffect, useMemo, useState } from 'react';
import { mediaUrl, request } from '../../api/client';
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

interface CashSession {
  id: string;
  status: 'open' | 'closed';
  expected_cash_cents: number | null;
  difference_cents: number | null;
}

export function SalesPage({ companyId, onNavigate }: { companyId: string; onNavigate?: (view: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [partialAmountInput, setPartialAmountInput] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sheetDocumentId, setSheetDocumentId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productResult, customerResult, salesResult, cashSession] = await Promise.all([
        listPage<Product>('/products', companyId, 100),
        listPage<Customer>('/customers', companyId, 100),
        listPage<Sale>('/sales', companyId, 10),
        request<CashSession | null>('/cash-register/active', { companyId }),
      ]);
      setProducts(productResult.items);
      setCustomers(customerResult.items);
      setSales(salesResult.items);
      setCashSession(cashSession);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar o ponto de venda.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const cashOpen = cashSession?.status === 'open';

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
  const canCheckout = cashOpen
    && cartEntries.length > 0
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

  async function cancelSale(sale: Sale) {
    const confirmed = window.confirm(
      `Anular a venda #${sale.number}? O stock dos artigos é reposto e o documento fiscal associado é anulado. Esta ação não pode ser revertida.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/sales/${sale.id}/cancel`, { method: 'POST', companyId });
      setNotice(`Venda #${sale.number} anulada.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, `Não foi possível anular a venda #${sale.number}.`));
    } finally {
      setBusy(false);
    }
  }

  async function openCashRegister() {
    const input = window.prompt('Fundo inicial para abrir o caixa (Kz):', '0.00');
    if (input === null) return;
    const openingCash = parseAmountCents(input.replace(',', '.'));
    if (openingCash === null || openingCash < 0) {
      setError('Indique um fundo inicial válido.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<CashSession>('/cash-register/sessions', {
        method: 'POST',
        companyId,
        body: { opening_cash_cents: openingCash },
      });
      setNotice('Caixa aberto. Já pode concluir vendas.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível abrir o caixa.'));
    } finally {
      setBusy(false);
    }
  }

  async function closeCashRegister() {
    if (!cashSession) return;
    const expected = cashSession.expected_cash_cents || 0;
    const input = window.prompt('Dinheiro contado no caixa (Kz):', (expected / 100).toFixed(2));
    if (input === null) return;
    const counted = parseAmountCents(input.replace(',', '.'));
    if (counted === null || counted < 0) {
      setError('Indique um valor contado válido.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const closed = await request<CashSession>(`/cash-register/sessions/${cashSession.id}/close`, {
        method: 'POST',
        companyId,
        body: { counted_cash_cents: counted },
      });
      const difference = closed.difference_cents || 0;
      setNotice(`Caixa fechado. Diferença ${difference >= 0 ? '+' : '−'}${money(Math.abs(difference))}.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível fechar o caixa.'));
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
      const sale = await request<Sale>('/sales', {
        method: 'POST',
        companyId,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          customer_id: selectedCustomerId || null,
          items: cartEntries.map((product) => ({ product_id: product.id, quantity: cart[product.id] })),
          payments: paidCents ? [{ method: paymentMethod, amount_cents: paidCents }] : [],
        },
      });
      const documentLabel = sale.invoice_document_type === 'invoice_receipt' ? 'fatura-recibo' : 'fatura';
      setNotice(sale.invoice_document_number
        ? `Venda #${sale.number} registada e ${documentLabel} ${sale.invoice_document_number} emitida.`
        : `Venda #${sale.number} registada. Documento fiscal não retornado.`);
      setCart({});
      setSelectedCustomerId('');
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
        <div className="ops-page-actions">
          <span className="ops-pos-live"><i /> {cashOpen ? 'Caixa aberto' : 'Caixa fechado'}</span>
          <button
            type="button"
            className={`button ${cashOpen ? 'button--secondary' : 'button--primary'}`}
            disabled={busy || loading}
            onClick={() => void (cashOpen ? closeCashRegister() : openCashRegister())}
          >
            {cashOpen ? 'Fechar caixa' : 'Abrir caixa'}
          </button>
        </div>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {!cashOpen && !loading && (
        <div className="ops-alert ops-alert--error" role="alert">
          Abra o caixa antes de iniciar uma venda.
          <button type="button" className="ops-text-button" disabled={busy} onClick={() => void openCashRegister()}>Abrir caixa</button>
          {onNavigate && <button type="button" className="ops-text-button" onClick={() => onNavigate('cash')}>Gerir caixa</button>}
        </div>
      )}
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
                  <span className={product.image_url ? 'ops-pos-product__symbol ops-pos-product__symbol--media' : 'ops-pos-product__symbol'}>
                    {product.image_url ? <img src={mediaUrl(product.image_url)} alt="" /> : product.name.slice(0, 1).toUpperCase()}<b>＋</b>
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
          <label className="ops-field"><span>Cliente</span><select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}><option value="">Consumidor final</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name || customer.name}{customer.nif ? ` · ${customer.nif}` : ''}</option>)}</select></label>
          <div className="ops-cart-lines">
            {cartEntries.map((product) => (
              <div className="ops-cart-line" key={product.id}>
                {product.image_url && <img className="ops-cart-line__thumb" src={mediaUrl(product.image_url)} alt="" />}
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
          {!cashOpen && <small className="ops-form-help">Abra o caixa para concluir vendas.</small>}
          {cashOpen && cartEntries.length > 0 && totalCents === 0 && <small className="ops-form-help">O total precisa ser maior que zero para emitir o documento fiscal.</small>}
          {!canCheckout && cartEntries.some((product) => product.track_stock && product.stock_quantity < cart[product.id]) && <small className="ops-form-help">Quantidade superior ao stock disponível. Ajuste o stock ou reduza os artigos.</small>}
          <small className="ops-pos-footnote">Os preços e impostos são recalculados pela API a partir do catálogo.</small>
        </aside>
      </section>

      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Vendas recentes</h2><p>Últimos registos da empresa</p></div><button type="button" className="ops-icon-button" aria-label="Atualizar vendas" onClick={() => void loadData()}>↻</button></div>
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Número</th><th>Data</th><th>Estado</th><th>Total</th><th>Recebido</th><th>Documento fiscal</th><th /></tr></thead><tbody>
          {sales.map((sale) => <tr key={sale.id}><td><strong>#{sale.number}</strong></td><td>{dateTime(sale.created_at)}</td><td><span className={`ops-sale-status ops-sale-status--${sale.status}`}>{sale.status === 'paid' ? 'Pago' : sale.status === 'cancelled' ? 'Anulado' : sale.status === 'partially_paid' ? 'Parcial' : 'Em aberto'}</span></td><td><strong>{money(sale.total_cents)}</strong></td><td>{money(sale.paid_cents)}</td><td>{sale.invoice_document_id ? <button type="button" className="ops-text-button" onClick={() => setSheetDocumentId(sale.invoice_document_id)}>{sale.invoice_document_number} · Ver fatura</button> : '—'}</td><td>{sale.status !== 'cancelled' && sale.refunded_cents === 0 && <button type="button" className="button button--secondary document-action" disabled={busy} onClick={() => void cancelSale(sale)}>Anular</button>}</td></tr>)}
          {!sales.length && <tr><td className="ops-table-empty" colSpan={7}>As vendas concluídas aparecerão aqui.</td></tr>}
        </tbody></table></div>
      </section>

      {sheetDocumentId && (
        <DocumentSheet companyId={companyId} documentId={sheetDocumentId} onClose={() => setSheetDocumentId(null)} />
      )}
    </div>
  );
}
