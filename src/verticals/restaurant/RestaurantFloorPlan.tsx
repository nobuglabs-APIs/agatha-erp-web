import { useId, useRef, useState, type PointerEvent } from 'react';
import { money } from '../../components/operations/shared';
import { elapsedMinutes, tableStatusLabel, type Order, type Table } from './types';

type Area = [string, Table[]];
type FloorPosition = Pick<Table, 'position_x' | 'position_y'>;

export function RestaurantFloorPlan({
  areas,
  orderByTable,
  now,
  updatedAt,
  movingTableId,
  onOpenTable,
  onMoveTable,
}: {
  areas: Area[];
  orderByTable: Map<string, Order>;
  now: number;
  updatedAt: number;
  movingTableId: string;
  onOpenTable: (table: Table) => void;
  onMoveTable: (table: Table, position: FloorPosition) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [previewPositions, setPreviewPositions] = useState<Record<string, FloorPosition>>({});
  const drag = useRef<{ table: Table; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const defsId = useId().replace(/:/g, '');

  function getPoint(event: PointerEvent<SVGSVGElement>, height: number) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return { x: 0, y: 0 };
    return {
      x: (event.clientX - bounds.left) * 1200 / bounds.width,
      y: (event.clientY - bounds.top) * height / bounds.height,
    };
  }

  function startDrag(event: PointerEvent<SVGGElement>, table: Table) {
    if (!editing || movingTableId) return;
    event.preventDefault();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    const bounds = svg.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left) * 1200 / bounds.width,
      y: (event.clientY - bounds.top) * Number(svg.viewBox.baseVal.height) / bounds.height,
    };
    drag.current = {
      table,
      offsetX: table.position_x - point.x,
      offsetY: table.position_y - point.y,
      moved: false,
    };
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>, height: number) {
    const currentDrag = drag.current;
    if (!currentDrag) return;
    const point = getPoint(event, height);
    const position = {
      position_x: Math.round(Math.max(80, Math.min(1120, point.x + currentDrag.offsetX))),
      position_y: Math.round(Math.max(110, Math.min(5000, point.y + currentDrag.offsetY))),
    };
    if (Math.abs(position.position_x - currentDrag.table.position_x) > 2
      || Math.abs(position.position_y - currentDrag.table.position_y) > 2) {
      currentDrag.moved = true;
    }
    setPreviewPositions((current) => ({ ...current, [currentDrag.table.id]: position }));
  }

  function finishDrag(event: PointerEvent<SVGSVGElement>, height: number) {
    const currentDrag = drag.current;
    if (!currentDrag) return;
    const point = getPoint(event, height);
    const position = {
      position_x: Math.round(Math.max(80, Math.min(1120, point.x + currentDrag.offsetX))),
      position_y: Math.round(Math.max(110, Math.min(5000, point.y + currentDrag.offsetY))),
    };
    drag.current = null;
    setPreviewPositions((current) => {
      const { [currentDrag.table.id]: _removed, ...remaining } = current;
      return remaining;
    });
    if (!currentDrag.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    void onMoveTable(currentDrag.table, position);
  }

  function cancelDrag() {
    const tableId = drag.current?.table.id;
    drag.current = null;
    if (tableId) {
      setPreviewPositions((current) => {
        const { [tableId]: _removed, ...remaining } = current;
        return remaining;
      });
    }
  }

  function moveWithKeyboard(table: Table, key: string) {
    const step = 20;
    const deltas: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = deltas[key];
    if (!delta) return false;
    void onMoveTable(table, {
      position_x: Math.max(80, Math.min(1120, table.position_x + delta.x)),
      position_y: Math.max(110, Math.min(5000, table.position_y + delta.y)),
    });
    return true;
  }

  return (
    <div className="rs-floor">
      <div className="rs-floor__toolbar">
        <div className="rs-floor__legend" aria-label="Estados das mesas">
          <span><i className="rs-floor__dot rs-floor__dot--free" />Livre</span>
          <span><i className="rs-floor__dot rs-floor__dot--busy" />Ocupada</span>
          <span><i className="rs-floor__dot rs-floor__dot--reserved" />Reservada</span>
        </div>
        <div className="rs-floor__controls">
          <span className="rs-live"><i />Atualiza automaticamente · {new Date(updatedAt).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <button
            type="button"
            className={editing ? 'rs-btn rs-btn--primary' : 'rs-btn rs-btn--ghost'}
            aria-pressed={editing}
            onClick={() => { setEditing((current) => !current); setPreviewPositions({}); drag.current = null; }}
          >
            {editing ? 'Concluir planta' : 'Organizar sala'}
          </button>
        </div>
      </div>

      {!areas.length && (
        <div className="rs-empty">
          <strong>A sala ainda está vazia</strong>
          <p>Adicione mesas e lugares em “Configurar sala”. Depois, organize-as na planta.</p>
        </div>
      )}

      {areas.map(([area, tables], areaIndex) => {
        const height = Math.max(600, ...tables.map((table) => table.position_y + 100));
        const areaDefsId = `${defsId}-${areaIndex}`;
        const freeCount = tables.filter((table) => table.status === 'free').length;
        return (
          <section className="rs-zone" key={area}>
            <header className="rs-zone__head">
              <div><small>PLANTA DA SALA</small><h2>{area}</h2></div>
              <span>{freeCount} livres <b>·</b> {tables.length} mesas</span>
            </header>
            <div className={editing ? 'rs-floor__canvas rs-floor__canvas--editing' : 'rs-floor__canvas'}>
              <svg
                className="rs-floor__svg"
                viewBox={`0 0 1200 ${height}`}
                preserveAspectRatio="none"
                role="group"
                aria-label={`Planta da área ${area}`}
                onPointerMove={(event) => moveDrag(event, height)}
                onPointerUp={(event) => finishDrag(event, height)}
                onPointerCancel={cancelDrag}
              >
                <defs>
                  <pattern id={`${areaDefsId}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,.035)" strokeWidth="1" />
                  </pattern>
                  <filter id={`${areaDefsId}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#000" floodOpacity=".24" />
                  </filter>
                </defs>
                <rect x="0" y="0" width="1200" height={height} rx="24" fill={`url(#${areaDefsId}-grid)`} />
                <rect x="20" y="20" width="1160" height={height - 40} rx="22" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="2" />
                <g aria-hidden="true" className="rs-floor__landmark">
                  <rect x="42" y="42" width="160" height="46" rx="12" />
                  <text x="122" y="70" textAnchor="middle">ENTRADA</text>
                  <rect x="998" y="42" width="160" height="46" rx="12" />
                  <text x="1078" y="70" textAnchor="middle">SERVIÇO</text>
                </g>
                {tables.map((table) => {
                  const position = previewPositions[table.id] || { position_x: table.position_x, position_y: table.position_y };
                  const order = orderByTable.get(table.id);
                  const status = order ? 'occupied' : table.status;
                  const chairCount = Math.min(Math.max(table.seats, 2), 12);
                  const radiusX = table.seats <= 4 ? 47 : 58;
                  const radiusY = table.seats <= 4 ? 47 : 46;
                  const tableClass = status === 'occupied' ? 'rs-floor-table--busy' : `rs-floor-table--${status}`;
                  const label = `Mesa ${table.code}, ${tableStatusLabel(status)}, ${table.seats} lugares${order ? `, pedido ${order.number}, ${money(order.total_cents - order.paid_cents)} em aberto` : ''}`;
                  return (
                    <g
                      key={table.id}
                      className={`rs-floor-table ${tableClass}${movingTableId === table.id ? ' rs-floor-table--saving' : ''}`}
                      transform={`translate(${position.position_x} ${position.position_y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={editing ? `${label}. Arraste para reposicionar ou use as setas.` : `${label}. Ativar para abrir mesa.`}
                      onPointerDown={(event) => startDrag(event, table)}
                      onClick={() => {
                        if (!editing && !suppressClick.current) onOpenTable(table);
                      }}
                      onKeyDown={(event) => {
                        if (editing && moveWithKeyboard(table, event.key)) {
                          event.preventDefault();
                        } else if (!editing && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          onOpenTable(table);
                        }
                      }}
                    >
                      <title>{label}</title>
                      {Array.from({ length: chairCount }, (_, index) => {
                        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / chairCount;
                        const chairX = Math.cos(angle) * radiusX;
                        const chairY = Math.sin(angle) * radiusY;
                        const rotation = (angle * 180) / Math.PI + 90;
                        return (
                          <rect
                            key={index}
                            className="rs-floor-table__chair"
                            x={chairX - 10}
                            y={chairY - 6}
                            width="20"
                            height="12"
                            rx="5"
                            transform={`rotate(${rotation} ${chairX} ${chairY})`}
                          />
                        );
                      })}
                      <ellipse className="rs-floor-table__surface" cx="0" cy="0" rx={table.seats <= 4 ? 35 : 44} ry={table.seats <= 4 ? 35 : 29} filter={`url(#${areaDefsId}-shadow)`} />
                      <text className="rs-floor-table__code" x="0" y="-3" textAnchor="middle">{table.code}</text>
                      <text className="rs-floor-table__seats" x="0" y="16" textAnchor="middle">{table.seats} lugares</text>
                      {order && (
                        <g className="rs-floor-table__order">
                          <rect x="-35" y="42" width="70" height="25" rx="12" />
                          <text x="0" y="59" textAnchor="middle">#{order.number} · {elapsedMinutes(order.created_at, now)} min</text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>
        );
      })}
      <p className="rs-floor__hint" role="status">
        {editing ? 'Arraste as mesas para ajustar a planta. As posições são guardadas automaticamente.' : 'Toque numa mesa para abrir ou acompanhar o pedido.'}
      </p>
    </div>
  );
}
