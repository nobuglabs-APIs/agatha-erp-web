import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Customer } from './shared';
import { customerPayload, getErrorMessage, listPage } from './shared';

export function CustomersPage({ companyId }: { companyId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [customerType, setCustomerType] = useState<Customer['customer_type']>('company');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCustomers = useCallback(async (search = query) => {
    setLoading(true);
    setError('');
    try {
      const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      const result = await listPage<Customer>(`/customers${suffix}`, companyId);
      setCustomers(result.items);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar os clientes.'));
    } finally {
      setLoading(false);
    }
  }, [companyId, query]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<Customer>('/customers', {
        method: 'POST',
        body: customerPayload(new FormData(event.currentTarget)),
        companyId,
      });
      setNotice('Cliente adicionado à sua carteira.');
      setShowForm(false);
      setQuery('');
      await loadCustomers('');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar o cliente.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">RELACIONAMENTO</span><h1>Clientes</h1><p>Guarde contactos e dados fiscais para usar nas vendas e faturas.</p></div>
        <button className="button button--primary" type="button" onClick={() => setShowForm((value) => !value)}><span>＋</span> Novo cliente</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {showForm && (
        <section className="ops-card ops-form-card">
          <div className="ops-card-heading"><div><h2>Registar cliente</h2><p>O NIF é opcional; se informado, use o formato correspondente ao tipo de cliente.</p></div><button type="button" className="ops-close" aria-label="Fechar" onClick={() => setShowForm(false)}>×</button></div>
          <form className="ops-form-grid" onSubmit={(event) => void createCustomer(event)}>
            <label className="ops-field"><span>Nome / denominação</span><input name="name" required minLength={2} maxLength={200} placeholder="Nome do cliente ou empresa" /></label>
            <label className="ops-field"><span>Tipo de cliente</span><select name="customer_type" value={customerType} onChange={(event) => setCustomerType(event.target.value === 'individual' ? 'individual' : 'company')}><option value="company">Empresa</option><option value="individual">Pessoa singular</option></select></label>
            <label className="ops-field"><span>{customerType === 'company' ? 'NIF da empresa' : 'NIF / identificação fiscal da pessoa'}</span><input name="nif" inputMode={customerType === 'company' ? 'numeric' : 'text'} pattern={customerType === 'company' ? '[0-9]{10}' : '[0-9]{8}[A-Za-z]{2}[0-9]{3}'} maxLength={customerType === 'company' ? 10 : 13} placeholder={customerType === 'company' ? 'Ex.: 5432134224' : 'Ex.: 82001819LA023'} /></label>
            <label className="ops-field"><span>Email</span><input name="email" type="email" placeholder="cliente@empresa.ao" /></label>
            <label className="ops-field"><span>Telefone</span><input name="phone" placeholder="+244" /></label>
            <label className="ops-field"><span>Nome comercial</span><input name="trade_name" maxLength={200} /></label>
            <label className="ops-field ops-field--wide"><span>Morada</span><input name="address" maxLength={300} /></label>
            <label className="ops-field"><span>Município / cidade</span><input name="city" maxLength={100} /></label>
            <label className="ops-field"><span>Província</span><input name="province" maxLength={100} /></label>
            <label className="ops-field"><span>Prazo de pagamento (dias)</span><input name="payment_terms_days" type="number" min={0} max={365} defaultValue={0} /></label>
            <label className="ops-field"><span>Limite de crédito (Kz)</span><input name="credit_limit" type="number" min={0} step="0.01" defaultValue={0} /></label>
            <label className="ops-field ops-field--wide"><span>Notas</span><textarea name="notes" rows={2} maxLength={2000} /></label>
            <div className="ops-form-actions"><button type="button" className="button button--secondary" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar cliente'}</button></div>
          </form>
        </section>
      )}
      <section className="ops-card">
        <div className="ops-table-toolbar">
          <div><h2>Carteira de clientes</h2><p>{customers.length} clientes ativos</p></div>
          <form className="ops-search" onSubmit={(event) => { event.preventDefault(); void loadCustomers(query); }}><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome ou NIF" /><button type="submit">Pesquisar</button></form>
        </div>
        {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar clientes…</div> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Cliente</th><th>NIF</th><th>Contacto</th><th>Localização</th><th>Pagamento</th></tr></thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td><span className="ops-product-cell"><i className="ops-customer-avatar">{customer.name.slice(0, 1).toUpperCase()}</i><span><strong>{customer.trade_name || customer.name}</strong><small>{customer.customer_type === 'company' ? 'Empresa' : 'Pessoa singular'}</small></span></span></td>
                    <td>{customer.nif || '—'}{customer.customer_type === 'individual' && customer.nif && <small>Identificação fiscal pessoal</small>}</td><td>{customer.email || customer.phone || '—'}</td><td>{[customer.city, customer.province].filter(Boolean).join(', ') || '—'}</td><td>{customer.payment_terms_days ? `${customer.payment_terms_days} dias` : 'Pronto pagamento'}</td>
                  </tr>
                ))}
                {!customers.length && <tr><td className="ops-table-empty" colSpan={5}>{query ? 'Não foram encontrados clientes com essa pesquisa.' : 'Ainda não existem clientes. Pode registá-los aqui ou durante uma venda.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
