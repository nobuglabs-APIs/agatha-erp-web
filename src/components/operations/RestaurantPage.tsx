import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import type { Product } from './shared';
import { getErrorMessage, listPage, money } from './shared';

interface Table {
  id: string;
  code: string;
  name: string | null;
  area: string | null;
  seats: number;
  status: string;
}

interface MenuItem {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  station: string;
  prep_minutes: number;
  is_available: boolean;
}

interface Order {
  id: string;
  number: number;
  table_id: string | null;
  table_code: string | null;
  order_type: string;
  status: string;
  total_cents: number;
  paid_cents: number;
}

interface OrderSplit {
  id: string;
  label: string;
  amount_cents: number;
  paid_cents: number;
}

interface KitchenItem {
  item_id: string;
  order_id: string;
  order_number: number;
  table_code: string | null;
  description: string;
  quantity: number;
  status: string;
  station: string | null;
}

const paymentMethods = [
  ['cash', 'Dinheiro'],
  ['multicaixa_express', 'Multicaixa Express'],
  ['card', 'Cartão'],
  ['bank_transfer', 'Transferência'],
  ['other', 'Outro'],
];

export function RestaurantPage({ companyId }: { companyId: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchen, setKitchen] = useState<KitchenItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedTable, setSelectedTable] = useState('');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [splits, setSplits] = useState<OrderSplit[]>([]);
  const [splitCount, setSplitCount] = useState(2);
  const [selectedSplitId, setSelectedSplitId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tableRows, menuRows, orderPage, kitchenRows, productPage] = await Promise.all([
        request<Table[]>('/restaurant/tables', { companyId }),
        request<MenuItem[]>('/restaurant/menu?available=true', { companyId }),
        request<Page<Order>>('/restaurant/orders?page=1&per_page=100', { companyId }),
        request<KitchenItem[]>('/restaurant/kitchen', { companyId }),
        listPage<Product>('/products', companyId, 100),
      ]);
      setTables(tableRows.filter((table) => table.status !== 'inactive'));
      setMenu(menuRows.filter((item) => item.is_available));
      setOrders(orderPage.items.filter((order) => order.status !== 'closed' && order.status !== 'cancelled'));
      setKitchen(kitchenRows);
      setProducts(productPage.items.filter((product) => product.product_type === 'goods' && product.is_active));
      setSelectedOrder((current) => current && orderPage.items.some((item) => item.id === current.id)
        ? orderPage.items.find((item) => item.id === current.id) || null
        : null);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar a operação do restaurante.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function createTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await request('/restaurant/tables', {
        method: 'POST',
        companyId,
        body: {
          code: String(data.get('code') || '').trim(),
          name: String(data.get('name') || '').trim() || null,
          area: String(data.get('area') || '').trim() || null,
          seats: Number(data.get('seats')),
          status: 'free',
        },
      });
      form.reset();
      setNotice('Mesa criada.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar a mesa.'));
    } finally {
      setBusy(false);
    }
  }

  async function addMenuItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await request('/restaurant/menu', {
        method: 'POST',
        companyId,
        body: {
          product_id: String(data.get('product_id') || ''),
          station: String(data.get('station') || 'kitchen'),
          prep_minutes: Number(data.get('prep_minutes') || 0),
          is_available: true,
          sort_order: 0,
        },
      });
      form.reset();
      setNotice('Artigo adicionado ao menu.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível adicionar o artigo ao menu.'));
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = menu.filter((item) => (quantities[item.id] || 0) > 0)
      .map((item) => ({ menu_item_id: item.id, quantity: quantities[item.id] }));
    if (!items.length || (orderType === 'dine_in' && !selectedTable)) return;
    setBusy(true);
    setError('');
    try {
      const order = await request<Order>('/restaurant/orders', {
        method: 'POST',
        companyId,
        body: {
          order_type: orderType,
          table_id: orderType === 'dine_in' ? selectedTable : null,
          customer_id: null,
          notes: null,
          items,
        },
      });
      setQuantities({});
      setSelectedOrder(order);
      setNotice(`Pedido #${order.number} criado.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível abrir o pedido.'));
    } finally {
      setBusy(false);
    }
  }

  async function orderAction(path: string, success: string, body?: unknown) {
    if (!selectedOrder) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(path, { method: 'POST', companyId, ...(body === undefined ? {} : { body }) });
      setNotice(success);
      if (path.endsWith('/cancel')) {
        setSelectedOrder(null);
        setSplits([]);
      }
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar o pedido.'));
    } finally {
      setBusy(false);
    }
  }

  async function selectOrder(order: Order) {
    setSelectedOrder(order);
    setSplits([]);
    setSelectedSplitId('');
    setError('');
    try {
      const detail = await request<{ splits: OrderSplit[] }>('/restaurant/orders/' + order.id, { companyId });
      setSplits(detail.splits);
      setSelectedSplitId(detail.splits.find((split) => split.paid_cents < split.amount_cents)?.id || '');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar os detalhes do pedido.'));
    }
  }

  async function createSplits() {
    if (!selectedOrder || splitCount < 2 || splitCount > 20 || selectedOrder.total_cents < splitCount) return;
    const each = Math.floor(selectedOrder.total_cents / splitCount);
    const remainder = selectedOrder.total_cents - each * splitCount;
    const parts = Array.from({ length: splitCount }, (_, index) => ({
      label: `Parte ${index + 1}`,
      amount_cents: each + (index < remainder ? 1 : 0),
    }));
    setBusy(true);
    setError('');
    try {
      const detail = await request<{ splits: OrderSplit[] }>(`/restaurant/orders/${selectedOrder.id}/splits`, {
        method: 'POST',
        companyId,
        body: { parts },
      });
      setSplits(detail.splits);
      setSelectedSplitId(detail.splits[0]?.id || '');
      setNotice(`Conta dividida em ${splitCount} partes.`);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível dividir a conta.'));
    } finally {
      setBusy(false);
    }
  }

  async function payAndClose() {
    if (!selectedOrder) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const selectedSplit = splits.find((split) => split.id === selectedSplitId);
      if (splits.length && selectedOrder.paid_cents < selectedOrder.total_cents && !selectedSplit) return;
      const balance = selectedOrder.paid_cents === selectedOrder.total_cents
        ? 0
        : selectedSplit
        ? selectedSplit.amount_cents - selectedSplit.paid_cents
        : selectedOrder.total_cents - selectedOrder.paid_cents;
      if (balance > 0) {
        await request(`/restaurant/orders/${selectedOrder.id}/payments`, {
          method: 'POST',
          companyId,
          body: { method: paymentMethod, amount_cents: balance, split_id: selectedSplit?.id || null, reference: null },
        });
      }
      const detail = await request<Order>(`/restaurant/orders/${selectedOrder.id}`, { companyId });
      if (detail.paid_cents === detail.total_cents) {
        await request(`/restaurant/orders/${selectedOrder.id}/close`, { method: 'POST', companyId });
        setSelectedOrder(null);
        setSplits([]);
        setNotice('Pedido pago e fechado; a venda foi registada no ERP.');
      } else {
        setNotice(`Pagamento da ${selectedSplit?.label || 'conta'} registado. Saldo pendente: ${money(detail.total_cents - detail.paid_cents)}.`);
        setSelectedOrder(detail);
        await selectOrder(detail);
      }
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível pagar e fechar o pedido.'));
    } finally {
      setBusy(false);
    }
  }

  async function kitchenAction(item: KitchenItem, action: 'start' | 'ready') {
    setBusy(true);
    setError('');
    try {
      await request(`/restaurant/kitchen/items/${item.item_id}/${action}`, { method: 'POST', companyId });
      setNotice(action === 'start' ? 'Preparação iniciada.' : 'Item marcado como pronto.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar o item da cozinha.'));
    } finally {
      setBusy(false);
    }
  }

  const menuTotal = menu.reduce((sum, item) => sum + item.unit_price_cents * (quantities[item.id] || 0), 0);

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">RESTAURANTE</span><h1>Sala e cozinha</h1><p>Abra pedidos de mesa ou takeaway, acompanhe a cozinha e feche a conta.</p></div>
        <button type="button" className="ops-icon-button" aria-label="Atualizar restaurante" onClick={() => void loadData()}>↻</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar restaurante…</div> : (
        <>
          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Mesas</h2><p>{tables.length} mesas configuradas · {tables.filter((table) => table.status === 'free').length} livres</p></div></div>
            <div className="ops-industry-grid">
              {tables.map((table) => <button key={table.id} type="button" className="ops-industry-action" disabled={table.status !== 'free'} onClick={() => { setSelectedTable(table.id); setOrderType('dine_in'); }}>
                <strong>Mesa {table.code}{table.name ? ` · ${table.name}` : ''}</strong><span>{table.area || 'Sala'} · {table.seats} lugares · {table.status === 'free' ? 'Livre' : table.status}</span>
              </button>)}
            </div>
            <form className="ops-form-grid" onSubmit={(event) => void createTable(event)}>
              <label className="ops-field"><span>Código da mesa</span><input name="code" required maxLength={20} /></label>
              <label className="ops-field"><span>Nome (opcional)</span><input name="name" maxLength={80} /></label>
              <label className="ops-field"><span>Área</span><input name="area" maxLength={80} placeholder="Sala, esplanada…" /></label>
              <label className="ops-field"><span>Lugares</span><input name="seats" type="number" min="1" max="100" defaultValue="2" required /></label>
              <div className="ops-form-actions"><button className="button button--secondary" type="submit" disabled={busy}>Adicionar mesa</button></div>
            </form>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Menu do restaurante</h2><p>Associe artigos do catálogo à cozinha ou ao bar.</p></div></div>
            <div className="ops-industry-actions">{menu.map((item) => <article className="ops-industry-action" key={item.id}>
              <strong>{item.name} · {money(item.unit_price_cents)}</strong><span>{item.station} · {item.prep_minutes} min</span>
            </article>)}</div>
            <form className="ops-form-grid" onSubmit={(event) => void addMenuItem(event)}>
              <label className="ops-field"><span>Produto</span><select name="product_id" required defaultValue=""><option value="" disabled>Escolher produto</option>{products.filter((product) => !menu.some((item) => item.product_id === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_cents)}</option>)}</select></label>
              <label className="ops-field"><span>Estação</span><select name="station"><option value="kitchen">Cozinha</option><option value="bar">Bar</option><option value="grill">Grelha</option><option value="dessert">Sobremesas</option><option value="other">Outra</option></select></label>
              <label className="ops-field"><span>Preparação (minutos)</span><input name="prep_minutes" type="number" min="0" max="240" defaultValue="10" /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !products.some((product) => !menu.some((item) => item.product_id === product.id))}>Adicionar ao menu</button></div>
            </form>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Abrir pedido</h2><p>Selecione os artigos do menu para criar um pedido.</p></div></div>
            <form className="ops-form-grid" onSubmit={(event) => void createOrder(event)}>
              <label className="ops-field"><span>Tipo de pedido</span><select value={orderType} onChange={(event) => setOrderType(event.target.value as 'dine_in' | 'takeaway')}><option value="dine_in">Na mesa</option><option value="takeaway">Takeaway</option></select></label>
              {orderType === 'dine_in' && <label className="ops-field"><span>Mesa</span><select value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)} required><option value="">Escolher mesa livre</option>{tables.filter((table) => table.status === 'free').map((table) => <option key={table.id} value={table.id}>{table.code} · {table.name || table.area || `${table.seats} lugares`}</option>)}</select></label>}
              <div className="ops-field ops-field--wide">
                <span>Menu</span>
                <div className="ops-industry-grid">{menu.map((item) => <label className="ops-industry-action" key={item.id}>
                  <strong>{item.name} · {money(item.unit_price_cents)}</strong><span>{item.station} · {item.prep_minutes} min</span>
                  <input aria-label={`Quantidade de ${item.name}`} type="number" min="0" value={quantities[item.id] || ''} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Number(event.target.value)) }))} />
                </label>)}</div>
              </div>
              <div className="ops-form-actions"><strong>Total estimado: {money(menuTotal)}</strong><button className="button button--primary" type="submit" disabled={busy || !menuTotal || (orderType === 'dine_in' && !selectedTable)}>Abrir pedido</button></div>
            </form>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Pedidos abertos</h2><p>{orders.length} pedidos por fechar</p></div></div>
            <div className="ops-industry-actions">{orders.map((order) => <button type="button" key={order.id} className="ops-industry-action" onClick={() => void selectOrder(order)}>
              <strong>Pedido #{order.number} · {order.table_code ? `Mesa ${order.table_code}` : 'Takeaway'}</strong><span>{order.status} · {money(order.total_cents)} · pago {money(order.paid_cents)}</span>
            </button>)}</div>
          </section>

          {selectedOrder && <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Pedido #{selectedOrder.number}</h2><p>{selectedOrder.table_code ? `Mesa ${selectedOrder.table_code}` : 'Takeaway'} · saldo {money(selectedOrder.total_cents - selectedOrder.paid_cents)}</p></div><button type="button" className="ops-icon-button" onClick={() => setSelectedOrder(null)}>×</button></div>
            <div className="ops-form-actions">
              {selectedOrder.status === 'open' && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void orderAction(`/restaurant/orders/${selectedOrder.id}/send-to-kitchen`, 'Pedido enviado para a cozinha.')}>Enviar para cozinha</button>}
              {selectedOrder.status === 'ready' && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void orderAction(`/restaurant/orders/${selectedOrder.id}/serve`, 'Pedido marcado como servido.')}>Marcar servido</button>}
              {selectedOrder.paid_cents === 0 && splits.length === 0 && <><label className="ops-field"><span>Dividir em partes</span><input type="number" min="2" max="20" value={splitCount} onChange={(event) => setSplitCount(Number(event.target.value))} /></label><button type="button" className="button button--secondary" disabled={busy || selectedOrder.total_cents < splitCount} onClick={() => void createSplits()}>Dividir conta</button></>}
              {splits.length > 0 && <label className="ops-field"><span>Parte a receber</span><select value={selectedSplitId} onChange={(event) => setSelectedSplitId(event.target.value)}>{splits.map((split) => <option key={split.id} value={split.id} disabled={split.paid_cents >= split.amount_cents}>{split.label} · saldo {money(split.amount_cents - split.paid_cents)}</option>)}</select></label>}
              <select aria-label="Meio de pagamento" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
              <button type="button" className="button button--primary" disabled={busy || selectedOrder.status !== 'served'} onClick={() => void payAndClose()}>Pagar e fechar</button>
              {['open', 'in_kitchen', 'ready', 'served'].includes(selectedOrder.status) && selectedOrder.paid_cents === 0 && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void orderAction(`/restaurant/orders/${selectedOrder.id}/cancel`, 'Pedido cancelado.', { reason: 'Cancelado pelo operador da sala.' })}>Cancelar pedido</button>}
            </div>
          </section>}

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Fila da cozinha</h2><p>{kitchen.length} itens por preparar</p></div></div>
            <div className="ops-industry-actions">{kitchen.map((item) => <article className="ops-industry-action" key={item.item_id}>
              <strong>#{item.order_number} · {item.table_code ? `Mesa ${item.table_code}` : 'Takeaway'} · {item.description} × {item.quantity}</strong><span>{item.station || 'Cozinha'} · {item.status}</span>
              <div className="ops-form-actions">{item.status === 'pending' && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void kitchenAction(item, 'start')}>Iniciar</button>}{item.status === 'preparing' && <button type="button" className="button button--primary" disabled={busy} onClick={() => void kitchenAction(item, 'ready')}>Marcar pronto</button>}</div>
            </article>)}</div>
          </section>
        </>
      )}
    </div>
  );
}
