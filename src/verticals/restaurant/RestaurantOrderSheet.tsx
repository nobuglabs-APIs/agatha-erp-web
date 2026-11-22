import type { Dispatch, SetStateAction } from 'react';
import { money } from '../../components/operations/shared';
import {
  elapsedMinutes,
  orderStatusLabels,
  paymentMethods,
  stationLabels,
  type MenuItem,
  type OrderDetail,
  type Sheet,
} from './types';

type ActiveSheet = Exclude<Sheet, { kind: 'none' }>;

interface RestaurantOrderSheetProps {
  sheet: ActiveSheet;
  onClose: () => void;
  tableLabel: (tableId: string) => string;
  menu: MenuItem[];
  menuByStation: [string, MenuItem[]][];
  quantities: Record<string, number>;
  setQuantities: Dispatch<SetStateAction<Record<string, number>>>;
  newOrderTotal: number;
  onCreateOrder: () => void | Promise<void>;
  busy: boolean;
  detail: OrderDetail | null;
  detailLoading: boolean;
  now: number;
  addMode: boolean;
  setAddMode: Dispatch<SetStateAction<boolean>>;
  addQuantities: Record<string, number>;
  setAddQuantities: Dispatch<SetStateAction<Record<string, number>>>;
  addTotal: number;
  onAddItems: () => void | Promise<void>;
  balance: number;
  onAction: (path: string, success: string, body?: unknown) => void | Promise<void>;
  canAddItems: boolean;
  splitCount: number;
  setSplitCount: Dispatch<SetStateAction<number>>;
  onCreateSplits: () => void | Promise<void>;
  selectedSplitId: string;
  setSelectedSplitId: Dispatch<SetStateAction<string>>;
  onCancelOrder: () => void | Promise<void>;
  paymentMethod: string;
  setPaymentMethod: Dispatch<SetStateAction<string>>;
  dueNow: number;
  onChargeAndClose: () => void | Promise<void>;
}

export function RestaurantOrderSheet({
  sheet,
  onClose,
  tableLabel,
  menu,
  menuByStation,
  quantities,
  setQuantities,
  newOrderTotal,
  onCreateOrder,
  busy,
  detail,
  detailLoading,
  now,
  addMode,
  setAddMode,
  addQuantities,
  setAddQuantities,
  addTotal,
  onAddItems,
  balance,
  onAction,
  canAddItems,
  splitCount,
  setSplitCount,
  onCreateSplits,
  selectedSplitId,
  setSelectedSplitId,
  onCancelOrder,
  paymentMethod,
  setPaymentMethod,
  dueNow,
  onChargeAndClose,
}: RestaurantOrderSheetProps) {
  return (
    <div className="rs-sheet-layer">
      <button type="button" className="rs-sheet-backdrop" aria-label="Fechar" onClick={onClose} />
      <aside className="rs-sheet" role="dialog" aria-modal="true" aria-label={sheet.kind === 'new' ? 'Novo pedido' : 'Pedido'}>
        {sheet.kind === 'new' && (
          <>
            <header className="rs-sheet__head">
              <div>
                <span className="rs-eyebrow">{sheet.orderType === 'dine_in' ? 'NOVO PEDIDO' : 'TAKEAWAY'}</span>
                <h2>{sheet.orderType === 'dine_in' ? tableLabel(sheet.tableId) : 'Para levar'}</h2>
              </div>
              <button type="button" className="rs-icon-btn" onClick={onClose} aria-label="Fechar">×</button>
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
              {!menu.some((item) => item.is_available) && (
                <div className="rs-empty"><strong>Nada disponível</strong><p>Marque artigos como disponíveis no separador Menu.</p></div>
              )}
            </div>

            <footer className="rs-sheet__foot">
              <div className="rs-total"><small>Total do pedido</small><strong>{money(newOrderTotal)}</strong></div>
              <button
                type="button"
                className="rs-btn rs-btn--primary rs-btn--block"
                disabled={busy || !newOrderTotal}
                onClick={() => void onCreateOrder()}
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
              <button type="button" className="rs-icon-btn" onClick={onClose} aria-label="Fechar">×</button>
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
                      <button type="button" className="rs-btn rs-btn--primary rs-btn--block" disabled={busy || !addTotal} onClick={() => void onAddItems()}>
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
                      <button type="button" className="rs-btn" disabled={busy} onClick={() => void onAction(`/restaurant/orders/${detail.id}/send-to-kitchen`, 'Pedido enviado para a cozinha.')}>
                        Enviar para a cozinha
                      </button>
                    )}
                    {detail.status === 'ready' && (
                      <button type="button" className="rs-btn" disabled={busy} onClick={() => void onAction(`/restaurant/orders/${detail.id}/serve`, 'Pedido servido.')}>
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
                        <button type="button" className="rs-btn" disabled={busy || detail.total_cents < splitCount} onClick={() => void onCreateSplits()}>
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
                      <button type="button" className="rs-btn rs-btn--danger" disabled={busy} onClick={() => void onCancelOrder()}>
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
                    onClick={() => void onChargeAndClose()}
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
  );
}
