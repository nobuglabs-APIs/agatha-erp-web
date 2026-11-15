import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { mediaUrl, request, upload } from '../../api/client';
import { Icon } from '../Icon';
import type { Product } from './shared';
import { getErrorMessage, listPage, money, productPayload } from './shared';

function inputAmount(cents: number): string {
  return (cents / 100).toString();
}

export function ProductsPage({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadProducts = useCallback(async (search = query) => {
    setLoading(true);
    setError('');
    try {
      const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      const result = await listPage<Product>(`/products${suffix}`, companyId);
      setProducts(result.items);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar os produtos.'));
    } finally {
      setLoading(false);
    }
  }, [companyId, query]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  function openCreate() {
    setEditing(null);
    setError('');
    setNotice('');
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setError('');
    setNotice('');
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = productPayload(form);
      const product = editing
        ? await request<Product>(`/products/${editing.id}`, { method: 'PUT', body: payload, companyId })
        : await request<Product>('/products', { method: 'POST', body: payload, companyId });
      const image = form.get('image');
      if (image instanceof File && image.size > 0) {
        await upload(`/products/${product.id}/image`, image, companyId);
      }
      setNotice(editing ? 'Produto atualizado.' : 'Produto adicionado ao catálogo.');
      closeForm();
      setQuery('');
      await loadProducts('');
    } catch (reason) {
      setError(getErrorMessage(reason, editing ? 'Não foi possível atualizar o produto.' : 'Não foi possível criar o produto.'));
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(product: Product) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<void>(`/products/${product.id}/image`, { method: 'DELETE', companyId });
      setNotice('Imagem removida.');
      setEditing((current) => (current && current.id === product.id ? { ...current, image_url: null } : current));
      setDetail((current) => (current && current.id === product.id ? { ...current, image_url: null } : current));
      await loadProducts('');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível remover a imagem.'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product: Product) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<void>(`/products/${product.id}`, { method: 'DELETE', companyId });
      setNotice('Produto apagado do catálogo.');
      setConfirmDelete(null);
      await loadProducts('');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível apagar o produto.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">CATÁLOGO DA EMPRESA</span><h1>Produtos</h1><p>Organize artigos e serviços, preços e níveis de stock.</p></div>
        <button className="button button--primary" type="button" onClick={openCreate}><span>＋</span> Adicionar produto</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {formOpen && (
        <section className="ops-card ops-form-card">
          <div className="ops-card-heading"><div><h2>{editing ? 'Editar produto' : 'Novo produto ou serviço'}</h2><p>{editing ? 'Atualize os dados do artigo. O stock só se altera por movimentos de stock.' : 'O preço e o stock são guardados no catálogo da empresa.'}</p></div><button type="button" className="ops-close" aria-label="Fechar" onClick={closeForm}>×</button></div>
          <form key={editing?.id || 'new'} className="ops-form-grid" onSubmit={(event) => void submitProduct(event)}>
            <label className="ops-field"><span>Nome do produto</span><input name="name" required maxLength={200} defaultValue={editing?.name || ''} placeholder="Ex.: Água mineral 1,5 L" /></label>
            <label className="ops-field"><span>Referência / SKU</span><input name="sku" required maxLength={64} defaultValue={editing?.sku || ''} placeholder="Ex.: AGUA-001" /></label>
            <label className="ops-field"><span>Tipo</span><select name="product_type" defaultValue={editing?.product_type || 'goods'}><option value="goods">Produto com stock</option><option value="service">Serviço</option></select></label>
            <label className="ops-field"><span>Preço de venda (Kz)</span><input name="price" type="number" min="0" step="0.01" required defaultValue={editing ? inputAmount(editing.unit_price_cents) : ''} placeholder="0,00" /></label>
            <label className="ops-field"><span>Custo (Kz)</span><input name="cost" type="number" min="0" step="0.01" defaultValue={editing ? inputAmount(editing.cost_price_cents) : '0'} /></label>
            <label className="ops-field"><span>Imposto (%)</span><input name="tax" type="number" min="0" max="100" step="0.01" defaultValue={editing ? inputAmount(editing.tax_rate_bp) : '0'} /></label>
            {!editing && <label className="ops-field"><span>Stock inicial</span><input name="stock" type="number" min="0" step="1" defaultValue="0" /></label>}
            <label className="ops-field"><span>Alerta de stock mínimo</span><input name="minimum" type="number" min="0" step="1" defaultValue={editing ? String(editing.min_stock) : '0'} /></label>
            <label className="ops-field"><span>Código de barras</span><input name="barcode" maxLength={64} defaultValue={editing?.barcode || ''} placeholder="Opcional" /></label>
            <label className="ops-field ops-field--wide"><span>Descrição</span><textarea name="description" rows={2} maxLength={2000} defaultValue={editing?.description || ''} placeholder="Informação adicional (opcional)" /></label>
            <label className="ops-field ops-field--wide"><span>{editing?.image_url ? 'Substituir imagem' : 'Imagem do produto'}</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            {editing?.image_url && (
              <div className="ops-field ops-field--wide"><span>Imagem atual</span><div className="ops-current-image"><img src={mediaUrl(editing.image_url)} alt="" /><button type="button" className="button button--secondary" disabled={busy} onClick={() => void removeImage(editing)}>Remover imagem</button></div></div>
            )}
            <div className="ops-form-actions"><button type="button" className="button button--secondary" onClick={closeForm}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'A guardar…' : editing ? 'Guardar alterações' : 'Guardar produto'}</button></div>
          </form>
        </section>
      )}
      <section className="ops-card">
        <div className="ops-table-toolbar">
          <div><h2>Catálogo ativo</h2><p>{products.length} artigos nesta lista</p></div>
          <form className="ops-search" onSubmit={(event) => { event.preventDefault(); void loadProducts(query); }}>
            <span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome, SKU ou código" /><button type="submit">Pesquisar</button>
          </form>
        </div>
        {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar catálogo…</div> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Produto</th><th>Referência</th><th>Tipo</th><th>Preço</th><th>Stock</th><th>Estado</th><th className="ops-table__actions-head">Ações</th></tr></thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td><span className="ops-product-cell">{product.image_url ? <img src={mediaUrl(product.image_url)} alt="" /> : <i>{product.name.slice(0, 1).toUpperCase()}</i>}<span><strong>{product.name}</strong><small>{product.description || product.barcode || 'Sem descrição'}</small></span></span></td>
                    <td>{product.sku}</td>
                    <td>{product.product_type === 'service' ? 'Serviço' : 'Produto'}</td>
                    <td><strong>{money(product.unit_price_cents)}</strong></td>
                    <td>{product.track_stock ? <span className={product.stock_quantity <= product.min_stock ? 'ops-stock-value ops-stock-value--low' : 'ops-stock-value'}>{product.stock_quantity} un.</span> : '—'}</td>
                    <td><span className="ops-table-status"><i />Ativo</span></td>
                    <td>
                      <div className="ops-row-actions">
                        <button type="button" className="ops-icon-button" title="Ver informações" aria-label={`Ver informações de ${product.name}`} onClick={() => setDetail(product)}><Icon name="eye" size={15} /></button>
                        <button type="button" className="ops-icon-button" title="Editar" aria-label={`Editar ${product.name}`} onClick={() => openEdit(product)}><Icon name="edit" size={15} /></button>
                        <button type="button" className="ops-icon-button ops-icon-button--danger" title="Apagar" aria-label={`Apagar ${product.name}`} onClick={() => setConfirmDelete(product)}><Icon name="trash" size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!products.length && <tr><td className="ops-table-empty" colSpan={7}>{query ? 'Não foram encontrados artigos com essa pesquisa.' : 'Ainda não existem artigos. Adicione o primeiro produto ao catálogo.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && createPortal(
        <div className="invoice-overlay" role="dialog" aria-modal="true" aria-label={`Informações de ${detail.name}`}>
          <div className="invoice-overlay__bar">
            <div><strong>{detail.name}</strong><small>{detail.sku} · {detail.product_type === 'service' ? 'Serviço' : 'Produto com stock'}</small></div>
            <div className="invoice-overlay__actions">
              <button className="invoice-overlay__button" type="button" onClick={() => { const product = detail; setDetail(null); openEdit(product); }}><Icon name="edit" size={15} /> Editar</button>
              <button className="invoice-overlay__close" aria-label="Fechar informações" type="button" onClick={() => setDetail(null)}><Icon name="close" size={17} /></button>
            </div>
          </div>
          <div className="invoice-overlay__scroll">
            <article className="ops-detail">
              <div className="ops-detail__media">
                {detail.image_url ? <img src={mediaUrl(detail.image_url)} alt={detail.name} /> : <span>{detail.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="ops-detail__body">
                <div className="ops-detail__head">
                  <div><h2>{detail.name}</h2><p>{detail.description || 'Sem descrição.'}</p></div>
                  <span className={`ops-detail__badge ops-detail__badge--${detail.is_active ? 'active' : 'inactive'}`}>{detail.is_active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <div className="ops-detail__grid">
                  <div className="ops-detail__field"><small>Referência / SKU</small><strong>{detail.sku}</strong></div>
                  <div className="ops-detail__field"><small>Tipo</small><strong>{detail.product_type === 'service' ? 'Serviço' : 'Produto com stock'}</strong></div>
                  <div className="ops-detail__field"><small>Preço de venda</small><strong>{money(detail.unit_price_cents)}</strong></div>
                  <div className="ops-detail__field"><small>Custo</small><strong>{money(detail.cost_price_cents)}</strong></div>
                  <div className="ops-detail__field"><small>Imposto</small><strong>{inputAmount(detail.tax_rate_bp)}%</strong></div>
                  <div className="ops-detail__field"><small>Stock atual</small><strong>{detail.track_stock ? `${detail.stock_quantity} un.` : '—'}</strong></div>
                  <div className="ops-detail__field"><small>Stock mínimo</small><strong>{detail.track_stock ? `${detail.min_stock} un.` : '—'}</strong></div>
                  <div className="ops-detail__field"><small>Código de barras</small><strong>{detail.barcode || '—'}</strong></div>
                </div>
              </div>
            </article>
          </div>
        </div>, document.body)}

      {confirmDelete && createPortal(
        <div className="ops-confirm-layer" role="dialog" aria-modal="true" aria-label="Confirmar eliminação">
          <button type="button" className="ops-confirm-backdrop" aria-label="Cancelar" onClick={() => setConfirmDelete(null)} />
          <div className="ops-confirm">
            <span className="ops-confirm__icon"><Icon name="alert" size={20} /></span>
            <h2>Apagar produto?</h2>
            <p>O produto <strong>{confirmDelete.name}</strong> será desativado e deixará de aparecer no catálogo e nas vendas. O histórico é preservado.</p>
            <div className="ops-confirm__actions">
              <button type="button" className="button button--secondary" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button type="button" className="button button--danger" disabled={busy} onClick={() => void deleteProduct(confirmDelete)}>{busy ? 'A apagar…' : 'Apagar produto'}</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
