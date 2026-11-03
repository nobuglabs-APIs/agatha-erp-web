import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import type { Sale } from './shared';
import { dateTime, getErrorMessage, listPage, money } from './shared';

interface PosProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  unit_price_cents: number;
  tax_rate_bp: number;
  track_stock: boolean;
  stock_quantity: number;
}

interface Promotion {
  id: string;
  name: string;
  code: string;
  discount_bp: number;
  min_total_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

interface SaleDetail extends Sale {
  items: Array<{
    id: string;
    product_id: string;
    sku: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
  }>;
}

interface ReturnRow {
  id: string;
  number: string;
  sale_id: string;
  reason: string;
  refund_method: string | null;
  refund_cents: number;
  created_at: string;
}

interface ReturnDetail extends ReturnRow {
  items: Array<{ sale_item_id: string; quantity: number }>;
}

const paymentMethods = [
  ['cash', 'Dinheiro'],
  ['multicaixa_express', 'Multicaixa Express'],
  ['card', 'Cartão'],
  ['bank_transfer', 'Transferência'],
  ['other', 'Outro'],
];

export function CommercePage({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [promotionCode, setPromotionCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saleForReturn, setSaleForReturn] = useState<SaleDetail | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnableQuantities, setReturnableQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productRows, promotionPage, salePage, returnPage] = await Promise.all([
        request<PosProduct[]>('/commerce/pos/products?limit=100', { companyId }),
        request<Page<Promotion>>('/commerce/promotions?page=1&per_page=100', { companyId }),
        listPage<Sale>('/sales', companyId, 20),
        request<Page<ReturnRow>>('/commerce/returns?page=1&per_page=100', { companyId }),
      ]);
      setProducts(productRows);
      setPromotions(promotionPage.items);
      setSales(salePage.items);
      setReturns(returnPage.items);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar o módulo de comércio.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return products.filter((product) => !term || product.name.toLocaleLowerCase().includes(term)
      || product.sku.toLocaleLowerCase().includes(term) || product.barcode?.includes(term));
  }, [products, query]);

  const grossCents = products.reduce((sum, product) => {
    const quantity = cart[product.id] || 0;
    const subtotal = product.unit_price_cents * quantity;
    return sum + subtotal + Math.floor((subtotal * product.tax_rate_bp + 5_000) / 10_000);
  }, 0);
  const now = Date.now();
  const promotion = promotions.find((item) => item.is_active
    && item.code.toUpperCase() === promotionCode.trim().toUpperCase()
    && (!item.starts_at || new Date(item.starts_at).getTime() <= now)
    && (!item.ends_at || new Date(item.ends_at).getTime() > now));
  const discountCents = promotion && grossCents >= promotion.min_total_cents
    ? Math.min(grossCents, Math.floor((grossCents * promotion.discount_bp + 5_000) / 10_000))
    : 0;
  const totalCents = grossCents - discountCents;
  const insufficientStock = products.some((product) => product.track_stock && (cart[product.id] || 0) > product.stock_quantity);
  const activePromotions = promotions.filter((item) => item.is_active
    && (!item.starts_at || new Date(item.starts_at).getTime() <= now)
    && (!item.ends_at || new Date(item.ends_at).getTime() > now));
  const invalidPromotion = Boolean(promotionCode && (!promotion || grossCents < promotion.min_total_cents));

  function addProduct(product: PosProduct) {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }));
  }

  async function addBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = barcode.trim();
    if (!value) return;
    setError('');
    try {
      const product = await request<PosProduct>(`/commerce/pos/barcode/${encodeURIComponent(value)}`, { companyId });
      addProduct(product);
      setBarcode('');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi encontrado um produto com esse código de barras.'));
    }
  }

  async function checkout() {
    const items = products.filter((product) => (cart[product.id] || 0) > 0);
    if (!items.length || totalCents <= 0 || insufficientStock || invalidPromotion) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sale = await request<SaleDetail>('/commerce/pos/sales', {
        method: 'POST',
        companyId,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          customer_id: null,
          items: items.map((product) => ({ product_id: product.id, quantity: cart[product.id] })),
          payments: [{ method: paymentMethod, amount_cents: totalCents }],
          promotion_code: promotion ? promotion.code : null,
        },
      });
      setCart({});
      setPromotionCode('');
      setNotice(`Venda #${sale.number} concluída${sale.invoice_document_number ? ` · fatura ${sale.invoice_document_number}` : ''}.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível concluir a venda.'));
    } finally {
      setBusy(false);
    }
  }

  async function createPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await request('/commerce/promotions', {
        method: 'POST',
        companyId,
        body: {
          name: String(data.get('name') || '').trim(),
          code: String(data.get('code') || '').trim().toUpperCase(),
          description: String(data.get('description') || '').trim() || null,
          discount_bp: Math.round(Number(data.get('discount') || 0) * 100),
          min_total_cents: Math.round(Number(data.get('minimum') || 0) * 100),
          starts_at: null,
          ends_at: null,
          is_active: true,
        },
      });
      form.reset();
      setNotice('Promoção criada e disponível no POS.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar a promoção.'));
    } finally {
      setBusy(false);
    }
  }

  async function selectSaleForReturn(saleId: string) {
    setSaleForReturn(null);
    setReturnQuantities({});
    setReturnableQuantities({});
    if (!saleId) return;
    setError('');
    try {
      const [sale, returnPage] = await Promise.all([
        request<SaleDetail>(`/sales/${saleId}`, { companyId }),
        request<Page<ReturnRow>>(`/commerce/returns?sale_id=${encodeURIComponent(saleId)}&page=1&per_page=100`, { companyId }),
      ]);
      const returnDetails = await Promise.all(returnPage.items.map((item) =>
        request<ReturnDetail>(`/commerce/returns/${item.id}`, { companyId })));
      const returnedBySaleItem: Record<string, number> = {};
      for (const returned of returnDetails) {
        for (const item of returned.items) {
          returnedBySaleItem[item.sale_item_id] = (returnedBySaleItem[item.sale_item_id] || 0) + item.quantity;
        }
      }
      setReturnableQuantities(Object.fromEntries(sale.items.map((item) => [
        item.id,
        Math.max(0, item.quantity - (returnedBySaleItem[item.id] || 0)),
      ])));
      setSaleForReturn(sale);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar as linhas da venda.'));
    }
  }

  async function createReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saleForReturn) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const items = saleForReturn.items
      .filter((item) => (returnQuantities[item.id] || 0) > 0)
      .map((item) => ({ sale_item_id: item.id, quantity: returnQuantities[item.id] }));
    if (!items.length) return;
    setBusy(true);
    setError('');
    try {
      await request('/commerce/returns', {
        method: 'POST',
        companyId,
        body: {
          sale_id: saleForReturn.id,
          reason: String(data.get('reason') || '').trim(),
          refund_method: String(data.get('refund_method') || '') || null,
          items,
        },
      });
      setSaleForReturn(null);
      setReturnQuantities({});
      setReturnableQuantities({});
      setNotice('Devolução registada, reembolso contabilizado e stock atualizado.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível registar a devolução.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">COMÉRCIO</span><h1>POS e promoções</h1><p>Venda rápida com código de barras, campanhas e devoluções parciais.</p></div>
        <button type="button" className="ops-icon-button" aria-label="Atualizar comércio" onClick={() => void loadData()}>↻</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar comércio…</div> : (
        <>
          <section className="ops-pos-layout">
            <section className="ops-card">
              <div className="ops-table-toolbar"><div><h2>Produtos do POS</h2><p>{products.length} artigos encontrados</p></div><label className="ops-search ops-search--inline"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, SKU ou código" /></label></div>
              <form className="ops-industry-inline-form" onSubmit={(event) => void addBarcode(event)}><input aria-label="Ler código de barras" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Ler ou inserir código de barras" /><button className="button button--secondary" type="submit">Adicionar</button></form>
              <div className="ops-pos-product-grid">{filteredProducts.map((product) => <button type="button" className="ops-pos-product" key={product.id} disabled={product.track_stock && product.stock_quantity <= 0} onClick={() => addProduct(product)}>
                <strong>{product.name}</strong><small>{product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</small><b>{money(product.unit_price_cents)}</b><small>{product.track_stock ? `Stock: ${product.stock_quantity}` : 'Serviço'}</small>
              </button>)}</div>
            </section>
            <section className="ops-card ops-pos-cart">
              <div className="ops-card-heading"><div><h2>Carrinho</h2><p>{Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)} artigos</p></div></div>
              <div className="ops-industry-actions">{products.filter((product) => (cart[product.id] || 0) > 0).map((product) => <div className="ops-industry-action" key={product.id}>
                <strong>{product.name} · {money(product.unit_price_cents)}</strong><div className="ops-industry-inline-form"><button type="button" className="button button--secondary" onClick={() => setCart((current) => ({ ...current, [product.id]: Math.max(0, current[product.id] - 1) }))}>−</button><span>{cart[product.id]}</span><button type="button" className="button button--secondary" onClick={() => addProduct(product)}>+</button></div>
              </div>)}</div>
              <label className="ops-field"><span>Promoção</span><select value={promotionCode} onChange={(event) => setPromotionCode(event.target.value)}><option value="">Sem promoção</option>{activePromotions.map((item) => <option value={item.code} key={item.id}>{item.code} · {item.discount_bp / 100}%</option>)}</select></label>
              {promotionCode && !promotion && <small className="ops-form-help">Código inválido ou total abaixo do mínimo da campanha.</small>}
              {insufficientStock && <small className="ops-form-help">A quantidade no carrinho excede o stock disponível de um ou mais artigos.</small>}
              <label className="ops-field"><span>Pagamento</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="ops-industry-totals"><span>Subtotal com imposto</span><strong>{money(grossCents)}</strong><span>Desconto</span><strong>− {money(discountCents)}</strong><span>Total</span><strong>{money(totalCents)}</strong></div>
              <button type="button" className="button button--primary" disabled={busy || totalCents <= 0 || insufficientStock || invalidPromotion || !Object.keys(cart).some((id) => cart[id] > 0)} onClick={() => void checkout()}>Concluir venda</button>
            </section>
          </section>

          <section className="ops-industry-grid">
            <form className="ops-card ops-form-grid" onSubmit={(event) => void createPromotion(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Criar promoção</h2><p>Desconto percentual com código e valor mínimo opcional.</p></div></div>
              <label className="ops-field"><span>Nome</span><input name="name" required maxLength={120} /></label>
              <label className="ops-field"><span>Código</span><input name="code" required maxLength={40} /></label>
              <label className="ops-field"><span>Desconto (%)</span><input name="discount" type="number" min="0.01" max="100" step="0.01" required /></label>
              <label className="ops-field"><span>Total mínimo (Kz)</span><input name="minimum" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label className="ops-field ops-field--wide"><span>Descrição</span><input name="description" maxLength={1000} /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy}>Criar promoção</button></div>
            </form>

            <form className="ops-card ops-form-grid" onSubmit={(event) => void createReturn(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Registar devolução</h2><p>Escolha uma venda paga e indique os artigos devolvidos.</p></div></div>
              <label className="ops-field ops-field--wide"><span>Venda</span><select value={saleForReturn?.id || ''} onChange={(event) => void selectSaleForReturn(event.target.value)}><option value="">Escolher venda</option>{sales.filter((sale) => sale.status === 'paid' && sale.refunded_cents < sale.paid_cents).map((sale) => <option key={sale.id} value={sale.id}>#{sale.number} · {dateTime(sale.created_at)} · {money(sale.total_cents)}</option>)}</select></label>
              {saleForReturn && <div className="ops-field ops-field--wide"><span>Artigos e quantidades</span><div className="ops-industry-actions">{saleForReturn.items.map((item) => <label className="ops-industry-action" key={item.id}>
                <strong>{item.product_name} · {item.sku}</strong><span>Devolvível: {returnableQuantities[item.id] || 0} de {item.quantity}</span><input aria-label={`Quantidade devolvida de ${item.product_name}`} type="number" min="0" max={returnableQuantities[item.id] || 0} value={returnQuantities[item.id] || ''} onChange={(event) => setReturnQuantities((current) => ({ ...current, [item.id]: Math.min(returnableQuantities[item.id] || 0, Math.max(0, Number(event.target.value))) }))} />
              </label>)}</div></div>}
              <label className="ops-field"><span>Motivo</span><input name="reason" required minLength={3} maxLength={500} /></label>
              <label className="ops-field"><span>Reembolso</span><select name="refund_method"><option value="">Sem reembolso</option>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !saleForReturn || !Object.values(returnQuantities).some((quantity) => quantity > 0)}>Confirmar devolução</button></div>
            </form>
          </section>

          <section className="ops-industry-grid">
            <section className="ops-card"><div className="ops-card-heading"><div><h2>Promoções</h2><p>{promotions.length} campanhas</p></div></div>
              <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Campanha</th><th>Código</th><th>Desconto</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>
                {promotions.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.code}</td><td>{item.discount_bp / 100}%</td><td>{money(item.min_total_cents)}</td><td>{item.is_active ? 'Ativa' : 'Inativa'}</td></tr>)}
                {!promotions.length && <tr><td className="ops-table-empty" colSpan={5}>Ainda não há promoções.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="ops-card"><div className="ops-card-heading"><div><h2>Devoluções recentes</h2><p>{returns.length} registos</p></div></div>
              <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Número</th><th>Venda</th><th>Motivo</th><th>Reembolso</th><th>Data</th></tr></thead><tbody>
                {returns.map((item) => <tr key={item.id}><td>{item.number}</td><td>{sales.find((sale) => sale.id === item.sale_id)?.number || '—'}</td><td>{item.reason}</td><td>{money(item.refund_cents)}</td><td>{dateTime(item.created_at)}</td></tr>)}
                {!returns.length && <tr><td className="ops-table-empty" colSpan={5}>Ainda não há devoluções.</td></tr>}
              </tbody></table></div>
            </section>
          </section>
        </>
      )}
    </div>
  );
}
