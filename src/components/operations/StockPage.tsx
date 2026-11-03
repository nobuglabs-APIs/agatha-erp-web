import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Product, StockMovement } from './shared';
import { dateTime, getErrorMessage, listPage } from './shared';

const movementNames: Record<string, string> = {
  sale: 'Venda',
  sale_cancel: 'Anulação de venda',
  adjustment: 'Ajuste manual',
  purchase: 'Entrada de compra',
  initial: 'Stock inicial',
  document_sale: 'Fatura emitida',
  credit_note: 'Nota de crédito',
};

export function StockPage({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const trackedProducts = products.filter((product) => product.track_stock);
  const lowStock = trackedProducts.filter((product) => product.stock_quantity <= product.min_stock);

  const loadStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productsResult, movementResult] = await Promise.all([
        listPage<Product>('/products', companyId, 100),
        listPage<StockMovement>('/stock/movements', companyId, 50),
      ]);
      setProducts(productsResult.items);
      setMovements(movementResult.items);
      if (!selectedProductId && productsResult.items.length) setSelectedProductId(productsResult.items[0].id);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar o stock.'));
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedProductId]);

  useEffect(() => { void loadStock(); }, [loadStock]);

  async function adjustStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const magnitude = Math.round(Number(form.get('quantity') || 0));
    const direction = String(form.get('direction') || 'add');
    const quantity = direction === 'remove' ? -magnitude : magnitude;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<StockMovement>('/stock/adjustments', {
        method: 'POST',
        companyId,
        body: {
          product_id: String(form.get('product_id')),
          delta: quantity,
          reason: direction === 'remove' ? 'adjustment' : String(form.get('reason') || 'adjustment'),
          note: String(form.get('note') || '').trim() || null,
        },
      });
      setNotice('Movimento de stock registado.');
      setShowForm(false);
      await loadStock();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível ajustar o stock.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">INVENTÁRIO</span><h1>Stock</h1><p>Acompanhe as quantidades e registe entradas ou ajustes.</p></div>
        <button className="button button--primary" type="button" onClick={() => setShowForm((value) => !value)}><span>＋</span> Ajustar stock</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      <section className="ops-metric-grid ops-metric-grid--three">
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon ops-metric__icon--green">▤</span><small>CONTROLO DE STOCK</small></span><strong>{trackedProducts.length}</strong><span className="ops-metric__label">Artigos controlados</span></article>
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon ops-metric__icon--amber">!</span><small>ATENÇÃO</small></span><strong>{lowStock.length}</strong><span className="ops-metric__label">No mínimo ou abaixo</span></article>
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon ops-metric__icon--blue">↕</span><small>MOVIMENTOS</small></span><strong>{movements.length}</strong><span className="ops-metric__label">Registos recentes</span></article>
      </section>
      {showForm && (
        <section className="ops-card ops-form-card">
          <div className="ops-card-heading"><div><h2>Registar movimento</h2><p>As saídas não podem deixar o stock negativo.</p></div><button type="button" className="ops-close" aria-label="Fechar" onClick={() => setShowForm(false)}>×</button></div>
          <form className="ops-form-grid" onSubmit={(event) => void adjustStock(event)}>
            <label className="ops-field"><span>Produto</span><select name="product_id" required value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>{trackedProducts.map((product) => <option value={product.id} key={product.id}>{product.name} · {product.stock_quantity} un.</option>)}</select></label>
            <label className="ops-field"><span>Movimento</span><select name="direction"><option value="add">Entrada de stock</option><option value="remove">Saída / correção</option></select></label>
            <label className="ops-field"><span>Quantidade</span><input name="quantity" type="number" required min="1" step="1" /></label>
            <label className="ops-field"><span>Motivo</span><select name="reason"><option value="adjustment">Ajuste de inventário</option><option value="purchase">Entrada de compra</option></select></label>
            <label className="ops-field ops-field--wide"><span>Nota</span><input name="note" maxLength={500} placeholder="Opcional: motivo ou referência" /></label>
            <div className="ops-form-actions"><button type="button" className="button button--secondary" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy || trackedProducts.length === 0}>{busy ? 'A registar…' : 'Registar movimento'}</button></div>
            {!trackedProducts.length && <p className="ops-form-help">Adicione primeiro um produto com controlo de stock.</p>}
          </form>
        </section>
      )}
      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Posição de stock</h2><p>Quantidade disponível por produto</p></div><button type="button" className="ops-icon-button" aria-label="Atualizar" onClick={() => void loadStock()}>↻</button></div>
        {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar stock…</div> : (
          <div className="ops-table-wrap">
            <table className="ops-table"><thead><tr><th>Produto</th><th>Referência</th><th>Disponível</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>
              {trackedProducts.map((product) => {
                const low = product.stock_quantity <= product.min_stock;
                return <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.sku}</td><td><strong>{product.stock_quantity} un.</strong></td><td>{product.min_stock} un.</td><td><span className={low ? 'ops-stock-value ops-stock-value--low' : 'ops-table-status'}>{low ? 'Repor stock' : 'Disponível'}</span></td></tr>;
              })}
              {!trackedProducts.length && <tr><td className="ops-table-empty" colSpan={5}>Ainda não há produtos com controlo de stock.</td></tr>}
            </tbody></table>
          </div>
        )}
      </section>
      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Movimentos recentes</h2><p>Entradas e saídas registadas no inventário</p></div></div>
        {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar movimentos…</div> : (
          <div className="ops-table-wrap">
            <table className="ops-table"><thead><tr><th>Produto</th><th>Movimento</th><th>Variação</th><th>Nota</th><th>Data</th></tr></thead><tbody>
              {movements.map((movement) => {
                const product = productsById.get(movement.product_id);
                return <tr key={movement.id}><td><strong>{product?.name || 'Produto'}</strong></td><td>{movementNames[movement.reason] || movement.reason}</td><td><strong className={movement.delta > 0 ? 'ops-delta-positive' : 'ops-delta-negative'}>{movement.delta > 0 ? '+' : ''}{movement.delta}</strong></td><td>{movement.note || '—'}</td><td>{dateTime(movement.created_at)}</td></tr>;
              })}
              {!movements.length && <tr><td className="ops-table-empty" colSpan={5}>Os movimentos de stock aparecerão aqui.</td></tr>}
            </tbody></table>
          </div>
        )}
      </section>
    </div>
  );
}
