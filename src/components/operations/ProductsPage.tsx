import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { mediaUrl, request, upload } from '../../api/client';
import type { Product } from './shared';
import { getErrorMessage, listPage, money, productPayload } from './shared';

export function ProductsPage({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
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

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const product = await request<Product>('/products', {
        method: 'POST',
        body: productPayload(form),
        companyId,
      });
      const image = form.get('image');
      if (image instanceof File && image.size > 0) {
        await upload(`/products/${product.id}/image`, image, companyId);
      }
      setNotice('Produto adicionado ao catálogo.');
      setShowForm(false);
      await loadProducts('');
      setQuery('');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar o produto.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">CATÁLOGO DA EMPRESA</span><h1>Produtos</h1><p>Organize artigos e serviços, preços e níveis de stock.</p></div>
        <button className="button button--primary" type="button" onClick={() => setShowForm((value) => !value)}><span>＋</span> Adicionar produto</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {showForm && (
        <section className="ops-card ops-form-card">
          <div className="ops-card-heading"><div><h2>Novo produto ou serviço</h2><p>O preço e o stock são guardados no catálogo da empresa.</p></div><button type="button" className="ops-close" aria-label="Fechar" onClick={() => setShowForm(false)}>×</button></div>
          <form className="ops-form-grid" onSubmit={(event) => void createProduct(event)}>
            <label className="ops-field"><span>Nome do produto</span><input name="name" required maxLength={200} placeholder="Ex.: Água mineral 1,5 L" /></label>
            <label className="ops-field"><span>Referência / SKU</span><input name="sku" required maxLength={64} placeholder="Ex.: AGUA-001" /></label>
            <label className="ops-field"><span>Tipo</span><select name="product_type"><option value="goods">Produto com stock</option><option value="service">Serviço</option></select></label>
            <label className="ops-field"><span>Preço de venda (Kz)</span><input name="price" type="number" min="0" step="0.01" required placeholder="0,00" /></label>
            <label className="ops-field"><span>Custo (Kz)</span><input name="cost" type="number" min="0" step="0.01" defaultValue="0" /></label>
            <label className="ops-field"><span>Imposto (%)</span><input name="tax" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
            <label className="ops-field"><span>Stock inicial</span><input name="stock" type="number" min="0" step="1" defaultValue="0" /></label>
            <label className="ops-field"><span>Alerta de stock mínimo</span><input name="minimum" type="number" min="0" step="1" defaultValue="0" /></label>
            <label className="ops-field"><span>Código de barras</span><input name="barcode" maxLength={64} placeholder="Opcional" /></label>
            <label className="ops-field ops-field--wide"><span>Descrição</span><textarea name="description" rows={2} maxLength={2000} placeholder="Informação adicional (opcional)" /></label>
            <label className="ops-field ops-field--wide"><span>Imagem do produto</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            <div className="ops-form-actions"><button type="button" className="button button--secondary" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar produto'}</button></div>
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
              <thead><tr><th>Produto</th><th>Referência</th><th>Tipo</th><th>Preço</th><th>Stock</th><th>Estado</th></tr></thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td><span className="ops-product-cell">{product.image_url ? <img src={mediaUrl(product.image_url)} alt="" /> : <i>{product.name.slice(0, 1).toUpperCase()}</i>}<span><strong>{product.name}</strong><small>{product.description || product.barcode || 'Sem descrição'}</small></span></span></td>
                    <td>{product.sku}</td>
                    <td>{product.product_type === 'service' ? 'Serviço' : 'Produto'}</td>
                    <td><strong>{money(product.unit_price_cents)}</strong></td>
                    <td>{product.track_stock ? <span className={product.stock_quantity <= product.min_stock ? 'ops-stock-value ops-stock-value--low' : 'ops-stock-value'}>{product.stock_quantity} un.</span> : '—'}</td>
                    <td><span className="ops-table-status"><i />Ativo</span></td>
                  </tr>
                ))}
                {!products.length && <tr><td className="ops-table-empty" colSpan={6}>{query ? 'Não foram encontrados artigos com essa pesquisa.' : 'Ainda não existem artigos. Adicione o primeiro produto ao catálogo.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
