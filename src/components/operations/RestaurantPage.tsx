import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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
  description: string | null;
  category_name: string | null;
  unit_price_cents: number;
  tax_rate_bp: number;
  station: string;
  prep_minutes: number;
  is_available: boolean;
  sort_order: number;
}

interface Order {
  id: string;
  number: number;
  table_id: string | null;
  table_code: string | null;
  order_type: string;
  status: string;
  notes: string | null;
  total_cents: number;
  paid_cents: number;
  created_at: string;
}

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  status: string;
  notes: string | null;
}

interface OrderPayment {
  id: string;
  split_id: string | null;
  method: string;
  amount_cents: number;
  created_at: string;
}

interface OrderSplit {
  id: string;
  label: string;
  amount_cents: number;
  paid_cents: number;
}

interface OrderDetail extends Order {
  items: OrderItem[];
  payments: OrderPayment[];
  splits: OrderSplit[];
}

interface KitchenItem {
  item_id: string;
  order_id: string;
  order_number: number;
  table_code: string | null;
  order_type: string;
  description: string;
  quantity: number;
  notes: string | null;
  status: string;
  station: string | null;
  prep_minutes: number | null;
  created_at: string;
}

type Tab = 'floor' | 'orders' | 'kitchen' | 'menu';

type Sheet =
  | { kind: 'none' }
  | { kind: 'new'; orderType: 'dine_in' | 'takeaway'; tableId: string }
  | { kind: 'order'; orderId: string };

const stationOrder = ['kitchen', 'bar', 'grill', 'dessert', 'other'];
const stationLabels: Record<string, string> = {
  kitchen: 'Cozinha',
  bar: 'Bar',
  grill: 'Grelha',
  dessert: 'Sobremesas',
  other: 'Outra',
};
const orderStatusLabels: Record<string, string> = {
  open: 'Aberto',
  in_kitchen: 'Na cozinha',
  ready: 'Pronto',
  served: 'Servido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
};
const paymentMethods = [
  ['cash', 'Dinheiro'],
  ['multicaixa_express', 'Multicaixa Express'],
  ['card', 'Cartão'],
  ['bank_transfer', 'Transferência'],
  ['other', 'Outro'],
];

function elapsedMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function tableStatusLabel(status: string): string {
  return { free: 'Livre', occupied: 'Ocupada', reserved: 'Reservada', inactive: 'Inativa' }[status] || status;
}

export function RestaurantPage({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<Tab>('floor');
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchen, setKitchen] = useState<KitchenItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addQuantities, setAddQuantities] = useState<Record<string, number>>({});
  const [addMode, setAddMode] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [selectedSplitId, setSelectedSplitId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [stationFilter, setStationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tableRows, menuRows, orderPage, kitchenRows, productPage] = await Promise.all([
        request<Table[]>('/restaurant/tables', { companyId }),
        request<MenuItem[]>('/restaurant/menu', { companyId }),
        request<Page<Order>>('/restaurant/orders?page=1&per_page=100', { companyId }),
        request<KitchenItem[]>('/restaurant/kitchen', { companyId }),
        listPage<Product>('/products', companyId, 100),
      ]);
      setTables(tableRows.filter((table) => table.status !== 'inactive'));
      setMenu(menuRows);
      setOrders(orderPage.items.filter((order) => order.status !== 'closed' && order.status !== 'cancelled'));
      setKitchen(kitchenRows);
      setProducts(productPage.items.filter((product) => product.product_type === 'goods' && product.is_active));
      setNow(Date.now());
      setLoaded(true);
      if (!silent) setError('');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar a operação do restaurante.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadData(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const loadOrder = useCallback(async (orderId: string) => {
    setDetailLoading(true);
    try {
      const data = await request<OrderDetail>(`/restaurant/orders/${orderId}`, { companyId });
      setDetail(data);
      setSelectedSplitId(data.splits.find((split) => split.paid_cents < split.amount_cents)?.id || '');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível abrir o pedido.'));
      setSheet({ kind: 'none' });
    } finally {
      setDetailLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (sheet.kind === 'order') {
      void loadOrder(sheet.orderId);
    } else {
      setDetail(null);
      setAddMode(false);
      setAddQuantities({});
    }
  }, [sheet, loadOrder]);

  const menuByStation = useMemo(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of menu) {
      const list = groups.get(item.station) || [];
      list.push(item);
      groups.set(item.station, list);
    }
    return [...groups.entries()].sort(
      (a, b) => {
        const left = stationOrder.indexOf(a[0]);
        const right = stationOrder.indexOf(b[0]);
        return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
      },
    );
  }, [menu]);

  const areas = useMemo(() => {
    const groups = new Map<string, Table[]>();
    for (const table of tables) {
      const key = table.area || 'Sala';
      const list = groups.get(key) || [];
      list.push(table);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [tables]);

  const orderByTable = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of orders) {
      if (order.table_id) map.set(order.table_id, order);
    }
    return map;
  }, [orders]);

  const occupiedTables = tables.filter((table) => table.status === 'occupied').length;
  const kitchenQueue = kitchen.filter((item) => item.status !== 'ready');
  const openTotal = orders.reduce((sum, order) => sum + (order.total_cents - order.paid_cents), 0);
  const kitchenStations = useMemo(
    () => [...new Set(kitchen.map((item) => item.station).filter((value): value is string => Boolean(value)))],
    [kitchen],
  );

  function openTable(table: Table) {
    const order = orderByTable.get(table.id);
    if (order) {
      setSheet({ kind: 'order', orderId: order.id });
      return;
    }
    if (table.status !== 'free') {
      setNotice(`A mesa ${table.code} está ${tableStatusLabel(table.status).toLowerCase()}.`);
      return;
    }
    setQuantities({});
    setSheet({ kind: 'new', orderType: 'dine_in', tableId: table.id });
  }

  async function refreshOrder(orderId: string) {
    await loadOrder(orderId);
    await loadData(true);
  }

  async function action(path: string, success: string, body?: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(path, { method: 'POST', companyId, ...(body === undefined ? {} : { body }) });
      setNotice(success);
      if (sheet.kind === 'order') await refreshOrder(sheet.orderId);
      else await loadData(true);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível concluir a operação.'));
    } finally {
      setBusy(false);
    }
  }

  async function createOrder() {
    if (sheet.kind !== 'new') return;
    const items = menu
      .filter((item) => (quantities[item.id] || 0) > 0)
      .map((item) => ({ menu_item_id: item.id, quantity: quantities[item.id], notes: null }));
    if (!items.length || (sheet.orderType === 'dine_in' && !sheet.tableId)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const order = await request<OrderDetail>('/restaurant/orders', {
        method: 'POST',
        companyId,
        body: {
          order_type: sheet.orderType,
          table_id: sheet.orderType === 'dine_in' ? sheet.tableId : null,
          customer_id: null,
          notes: null,
          items,
        },
      });
      setQuantities({});
      setTab('floor');
      setSheet({ kind: 'order', orderId: order.id });
      setNotice(`Pedido #${order.number} aberto.`);
      await loadData(true);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível abrir o pedido.'));
    } finally {
      setBusy(false);
    }
  }

  async function addItems() {
    if (!detail) return;
    const items = menu
      .filter((item) => (addQuantities[item.id] || 0) > 0)
      .map((item) => ({ menu_item_id: item.id, quantity: addQuantities[item.id], notes: null }));
    if (!items.length) return;
    setBusy(true);
    setError('');
    try {
      const updated = await request<OrderDetail>(`/restaurant/orders/${detail.id}/items`, {
        method: 'POST',
        companyId,
        body: { items },
      });
      setDetail(updated);
      setAddQuantities({});
      setAddMode(false);
      setNotice('Itens adicionados ao pedido.');
      await loadData(true);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível adicionar os itens.'));
    } finally {
      setBusy(false);
    }
  }

  async function createSplits() {
    if (!detail || splitCount < 2 || splitCount > 20 || detail.total_cents < splitCount) return;
    const each = Math.floor(detail.total_cents / splitCount);
    const remainder = detail.total_cents - each * splitCount;
    const parts = Array.from({ length: splitCount }, (_, index) => ({
      label: `Convidado ${index + 1}`,
      amount_cents: each + (index < remainder ? 1 : 0),
    }));
    setBusy(true);
    setError('');
    try {
      const updated = await request<OrderDetail>(`/restaurant/orders/${detail.id}/splits`, {
        method: 'POST',
        companyId,
        body: { parts },
      });
      setDetail(updated);
      setSelectedSplitId(updated.splits[0]?.id || '');
      setNotice(`Conta dividida por ${splitCount}.`);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível dividir a conta.'));
    } finally {
      setBusy(false);
    }
  }

  async function chargeAndClose() {
    if (!detail) return;
    const selectedSplit = detail.splits.find((split) => split.id === selectedSplitId);
    const due = selectedSplit
      ? selectedSplit.amount_cents - selectedSplit.paid_cents
      : detail.total_cents - detail.paid_cents;
    if (due <= 0) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/restaurant/orders/${detail.id}/payments`, {
        method: 'POST',
        companyId,
        body: {
          method: paymentMethod,
          amount_cents: due,
          split_id: selectedSplit?.id ?? null,
          reference: null,
        },
      });
      const updated = await request<OrderDetail>(`/restaurant/orders/${detail.id}`, { companyId });
      if (updated.paid_cents === updated.total_cents) {
        await request(`/restaurant/orders/${detail.id}/close`, { method: 'POST', companyId });
        setSheet({ kind: 'none' });
        setNotice(`Pedido #${updated.number} pago e fechado. Venda registada no ERP.`);
      } else {
        setDetail(updated);
        setSelectedSplitId(updated.splits.find((split) => split.paid_cents < split.amount_cents)?.id || '');
        setNotice(`Pagamento registado. Falta ${money(updated.total_cents - updated.paid_cents)}.`);
      }
      await loadData(true);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível cobrar o pedido.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    if (!detail) return;
    const reason = window.prompt('Motivo do cancelamento do pedido:');
    if (!reason?.trim() || reason.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      await request(`/restaurant/orders/${detail.id}/cancel`, {
        method: 'POST',
        companyId,
        body: { reason: reason.trim() },
      });
      setSheet({ kind: 'none' });
      setNotice(`Pedido #${detail.number} cancelado.`);
      await loadData(true);
    } catch (error_) {
      setError(getErrorMessage(error_, 'Não foi possível cancelar o pedido.'));
    } finally {
      setBusy(false);
    }
  }

  async function kitchenAction(item: KitchenItem, step: 'start' | 'ready') {
    setBusy(true);
    setError('');
    try {
      await request(`/restaurant/kitchen/items/${item.item_id}/${step}`, { method: 'POST', companyId });
      setNotice(step === 'start' ? 'Preparação iniciada.' : 'Item pronto a servir.');
      await loadData(true);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar a cozinha.'));
    } finally {
      setBusy(false);
    }
  }

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
      await loadData(true);
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
      await loadData(true);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível adicionar o artigo ao menu.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailability(item: MenuItem) {
    setBusy(true);
    setError('');
    try {
      await request(`/restaurant/menu/${item.id}`, {
        method: 'PUT',
        companyId,
        body: {
          station: item.station,
          prep_minutes: item.prep_minutes,
          is_available: !item.is_available,
          sort_order: item.sort_order,
        },
      });
      setNotice(item.is_available ? `${item.name} marcado como esgotado.` : `${item.name} disponível outra vez.`);
      await loadData(true);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar o artigo.'));
    } finally {
      setBusy(false);
    }
  }

  const newOrderTotal = menu.reduce((sum, item) => sum + item.unit_price_cents * (quantities[item.id] || 0), 0);
  const addTotal = menu.reduce((sum, item) => sum + item.unit_price_cents * (addQuantities[item.id] || 0), 0);
  const tableLabel = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId);
    return table ? `Mesa ${table.code}${table.name ? ` · ${table.name}` : ''}` : 'Mesa';
  };
  const balance = detail ? detail.total_cents - detail.paid_cents : 0;
  const selectedSplit = detail?.splits.find((split) => split.id === selectedSplitId);
  const dueNow = selectedSplit ? selectedSplit.amount_cents - selectedSplit.paid_cents : balance;
  const canAddItems = Boolean(detail && detail.status === 'open' && detail.paid_cents === 0 && detail.splits.length === 0);

  return (
    <div className="rs">
      <header className="rs-head">
        <div>
          <span className="rs-eyebrow">RESTAURANTE · SERVIÇO</span>
          <h1>Sala &amp; cozinha</h1>
          <p>{new Date(now).toLocaleDateString('pt-AO', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        </div>
        <div className="rs-stats">
          <div className="rs-stat"><small>Mesas ocupadas</small><strong>{occupiedTables}<span>/{tables.length}</span></strong></div>
          <div className="rs-stat"><small>Pedidos abertos</small><strong>{orders.length}</strong></div>
          <div className="rs-stat rs-stat--warm"><small>Na cozinha</small><strong>{kitchenQueue.length}</strong></div>
          <div className="rs-stat"><small>Em aberto</small><strong>{money(openTotal)}</strong></div>
        </div>
        <div className="rs-head__actions">
          <button type="button" className="rs-btn rs-btn--ghost" onClick={() => void loadData()} aria-label="Atualizar operação">↻</button>
          <button
            type="button"
            className="rs-btn rs-btn--primary"
            onClick={() => { setQuantities({}); setSheet({ kind: 'new', orderType: 'takeaway', tableId: '' }); }}
          >
            + Takeaway
          </button>
        </div>
      </header>

      <nav className="rs-tabs" aria-label="Áreas do restaurante">
        {([
          ['floor', 'Sala'],
          ['orders', `Pedidos${orders.length ? ` · ${orders.length}` : ''}`],
          ['kitchen', `Cozinha${kitchenQueue.length ? ` · ${kitchenQueue.length}` : ''}`],
          ['menu', 'Menu'],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'rs-tab rs-tab--active' : 'rs-tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <span className="rs-live"><i /> ligado · atualiza a cada 30s</span>
      </nav>

      {error && <div className="rs-alert rs-alert--error" role="alert">{error}</div>}
      {notice && <div className="rs-alert rs-alert--success" role="status">{notice}</div>}

      {loading && !loaded ? (
        <div className="rs-loading"><span className="loading-dot" />A abrir a sala…</div>
      ) : (
        <>
          {tab === 'floor' && (
            <div className="rs-floor">
              {areas.map(([area, areaTables]) => (
                <section className="rs-zone" key={area}>
                  <header className="rs-zone__head">
                    <h2>{area}</h2>
                    <span>{areaTables.filter((table) => table.status === 'free').length} de {areaTables.length} livres</span>
                  </header>
                  <div className="rs-tables">
                    {areaTables.map((table) => {
                      const order = orderByTable.get(table.id);
                      const minutes = order ? elapsedMinutes(order.created_at, now) : 0;
                      return (
                        <button
                          key={table.id}
                          type="button"
                          className={`rs-table rs-table--${order ? 'busy' : table.status}`}
                          onClick={() => openTable(table)}
                        >
                          <span className="rs-table__code">{table.code}</span>
                          <span className="rs-table__seats">{table.seats} lugares</span>
                          {order ? (
                            <>
                              <span className="rs-table__order">#{order.number}</span>
                              <span className="rs-table__amount">{money(order.total_cents)}</span>
                              <span className="rs-table__meta">{minutes} min · {orderStatusLabels[order.status]}</span>
                            </>
                          ) : (
                            <span className="rs-table__state">{tableStatusLabel(table.status)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!tables.length && (
                <div className="rs-empty">
                  <strong>A sala ainda não está configurada</strong>
                  <p>Crie as mesas em “Menu → Configurar sala” para começar a abrir pedidos.</p>
                </div>
              )}

              <details className="rs-config">
                <summary>Configurar sala</summary>
                <form className="rs-form" onSubmit={(event) => void createTable(event)}>
                  <label className="rs-field"><span>Código</span><input name="code" required maxLength={20} placeholder="M12" /></label>
                  <label className="rs-field"><span>Nome</span><input name="name" maxLength={80} placeholder="Opcional" /></label>
                  <label className="rs-field"><span>Área</span><input name="area" maxLength={80} placeholder="Sala, esplanada…" /></label>
                  <label className="rs-field"><span>Lugares</span><input name="seats" type="number" min="1" max="100" defaultValue="2" required /></label>
                  <button className="rs-btn" type="submit" disabled={busy}>Adicionar mesa</button>
                </form>
              </details>
            </div>
          )}

          {tab === 'orders' && (
            <div className="rs-orders">
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="rs-ticket"
                  onClick={() => setSheet({ kind: 'order', orderId: order.id })}
                >
                  <div className="rs-ticket__top">
                    <strong>#{order.number}</strong>
                    <span className={`rs-tag rs-tag--${order.status}`}>{orderStatusLabels[order.status]}</span>
                  </div>
                  <span className="rs-ticket__where">
                    {order.table_code ? `Mesa ${order.table_code}` : 'Takeaway'}
                  </span>
                  <span className="rs-ticket__amount">{money(order.total_cents)}</span>
                  <span className="rs-ticket__meta">
                    {elapsedMinutes(order.created_at, now)} min · pago {money(order.paid_cents)}
                  </span>
                </button>
              ))}
              {!orders.length && (
                <div className="rs-empty">
                  <strong>Nenhum pedido aberto</strong>
                  <p>Clique numa mesa livre ou em “Takeaway” para abrir o primeiro pedido do serviço.</p>
                </div>
              )}
            </div>
          )}

          {tab === 'kitchen' && (
            <>
              <div className="rs-chips">
                <button type="button" className={stationFilter === '' ? 'rs-chip rs-chip--active' : 'rs-chip'} onClick={() => setStationFilter('')}>
                  Todas as praças
                </button>
                {kitchenStations.map((station) => (
                  <button
                    key={station}
                    type="button"
                    className={stationFilter === station ? 'rs-chip rs-chip--active' : 'rs-chip'}
                    onClick={() => setStationFilter(station)}
                  >
                    {stationLabels[station] || station}
                  </button>
                ))}
              </div>
              <div className="rs-kds">
                {(['pending', 'preparing', 'ready'] as const).map((stage) => {
                  const items = kitchen.filter((item) => item.status === stage
                    && (!stationFilter || item.station === stationFilter));
                  return (
                    <section className={`rs-kds__column rs-kds__column--${stage}`} key={stage}>
                      <header>
                        <h2>{stage === 'pending' ? 'A preparar' : stage === 'preparing' ? 'Em preparação' : 'Pronto a servir'}</h2>
                        <span>{items.length}</span>
                      </header>
                      <div className="rs-kds__items">
                        {items.map((item) => (
                          <article className="rs-kds__item" key={item.item_id}>
                            <div className="rs-kds__meta">
                              <strong>#{item.order_number}</strong>
                              <span>{item.table_code ? `Mesa ${item.table_code}` : 'Takeaway'}</span>
                              <span className="rs-kds__clock">{elapsedMinutes(item.created_at, now)} min</span>
                            </div>
                            <p>{item.description} <b>× {item.quantity}</b></p>
                            {item.notes && <small>{item.notes}</small>}
                            <div className="rs-kds__foot">
                              <span>{stationLabels[item.station || 'kitchen'] || item.station} · {item.prep_minutes ?? 0} min</span>
                              {stage === 'pending' && (
                                <button type="button" className="rs-btn rs-btn--small" disabled={busy} onClick={() => void kitchenAction(item, 'start')}>
                                  Iniciar
                                </button>
                              )}
                              {stage === 'preparing' && (
                                <button type="button" className="rs-btn rs-btn--small rs-btn--primary" disabled={busy} onClick={() => void kitchenAction(item, 'ready')}>
                                  Pronto
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                        {!items.length && <p className="rs-kds__empty">Sem itens nesta fase.</p>}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'menu' && (
            <div className="rs-menu">
              <section className="rs-card">
                <div className="rs-card__head">
                  <h2>Carta do restaurante</h2>
                  <span>{menu.filter((item) => item.is_available).length} disponíveis de {menu.length}</span>
                </div>
                {menuByStation.map(([station, items]) => (
                  <div className="rs-menu__group" key={station}>
                    <h3>{stationLabels[station] || station}</h3>
                    {items.map((item) => (
                      <div className={item.is_available ? 'rs-menu__row' : 'rs-menu__row rs-menu__row--off'} key={item.id}>
                        <div className="rs-menu__body">
                          <strong>{item.name}</strong>
                          <small>
                            {item.category_name || item.sku} · {item.prep_minutes} min
                            {item.description ? ` · ${item.description}` : ''}
                          </small>
                        </div>
                        <span className="rs-menu__price">{money(item.unit_price_cents)}</span>
                        <button
                          type="button"
                          className={item.is_available ? 'rs-btn rs-btn--small' : 'rs-btn rs-btn--small rs-btn--primary'}
                          disabled={busy}
                          onClick={() => void toggleAvailability(item)}
                        >
                          {item.is_available ? 'Esgotar' : 'Disponibilizar'}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
                {!menu.length && (
                  <div className="rs-empty"><strong>Sem artigos no menu</strong><p>Associe produtos do catálogo à cozinha, ao bar ou à grelha.</p></div>
                )}

                <form className="rs-form" onSubmit={(event) => void addMenuItem(event)}>
                  <label className="rs-field rs-field--wide">
                    <span>Produto do catálogo</span>
                    <select name="product_id" required defaultValue="">
                      <option value="" disabled>Escolher produto</option>
                      {products
                        .filter((product) => !menu.some((item) => item.product_id === product.id))
                        .map((product) => (
                          <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_cents)}</option>
                        ))}
                    </select>
                  </label>
                  <label className="rs-field">
                    <span>Praça</span>
                    <select name="station" defaultValue="kitchen">
                      {stationOrder.map((station) => <option key={station} value={station}>{stationLabels[station]}</option>)}
                    </select>
                  </label>
                  <label className="rs-field">
                    <span>Preparação (min)</span>
                    <input name="prep_minutes" type="number" min="0" max="240" defaultValue="10" />
                  </label>
                  <button className="rs-btn rs-btn--primary" type="submit" disabled={busy || !products.some((product) => !menu.some((item) => item.product_id === product.id))}>
                    Adicionar ao menu
                  </button>
                </form>
              </section>
            </div>
          )}
        </>
      )}

      {sheet.kind !== 'none' && (
        <div className="rs-sheet-layer">
          <button type="button" className="rs-sheet-backdrop" aria-label="Fechar" onClick={() => setSheet({ kind: 'none' })} />
          <aside className="rs-sheet" role="dialog" aria-modal="true" aria-label={sheet.kind === 'new' ? 'Novo pedido' : 'Pedido'}>
            {sheet.kind === 'new' && (
              <>
                <header className="rs-sheet__head">
                  <div>
                    <span className="rs-eyebrow">{sheet.orderType === 'dine_in' ? 'NOVO PEDIDO' : 'TAKEAWAY'}</span>
                    <h2>{sheet.orderType === 'dine_in' ? tableLabel(sheet.tableId) : 'Para levar'}</h2>
                  </div>
                  <button type="button" className="rs-icon-btn" onClick={() => setSheet({ kind: 'none' })} aria-label="Fechar">×</button>
                </header>

                <div className="rs-sheet__body">
                  {menuByStation.map(([station, items]) => (
                    <div className="rs-menu__group" key={station}>
                      <h3>{stationLabels[station] || station}</h3>
                      {items.filter((item) => item.is_available).map((item) => (
                        <label className="rs-pick" key={item.id}>
                          <span className="rs-pick__body">
                            <strong>{item.name}</strong>
                            <small>{money(item.unit_price_cents)}</small>
                          </span>
                          <span className="rs-stepper">
                            <button
                              type="button"
                              aria-label={`Retirar ${item.name}`}
                              onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] || 0) - 1) }))}
                            >
                              −
                            </button>
                            <b>{quantities[item.id] || 0}</b>
                            <button
                              type="button"
                              aria-label={`Adicionar ${item.name}`}
                              onClick={() => setQuantities((current) => ({ ...current, [item.id]: (current[item.id] || 0) + 1 }))}
                            >
                              +
                            </button>
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                  {!menu.filter((item) => item.is_available).length && (
                    <div className="rs-empty"><strong>Nada disponível</strong><p>Marque artigos como disponíveis no separador Menu.</p></div>
                  )}
                </div>

                <footer className="rs-sheet__foot">
                  <div className="rs-total"><small>Total do pedido</small><strong>{money(newOrderTotal)}</strong></div>
                  <button
                    type="button"
                    className="rs-btn rs-btn--primary rs-btn--block"
                    disabled={busy || !newOrderTotal}
                    onClick={() => void createOrder()}
                  >
                    {busy ? 'A abrir…' : 'Abrir pedido'}
                  </button>
                </footer>
              </>
            )}

            {sheet.kind === 'order' && (
              <>
                <header className="rs-sheet__head">
                  <div>
                    <span className="rs-eyebrow">PEDIDO</span>
                    <h2>{detail ? `#${detail.number} · ${detail.table_code ? `Mesa ${detail.table_code}` : 'Takeaway'}` : 'A carregar…'}</h2>
                  </div>
                  <button type="button" className="rs-icon-btn" onClick={() => setSheet({ kind: 'none' })} aria-label="Fechar">×</button>
                </header>

                {detailLoading || !detail ? (
                  <div className="rs-loading"><span className="loading-dot" />A abrir pedido…</div>
                ) : (
                  <>
                    <div className="rs-sheet__body">
                      <div className="rs-sheet__status">
                        <span className={`rs-tag rs-tag--${detail.status}`}>{orderStatusLabels[detail.status]}</span>
                        <span>{elapsedMinutes(detail.created_at, now)} min em serviço</span>
                      </div>

                      <div className="rs-lines">
                        {detail.items.map((item) => (
                          <div className={`rs-line${item.status === 'cancelled' ? ' rs-line--off' : ''}`} key={item.id}>
                            <span className="rs-line__qty">{item.quantity}×</span>
                            <span className="rs-line__body">
                              <strong>{item.description}</strong>
                              <small>{item.status === 'cancelled' ? 'Cancelado' : orderStatusLabels[item.status] || item.status}</small>
                            </span>
                            <span className="rs-line__amount">{money(item.line_total_cents)}</span>
                          </div>
                        ))}
                        {!detail.items.length && <p className="rs-kds__empty">Pedido sem itens.</p>}
                      </div>

                      {addMode && (
                        <div className="rs-add">
                          <div className="rs-add__head">
                            <h3>Adicionar itens</h3>
                            <button type="button" className="rs-btn rs-btn--small" onClick={() => { setAddMode(false); setAddQuantities({}); }}>Fechar</button>
                          </div>
                          {menuByStation.map(([station, items]) => (
                            <div className="rs-menu__group" key={station}>
                              <h3>{stationLabels[station] || station}</h3>
                              {items.filter((item) => item.is_available).map((item) => (
                                <label className="rs-pick" key={item.id}>
                                  <span className="rs-pick__body"><strong>{item.name}</strong><small>{money(item.unit_price_cents)}</small></span>
                                  <span className="rs-stepper">
                                    <button type="button" aria-label={`Retirar ${item.name}`} onClick={() => setAddQuantities((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] || 0) - 1) }))}>−</button>
                                    <b>{addQuantities[item.id] || 0}</b>
                                    <button type="button" aria-label={`Adicionar ${item.name}`} onClick={() => setAddQuantities((current) => ({ ...current, [item.id]: (current[item.id] || 0) + 1 }))}>+</button>
                                  </span>
                                </label>
                              ))}
                            </div>
                          ))}
                          <button type="button" className="rs-btn rs-btn--primary rs-btn--block" disabled={busy || !addTotal} onClick={() => void addItems()}>
                            Adicionar · {money(addTotal)}
                          </button>
                        </div>
                      )}

                      <div className="rs-totals">
                        <div><span>Subtotal</span><b>{money(detail.total_cents)}</b></div>
                        <div><span>Pago</span><b>{money(detail.paid_cents)}</b></div>
                        <div className="rs-totals__due"><span>Em falta</span><b>{money(balance)}</b></div>
                      </div>

                      {detail.splits.length > 0 && (
                        <div className="rs-splits">
                          <h3>Conta dividida</h3>
                          {detail.splits.map((split) => (
                            <div className={split.paid_cents >= split.amount_cents ? 'rs-split rs-split--paid' : 'rs-split'} key={split.id}>
                              <span>{split.label}</span>
                              <span>{money(split.amount_cents - split.paid_cents)} em falta</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {detail.payments.length > 0 && (
                        <div className="rs-payments">
                          <h3>Pagamentos</h3>
                          {detail.payments.map((payment) => (
                            <div key={payment.id}>
                              <span>{paymentMethods.find(([value]) => value === payment.method)?.[1] || payment.method}</span>
                              <b>{money(payment.amount_cents)}</b>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="rs-actions">
                        {detail.status === 'open' && (
                          <button type="button" className="rs-btn" disabled={busy} onClick={() => void action(`/restaurant/orders/${detail.id}/send-to-kitchen`, 'Pedido enviado para a cozinha.')}>
                            Enviar para a cozinha
                          </button>
                        )}
                        {detail.status === 'ready' && (
                          <button type="button" className="rs-btn" disabled={busy} onClick={() => void action(`/restaurant/orders/${detail.id}/serve`, 'Pedido servido.')}>
                            Marcar servido
                          </button>
                        )}
                        {canAddItems && !addMode && (
                          <button type="button" className="rs-btn" disabled={busy} onClick={() => setAddMode(true)}>
                            Adicionar itens
                          </button>
                        )}
                        {detail.paid_cents === 0 && detail.splits.length === 0 && (
                          <div className="rs-split-builder">
                            <label className="rs-field">
                              <span>Dividir por</span>
                              <input type="number" min="2" max="20" value={splitCount} onChange={(event) => setSplitCount(Number(event.target.value))} />
                            </label>
                            <button type="button" className="rs-btn" disabled={busy || detail.total_cents < splitCount} onClick={() => void createSplits()}>
                              Dividir conta
                            </button>
                          </div>
                        )}
                        {detail.splits.length > 0 && (
                          <label className="rs-field">
                            <span>Convidado a cobrar</span>
                            <select value={selectedSplitId} onChange={(event) => setSelectedSplitId(event.target.value)}>
                              {detail.splits.map((split) => (
                                <option key={split.id} value={split.id} disabled={split.paid_cents >= split.amount_cents}>
                                  {split.label} · falta {money(split.amount_cents - split.paid_cents)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {['open', 'in_kitchen', 'ready', 'served'].includes(detail.status) && detail.paid_cents === 0 && (
                          <button type="button" className="rs-btn rs-btn--danger" disabled={busy} onClick={() => void cancelOrder()}>
                            Cancelar pedido
                          </button>
                        )}
                      </div>
                    </div>

                    <footer className="rs-sheet__foot">
                      <div className="rs-pay">
                        <select aria-label="Meio de pagamento" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                          {paymentMethods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                        </select>
                        <span className="rs-total"><small>A cobrar</small><strong>{money(dueNow)}</strong></span>
                      </div>
                      <button
                        type="button"
                        className="rs-btn rs-btn--primary rs-btn--block"
                        disabled={busy || dueNow <= 0 || detail.status !== 'served'}
                        onClick={() => void chargeAndClose()}
                      >
                        {busy ? 'A registar…' : 'Cobrar e fechar'}
                      </button>
                      {detail.status !== 'served' && (
                        <small className="rs-hint">Marque o pedido como servido antes de cobrar.</small>
                      )}
                    </footer>
                  </>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
