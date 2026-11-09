import { useEffect, useState } from 'react';
import { request } from '../../api/client';
import { Icon } from '../Icon';
import type { Customer, Product, Sale, SalesSummary } from './shared';
import { dateTime, getErrorMessage, listPage, money } from './shared';

type View = 'overview' | 'sales' | 'products' | 'customers' | 'stock';

export function DashboardPage({
  companyId,
  onNavigate,
}: {
  companyId: string;
  onNavigate: (view: View) => void;
}) {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState('');
  const [reportUnavailable, setReportUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const outcomes = await Promise.allSettled([
        request<SalesSummary>('/reports/sales-summary', { companyId }),
        listPage<Product>('/products', companyId, 100),
        listPage<Customer>('/customers', companyId, 100),
        listPage<Sale>('/sales', companyId, 8),
      ]);
      if (!active) return;
      if (outcomes[0].status === 'fulfilled') setSummary(outcomes[0].value);
      else if (outcomes[0].reason instanceof Error && 'status' in outcomes[0].reason && outcomes[0].reason.status === 402) {
        setReportUnavailable(true);
      }
      if (outcomes[1].status === 'fulfilled') setProducts(outcomes[1].value.items);
      if (outcomes[2].status === 'fulfilled') setCustomers(outcomes[2].value.items);
      if (outcomes[3].status === 'fulfilled') setSales(outcomes[3].value.items);
      const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
      const permissionFailure = failures.find((outcome) => outcome.status === 'rejected' && 'status' in outcome.reason && outcome.reason.status === 403);
      if (permissionFailure?.status === 'rejected') setError(getErrorMessage(permissionFailure.reason, 'Algumas informações não estão disponíveis.'));
      else if (failures.length === outcomes.length) setError(getErrorMessage(failures[0].status === 'rejected' ? failures[0].reason : null, 'Não foi possível carregar o painel.'));
    }
    void load();
    return () => { active = false; };
  }, [companyId]);

  const lowStock = products.filter((product) => product.track_stock && product.stock_quantity <= product.min_stock);

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">O SEU NEGÓCIO, NUM RELANCE</span><h1>Bom dia, vamos começar?</h1><p>Acompanhe o movimento da empresa e aceda rapidamente às tarefas do dia.</p></div>
        <button className="button button--primary" type="button" onClick={() => onNavigate('sales')}><Icon name="plus" size={15} /> Nova venda</button>
      </div>

      {error && <div className="ops-alert ops-alert--warning" role="status">{error}</div>}

      <section className="ops-metric-grid">
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon ops-metric__icon--green"><Icon name="trend" size={15} /></span><small>ÚLTIMOS 30 DIAS</small></span><strong>{summary ? money(summary.total_cents) : reportUnavailable ? '—' : '…'}</strong><span className="ops-metric__label">Vendas totais</span><small className="ops-metric__hint">{summary ? `${summary.sales_count} vendas registadas` : 'Resumo de vendas'}</small></article>
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon ops-metric__icon--blue"><Icon name="package" size={15} /></span><small>CATÁLOGO ATIVO</small></span><strong>{products.length}</strong><span className="ops-metric__label">Produtos e serviços</span><small className="ops-metric__hint">{lowStock.length ? `${lowStock.length} com stock baixo` : 'Catálogo da empresa'}</small></article>
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon ops-metric__icon--amber"><Icon name="users" size={15} /></span><small>BASE DE CLIENTES</small></span><strong>{customers.length}</strong><span className="ops-metric__label">Clientes ativos</span><small className="ops-metric__hint">Pessoas e empresas</small></article>
        <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon ops-metric__icon--violet"><Icon name="clock" size={15} /></span><small>VALORES EM ABERTO</small></span><strong>{summary ? money(summary.outstanding_cents) : '—'}</strong><span className="ops-metric__label">Por receber</span><small className="ops-metric__hint">{summary ? `${summary.sales_count} vendas no período` : 'Disponível no relatório'}</small></article>
      </section>

      <section className="ops-dashboard-grid">
        <article className="ops-card">
          <div className="ops-card-heading"><div><h2>Vendas recentes</h2><p>Últimos movimentos registados</p></div><button className="ops-link-button" type="button" onClick={() => onNavigate('sales')}>Ver vendas <span>→</span></button></div>
          {sales.length ? (
            <div className="ops-recent-list">
              {sales.slice(0, 5).map((sale) => (
                <div className="ops-recent-row" key={sale.id}>
                  <span className="ops-recent-avatar">FT</span>
                  <span className="ops-recent-main"><strong>Venda #{sale.number}</strong><small>{dateTime(sale.created_at)}</small></span>
                  <span className="ops-recent-amount"><strong>{money(sale.total_cents)}</strong><small className={`ops-sale-status ops-sale-status--${sale.status}`}>{sale.status === 'paid' ? 'Pago' : sale.status === 'cancelled' ? 'Anulado' : sale.status === 'partially_paid' ? 'Parcial' : 'Em aberto'}</small></span>
                </div>
              ))}
            </div>
          ) : <div className="ops-empty-inline"><span><Icon name="trend" size={17} /></span><strong>Ainda sem vendas</strong><small>As vendas registadas aparecerão aqui.</small></div>}
        </article>
        <article className="ops-card">
          <div className="ops-card-heading"><div><h2>Acesso rápido</h2><p>As tarefas mais utilizadas</p></div></div>
          <div className="ops-quick-actions">
            <button type="button" onClick={() => onNavigate('sales')}><span className="ops-quick-icon ops-quick-icon--green"><Icon name="trend" size={16} /></span><span><strong>Registar venda</strong><small>Abrir ponto de venda</small></span><b>→</b></button>
            <button type="button" onClick={() => onNavigate('products')}><span className="ops-quick-icon ops-quick-icon--blue"><Icon name="package" size={16} /></span><span><strong>Adicionar produto</strong><small>Atualizar o catálogo</small></span><b>→</b></button>
            <button type="button" onClick={() => onNavigate('customers')}><span className="ops-quick-icon ops-quick-icon--amber"><Icon name="users" size={16} /></span><span><strong>Criar cliente</strong><small>Guardar novo contacto</small></span><b>→</b></button>
          </div>
        </article>
      </section>

      <section className="ops-card ops-stock-card">
        <div className="ops-card-heading"><div><h2>Stock a acompanhar</h2><p>Produtos no mínimo ou abaixo do stock mínimo</p></div><button className="ops-link-button" type="button" onClick={() => onNavigate('stock')}>Gerir stock <span>→</span></button></div>
        {lowStock.length ? (
          <div className="ops-low-stock-list">
            {lowStock.slice(0, 5).map((product) => (
              <div className="ops-low-stock-row" key={product.id}><span className="ops-stock-dot" /><span><strong>{product.name}</strong><small>SKU {product.sku}</small></span><span className="ops-stock-quantity">{product.stock_quantity} <small>un.</small></span><span className="ops-stock-min">mín. {product.min_stock}</span></div>
            ))}
          </div>
        ) : <div className="ops-stock-ok"><span>✓</span> {products.length ? 'Não há artigos abaixo do stock mínimo.' : 'Adicione produtos para começar a controlar o stock.'}</div>}
      </section>
      {reportUnavailable && <p className="ops-subtle-note">Os relatórios detalhados dependem do módulo de relatórios do seu plano.</p>}
    </div>
  );
}
