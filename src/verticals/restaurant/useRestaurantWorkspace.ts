import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import { getErrorMessage, listPage, money } from '../../components/operations/shared';
import {
  stationOrder,
  tableStatusLabel,
  type KitchenItem,
  type MenuItem,
  type Order,
  type OrderDetail,
  type Product,
  type Sheet,
  type Tab,
  type Table,
} from './types';

export function useRestaurantWorkspace(
  companyId: string,
  tab: Tab,
  onSelectTab: (tab: Tab) => void,
) {
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
  const [floorError, setFloorError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [floorUpdatedAt, setFloorUpdatedAt] = useState(() => Date.now());
  const [movingTableId, setMovingTableId] = useState('');
  const floorRefreshInFlight = useRef(false);

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
      const loadedAt = Date.now();
      setNow(loadedAt);
      setFloorUpdatedAt(loadedAt);
      setFloorError('');
      setLoaded(true);
      if (!silent) setError('');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar a operação do restaurante.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const refreshFloor = useCallback(async () => {
    if (tab !== 'floor' || movingTableId || floorRefreshInFlight.current) return;
    floorRefreshInFlight.current = true;
    try {
      const [tableRows, orderPage] = await Promise.all([
        request<Table[]>('/restaurant/tables', { companyId }),
        request<Page<Order>>('/restaurant/orders?page=1&per_page=100', { companyId }),
      ]);
      setTables(tableRows.filter((table) => table.status !== 'inactive'));
      setOrders(orderPage.items.filter((order) => order.status !== 'closed' && order.status !== 'cancelled'));
      const updatedAt = Date.now();
      setNow(updatedAt);
      setFloorUpdatedAt(updatedAt);
      setFloorError('');
    } catch (reason) {
      setFloorError(getErrorMessage(reason, 'Não foi possível atualizar a ocupação da sala.'));
    } finally {
      floorRefreshInFlight.current = false;
    }
  }, [companyId, movingTableId, tab]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void refreshFloor();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshFloor]);

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
      onSelectTab('floor');
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
    const area = String(data.get('area') || '').trim() || null;
    setBusy(true);
    setError('');
    try {
      await request('/restaurant/tables', {
        method: 'POST',
        companyId,
        body: {
          code: String(data.get('code') || '').trim(),
          name: String(data.get('name') || '').trim() || null,
          area,
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

  async function moveTable(table: Table, position: { position_x: number; position_y: number }) {
    if (movingTableId) return;
    const originalPosition = { position_x: table.position_x, position_y: table.position_y };
    setMovingTableId(table.id);
    setError('');
    setTables((current) => current.map((item) => item.id === table.id ? { ...item, ...position } : item));
    try {
      const updated = await request<Table>(`/restaurant/tables/${table.id}`, {
        method: 'PUT',
        companyId,
        body: {
          code: table.code,
          name: table.name,
          area: table.area,
          seats: table.seats,
          status: null,
          ...position,
        },
      });
      setTables((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`Mesa ${updated.code} reposicionada.`);
    } catch (reason) {
      setTables((current) => current.map((item) => item.id === table.id
        ? { ...item, ...originalPosition }
        : item));
      setError(getErrorMessage(reason, 'Não foi possível guardar a posição da mesa.'));
    } finally {
      setMovingTableId('');
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


  return {
    tab, tables, menu, orders, kitchen, products, sheet, setSheet,
    detail, detailLoading, quantities, setQuantities, addQuantities, setAddQuantities,
    addMode, setAddMode, splitCount, setSplitCount, selectedSplitId, setSelectedSplitId,
    paymentMethod, setPaymentMethod, stationFilter, setStationFilter, loading, loaded,
    busy, error, floorError, notice, now, floorUpdatedAt, movingTableId, loadData, menuByStation, areas, orderByTable,
    occupiedTables, kitchenQueue, openTotal, kitchenStations, openTable,
    createTable, moveTable, kitchenAction, addMenuItem, toggleAvailability, newOrderTotal,
    addTotal, tableLabel, balance, dueNow, canAddItems, action, createOrder,
    addItems, createSplits, chargeAndClose, cancelOrder,
  };
}
