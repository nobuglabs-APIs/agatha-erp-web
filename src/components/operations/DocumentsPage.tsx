import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { request, requestBlob } from '../../api/client';
import type { Page } from '../../api/types';
import type { Customer, Product } from './shared';
import { getErrorMessage, listPage, money } from './shared';

interface SalesDocument {
  id: string;
  doc_type: 'invoice' | 'invoice_receipt';
  document_number: string | null;
  status: string;
  customer_name: string | null;
  customer_nif: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  created_at: string;
}

const paymentStatusNames: Record<string, string> = {
  draft: 'Rascunho',
  issued: 'Emitida · por pagar',
  partially_paid: 'Parcialmente paga',
  paid: 'Paga',
  cancelled: 'Anulada',
};

function documentDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-AO');
}

function localDateInputValue(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function DocumentsPage({ companyId }: { companyId: string }) {
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [issueDate, setIssueDate] = useState(localDateInputValue);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formDataLoading, setFormDataLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invoices, invoiceReceipts] = await Promise.all([
        request<Page<SalesDocument>>('/sales/documents?doc_type=invoice&page=1&per_page=100', { companyId }),
        request<Page<SalesDocument>>('/sales/documents?doc_type=invoice_receipt&page=1&per_page=100', { companyId }),
      ]);
      setDocuments([...invoices.items, ...invoiceReceipts.items]
        .sort((left, right) => right.created_at.localeCompare(left.created_at)));
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar as faturas.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  async function loadFormData() {
    setFormDataLoading(true);
    setError('');
    try {
      const [customerPage, productPage] = await Promise.all([
        listPage<Customer>('/customers', companyId, 100),
        listPage<Product>('/products', companyId, 100),
      ]);
      setCustomers(customerPage.items.filter((customer) => customer.is_active));
      setProducts(productPage.items.filter((product) => product.is_active));
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível preparar a emissão da fatura.'));
      setShowForm(false);
    } finally {
      setFormDataLoading(false);
    }
  }

  function openForm() {
    setShowForm(true);
    void loadFormData();
  }

  const selectedProducts = useMemo(
    () => products.filter((product) => (quantities[product.id] || 0) > 0),
    [products, quantities],
  );
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const canCreate = Boolean(selectedCustomerId)
    && selectedProducts.length > 0
    && selectedProducts.every((product) => quantities[product.id] <= 1_000_000)
    && selectedProducts.every((product) => !product.track_stock || product.stock_quantity >= quantities[product.id]);

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const draft = await request<SalesDocument>('/sales/documents', {
        method: 'POST',
        companyId,
        body: {
          doc_type: 'invoice',
          customer_id: selectedCustomerId,
          issue_date: issueDate || null,
          due_date: dueDate || null,
          valid_until: null,
          notes: notes.trim() || null,
          discount_cents: 0,
          items: selectedProducts.map((product) => ({
            product_id: product.id,
            description: null,
            quantity: quantities[product.id],
            unit_price_cents: null,
            discount_cents: 0,
            tax_rate_bp: null,
            unit_symbol: null,
          })),
        },
      });
      setShowForm(false);
      setSelectedCustomerId('');
      setQuantities({});
      setDueDate('');
      setNotes('');
      setNotice(`Rascunho de fatura criado para ${selectedCustomer?.name || 'o cliente'}. Reveja e emita na lista.`);
      await loadDocuments();
      setDocuments((current) => current.some((item) => item.id === draft.id) ? current : [draft, ...current]);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar o rascunho da fatura.'));
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice(document: SalesDocument) {
    const confirmed = window.confirm(
      'Ao emitir, a fatura recebe um número fiscal e os produtos controlados por stock são descontados. Confirmar emissão?',
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<SalesDocument>(`/sales/documents/${document.id}/issue`, { method: 'POST', companyId });
      setNotice('Fatura emitida com sucesso. Já pode descarregar o PDF.');
      await loadDocuments();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível emitir a fatura.'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(document: SalesDocument) {
    setBusy(true);
    setError('');
    try {
      const pdf = await requestBlob(`/sales/documents/${document.id}/pdf`, companyId);
      const url = URL.createObjectURL(pdf);
      const link = window.document.createElement('a');
      const name = (document.document_number || `fatura-${document.id}`)
        .replace(/[\\/:*?"<>|]/g, '-');
      link.href = url;
      link.download = `${name}.pdf`;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível descarregar o PDF.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">DOCUMENTOS COMERCIAIS</span><h1>Faturas</h1><p>Prepare rascunhos, emita documentos e descarregue os respetivos PDFs.</p></div>
        <button className="button button--primary" type="button" onClick={openForm} disabled={formDataLoading}>
          {formDataLoading ? 'A preparar…' : <><span>＋</span> Nova fatura</>}
        </button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}

      {showForm && (
        <section className="ops-card ops-form-card">
          <div className="ops-card-heading">
            <div><h2>Preparar fatura</h2><p>O cliente é necessário; o NIF é opcional. Se informado, deve corresponder ao tipo de cliente.</p></div>
            <button type="button" className="ops-close" aria-label="Fechar" onClick={() => setShowForm(false)}>×</button>
          </div>
          {formDataLoading ? <div className="ops-loading"><span className="loading-dot" />A carregar clientes e produtos…</div> : (
            <form className="ops-form-grid" onSubmit={(event) => void createInvoice(event)}>
              <label className="ops-field ops-field--wide"><span>Cliente</span>
                <select required value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                  <option value="">Selecione o cliente</option>
                  {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name || customer.name}{customer.nif ? ` · ${customer.nif}` : ' · sem NIF'}</option>)}
                </select>
              </label>
              {!customers.length && <p className="ops-form-help ops-field--wide">Ainda não há clientes ativos. Registe um cliente para associar à fatura; o NIF é opcional.</p>}
              <label className="ops-field"><span>Data da fatura</span><input type="date" required value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label>
              <label className="ops-field"><span>Data de vencimento</span><input type="date" min={issueDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <div className="ops-field ops-field--wide">
                <span>Produtos e quantidades</span>
                <div className="document-product-list">
                  {products.map((product) => {
                    const quantity = quantities[product.id] || 0;
                    const unavailable = product.track_stock && product.stock_quantity === 0;
                    return (
                      <label className="document-product" key={product.id}>
                        <input
                          type="checkbox"
                          checked={quantity > 0}
                          disabled={unavailable}
                          onChange={(event) => setQuantities((current) => ({
                            ...current,
                            [product.id]: event.target.checked ? 1 : 0,
                          }))}
                        />
                        <span><strong>{product.name}</strong><small>{money(product.unit_price_cents)}{product.track_stock ? ` · ${product.stock_quantity} em stock` : ' · Serviço'}</small></span>
                        {quantity > 0 && <input
                          aria-label={`Quantidade de ${product.name}`}
                          type="number"
                          min={1}
                          max={product.track_stock ? product.stock_quantity : 1000000}
                          value={quantity}
                          onChange={(event) => setQuantities((current) => ({
                            ...current,
                            [product.id]: Math.min(1_000_000, Math.max(1, Number(event.target.value) || 1)),
                          }))}
                          onClick={(event) => event.stopPropagation()}
                        />}
                      </label>
                    );
                  })}
                  {!products.length && <p className="empty-note">Não existem produtos ativos no catálogo.</p>}
                </div>
              </div>
              <label className="ops-field ops-field--wide"><span>Observações (opcional)</span><textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              {selectedProducts.some((product) => product.track_stock && quantities[product.id] > product.stock_quantity) && (
                <p className="ops-form-help ops-field--wide">A quantidade indicada ultrapassa o stock disponível.</p>
              )}
              <div className="ops-form-actions">
                <button type="button" className="button button--secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="button button--primary" disabled={!canCreate || busy}>{busy ? 'A guardar…' : 'Guardar rascunho'}</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="ops-card">
        <div className="ops-card-heading">
          <div><h2>Documentos emitidos e rascunhos</h2><p>{documents.length} faturas na lista</p></div>
          <button type="button" className="ops-icon-button" aria-label="Atualizar faturas" onClick={() => void loadDocuments()}>↻</button>
        </div>
        {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar faturas…</div> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Documento</th><th>Cliente</th><th>Data</th><th>Estado</th><th>Total</th><th /></tr></thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td><strong>{document.document_number || 'Rascunho'}</strong><small>{document.doc_type === 'invoice_receipt' ? 'Fatura-recibo' : 'Fatura'}</small></td>
                    <td>{document.customer_name || '—'}{document.customer_nif && <small>NIF {document.customer_nif}</small>}</td>
                    <td>{documentDate(document.issue_date)}</td>
                    <td><span className={`ops-sale-status ops-sale-status--${document.status === 'paid' ? 'paid' : document.status === 'issued' || document.status === 'partially_paid' ? 'unpaid' : 'cancelled'}`}>{paymentStatusNames[document.status] || document.status}</span></td>
                    <td><strong>{money(document.total_cents)}</strong>{document.balance_cents > 0 && <small>Em falta {money(document.balance_cents)}</small>}</td>
                    <td><span className="document-row-actions">
                      {document.status === 'draft' && <button type="button" className="button button--primary document-action" disabled={busy} onClick={() => void issueInvoice(document)}>Emitir</button>}
                      <button type="button" className="button button--secondary document-action" disabled={busy} onClick={() => void downloadPdf(document)}>PDF</button>
                    </span></td>
                  </tr>
                ))}
                {!documents.length && <tr><td className="ops-table-empty" colSpan={6}>Ainda não existem faturas. Crie um rascunho para começar.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
