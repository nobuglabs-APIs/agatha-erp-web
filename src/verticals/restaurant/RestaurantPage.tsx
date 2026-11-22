import type { Tab } from './types';
import { money } from '../../components/operations/shared';
import { RestaurantPanels } from './RestaurantPanels';
import { RestaurantOrderSheet } from './RestaurantOrderSheet';
import { useRestaurantWorkspace } from './useRestaurantWorkspace';

export function RestaurantPage({ companyId }: { companyId: string }) {
  const {
    tab, setTab, tables, menu, orders, kitchen, products, sheet, setSheet,
    detail, detailLoading, quantities, setQuantities, addQuantities, setAddQuantities,
    addMode, setAddMode, splitCount, setSplitCount, selectedSplitId, setSelectedSplitId,
    paymentMethod, setPaymentMethod, stationFilter, setStationFilter, loading, loaded,
    busy, error, notice, now, loadData, menuByStation, areas, orderByTable,
    occupiedTables, kitchenQueue, openTotal, kitchenStations, openTable,
    createTable, kitchenAction, addMenuItem, toggleAvailability, newOrderTotal,
    addTotal, tableLabel, balance, dueNow, canAddItems, action, createOrder,
    addItems, createSplits, chargeAndClose, cancelOrder,
  } = useRestaurantWorkspace(companyId);
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
          <RestaurantPanels
            tab={tab}
            areas={areas}
            tables={tables}
            orderByTable={orderByTable}
            now={now}
            orders={orders}
            kitchen={kitchen}
            kitchenStations={kitchenStations}
            stationFilter={stationFilter}
            setStationFilter={setStationFilter}
            menu={menu}
            menuByStation={menuByStation}
            products={products}
            busy={busy}
            onOpenTable={openTable}
            onOpenOrder={(orderId) => setSheet({ kind: 'order', orderId })}
            onCreateTable={createTable}
            onKitchenAction={kitchenAction}
            onToggleAvailability={toggleAvailability}
            onAddMenuItem={addMenuItem}
          />
        </>
      )}

      {sheet.kind !== 'none' && (
        <RestaurantOrderSheet
          sheet={sheet}
          onClose={() => setSheet({ kind: 'none' })}
          tableLabel={tableLabel}
          menu={menu}
          menuByStation={menuByStation}
          quantities={quantities}
          setQuantities={setQuantities}
          newOrderTotal={newOrderTotal}
          onCreateOrder={createOrder}
          busy={busy}
          detail={detail}
          detailLoading={detailLoading}
          now={now}
          addMode={addMode}
          setAddMode={setAddMode}
          addQuantities={addQuantities}
          setAddQuantities={setAddQuantities}
          addTotal={addTotal}
          onAddItems={addItems}
          balance={balance}
          onAction={action}
          canAddItems={canAddItems}
          splitCount={splitCount}
          setSplitCount={setSplitCount}
          onCreateSplits={createSplits}
          selectedSplitId={selectedSplitId}
          setSelectedSplitId={setSelectedSplitId}
          onCancelOrder={cancelOrder}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          dueNow={dueNow}
          onChargeAndClose={chargeAndClose}
        />
      )}
    </div>
  );
}
