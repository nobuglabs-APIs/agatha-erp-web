import { useCallback, useEffect, useMemo, useState } from 'react';
import { request, requestBlob } from '../../api/client';
import type { Customer, Product, Sale } from './shared';
import { dateTime, getErrorMessage, listPage, money, parseAmountCents } from './shared';

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productResult, customerResult, salesResult] = await Promise.all([
        listPage<Product>('/products', companyId, 100),
        listPage<Customer>('/customers', companyId, 100),
        listPage<Sale>('/sales', companyId, 10),
      ]);
      setProducts(productResult.items);
      setCustomers(customerResult.items);
      setSales(salesResult.items);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar o ponto de venda.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

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
      setLastSale(sale);
      const documentLabel = sale.invoice_document_type === 'invoice_receipt' ? 'fatura-recibo' : 'fatura';
      setNotice(sale.invoice_document_number
        ? `Venda #${sale.number} registada e ${documentLabel} ${sale.invoice_document_number} emitida.`
        : `Venda #${sale.number} registada. Documento fiscal não retornado.`);
      setCart({});
      setSelectedCustomerId('');
      setPaymentMode('full');
      setPartialAmountInput('');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível concluir a venda.'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadInvoice(sale: Sale) {
    if (!sale.invoice_document_id) return;
    setError('');
    try {
      const pdf = await requestBlob(`/sales/documents/${sale.invoice_document_id}/pdf`, companyId);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(sale.invoice_document_number || `venda-${sale.number}`).replace(/[^\w.-]+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível descarregar a fatura.'));
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
      {lastSale && (
        <section className="ops-sale-success">
          <span>✓</span><div><strong>Venda #{lastSale.number} concluída</strong><small>{money(lastSale.total_cents)} · {lastSale.status === 'paid' ? 'Pagamento registado' : 'Pagamento em aberto'} · {lastSale.invoice_document_type === 'invoice_receipt' ? 'Fatura-recibo' : 'Fatura'} {lastSale.invoice_document_number || 'emitida'}</small></div>
          {lastSale.invoice_document_id && <button type="button" className="ops-text-button" onClick={() => void downloadInvoice(lastSale)}>Descarregar fatura</button>}
          <button type="button" onClick={() => setLastSale(null)} aria-label="Fechar">×</button>
        </section>
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
                  <span className="ops-pos-product__symbol">{product.name.slice(0, 1).toUpperCase()}<b>＋</b></span>
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
          {sales.map((sale) => <tr key={sale.id}><td><strong>#{sale.number}</strong></td><td>{dateTime(sale.created_at)}</td><td><span className={`ops-sale-status ops-sale-status--${sale.status}`}>{sale.status === 'paid' ? 'Pago' : sale.status === 'cancelled' ? 'Anulado' : sale.status === 'partially_paid' ? 'Parcial' : 'Em aberto'}</span></td><td><strong>{money(sale.total_cents)}</strong></td><td>{money(sale.paid_cents)}</td><td>{sale.invoice_document_id ? <button type="button" className="ops-text-button" onClick={() => void downloadInvoice(sale)}>{sale.invoice_document_number} · PDF</button> : '—'}</td></tr>)}
          {!sales.length && <tr><td className="ops-table-empty" colSpan={6}>As vendas concluídas aparecerão aqui.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
