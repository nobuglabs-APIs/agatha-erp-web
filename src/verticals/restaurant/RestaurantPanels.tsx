import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { money } from '../../components/operations/shared';
import {
  elapsedMinutes,
  orderStatusLabels,
  stationLabels,
  stationOrder,
  tableStatusLabel,
  type KitchenItem,
  type MenuItem,
  type Order,
  type Product,
  type Tab,
  type Table,
} from './types';

interface RestaurantPanelsProps {
  tab: Tab;
  areas: [string, Table[]][];
  tables: Table[];
  orderByTable: Map<string, Order>;
  now: number;
  orders: Order[];
  kitchen: KitchenItem[];
  kitchenStations: string[];
  stationFilter: string;
  setStationFilter: Dispatch<SetStateAction<string>>;
  menu: MenuItem[];
  menuByStation: [string, MenuItem[]][];
  products: Product[];
  busy: boolean;
  onOpenTable: (table: Table) => void;
  onOpenOrder: (orderId: string) => void;
  onCreateTable: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onKitchenAction: (item: KitchenItem, action: 'start' | 'ready') => void | Promise<void>;
  onToggleAvailability: (item: MenuItem) => void | Promise<void>;
  onAddMenuItem: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export function RestaurantPanels({
  tab,
  areas,
  tables,
  orderByTable,
  now,
  orders,
  kitchen,
  kitchenStations,
  stationFilter,
  setStationFilter,
  menu,
  menuByStation,
  products,
  busy,
  onOpenTable,
  onOpenOrder,
  onCreateTable,
  onKitchenAction,
  onToggleAvailability,
  onAddMenuItem,
}: RestaurantPanelsProps) {
  return (
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
                      onClick={() => onOpenTable(table)}
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
            <form className="rs-form" onSubmit={(event) => void onCreateTable(event)}>
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
              onClick={() => onOpenOrder(order.id)}
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
                            <button type="button" className="rs-btn rs-btn--small" disabled={busy} onClick={() => void onKitchenAction(item, 'start')}>
                              Iniciar
                            </button>
                          )}
                          {stage === 'preparing' && (
                            <button type="button" className="rs-btn rs-btn--small rs-btn--primary" disabled={busy} onClick={() => void onKitchenAction(item, 'ready')}>
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
                      onClick={() => void onToggleAvailability(item)}
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

            <form className="rs-form" onSubmit={(event) => void onAddMenuItem(event)}>
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
  );
}
