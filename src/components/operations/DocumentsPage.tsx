import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { request, requestBlob } from '../../api/client';
import type { Page } from '../../api/types';
import type { Customer, Product } from './shared';
import { PAYMENT_METHODS, getErrorMessage, listPage, money, paymentMethodLabel } from './shared';
import {
  DOCUMENT_TYPES,
  documentTypeDefinition,
  documentTypeLabel,
  type SalesDocumentType,
} from './documentTypes';
import { DocumentSheet } from './DocumentSheet';

interface SalesDocument {
  id: string;
  doc_type: string;
  document_number: string | null;
  status: string;
  customer_name: string | null;
  customer_nif: string | null;
  issue_date: string | null;
  due_date: string | null;
  valid_until: string | null;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  created_at: string;
}

const statusNames: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  confirmed: 'Confirmada',
  issued: 'Emitida',
  partially_fulfilled: 'Parcialmente satisfeita',
  fulfilled: 'Satisfeita',
  partially_paid: 'Parcialmente paga',
  paid: 'Paga',
  cancelled: 'Anulada',
};

function statusTone(status: string): string {
  if (status === 'paid' || status === 'fulfilled') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (['sent', 'confirmed', 'issued', 'partially_fulfilled', 'partially_paid'].includes(status)) {
    return 'unpaid';
  }
  return '';
}

function documentDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-AO');
}

export function DocumentsPage({ companyId }: { companyId: string }) {
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [docType, setDocType] = useState<SalesDocumentType>('invoice');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [dueDate, setDueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formDataLoading, setFormDataLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sheetDocumentId, setSheetDocumentId] = useState<string | null>(null);

  const selectedType = documentTypeDefinition(docType) ?? DOCUMENT_TYPES[0];

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const pages = await Promise.all(
        DOCUMENT_TYPES.map((type) => request<Page<SalesDocument>>(
          `/sales/documents?doc_type=${type.value}&page=1&per_page=100`,
          { companyId },
        )),
      );
      setDocuments(pages.reduce<SalesDocument[]>((all, page) => all.concat(page.items), [])
        .sort((left, right) => right.created_at.localeCompare(left.created_at)));
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar os documentos.'));
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
      setError(getErrorMessage(reason, 'Não foi possível preparar a emissão do documento.'));
      setShowForm(false);
    } finally {
      setFormDataLoading(false);
    }
  }

  function openForm() {
    setDocType('invoice');
    setSelectedCustomerId('');
    setQuantities({});
    setDueDate('');
    setValidUntil('');
    setPaymentMethod('cash');
    setNotes('');
    setProductSearch('');
    setNotice('');
    setShowForm(true);
    void loadFormData();
  }

  const selectedProducts = useMemo(
    () => products.filter((product) => (quantities[product.id] || 0) > 0),
    [products, quantities],
  );
  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase();
    return products.filter((product) => !query || product.name.toLocaleLowerCase().includes(query)
      || (product.sku || '').toLocaleLowerCase().includes(query));
  }, [productSearch, products]);
  const documentTotal = selectedProducts.reduce(
    (total, product) => {
      const subtotal = BigInt(product.unit_price_cents) * BigInt(quantities[product.id]);
      const tax = (subtotal * BigInt(product.tax_rate_bp) + 5_000n) / 10_000n;
      return total + Number(subtotal + tax);
    },
    0,
  );
  const canCreate = Boolean(selectedCustomerId)
    && selectedProducts.length > 0
    && selectedProducts.every((product) => quantities[product.id] <= 1_000_000)
    && selectedProducts.every((product) => !product.track_stock || product.stock_quantity >= quantities[product.id]);

  async function registerReceiptPayment(documentId: string, totalCents: number) {
    await request(`/sales/documents/${documentId}/payments`, {
      method: 'POST',
      companyId,
      body: {
        method: paymentMethod,
        amount_cents: totalCents,
        reference: null,
      },
    });
  }

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError('');
    setNotice('');
    const label = selectedType.label;
    try {
      const draft = await request<SalesDocument>('/sales/documents', {
        method: 'POST',
        companyId,
        body: {
          doc_type: docType,
          customer_id: selectedCustomerId,
          due_date: selectedType.usesDueDate ? dueDate || null : null,
          valid_until: selectedType.usesValidUntil ? validUntil || null : null,
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
      setValidUntil('');
      setNotes('');
      setProductSearch('');
      let issueError = '';
      let paid = false;
      try {
        const issued = await request<SalesDocument>(`/sales/documents/${draft.id}/issue`, {
          method: 'POST',
          companyId,
        });
        if (selectedType.collectsPayment) {
          await registerReceiptPayment(issued.id, issued.total_cents);
          paid = true;
        }
        setSheetDocumentId(issued.id);
        setNotice(`${label} ${issued.document_number || ''} emitida${paid ? ` e paga em ${paymentMethodLabel(paymentMethod)}` : ''} com sucesso.`);
      } catch (reason) {
        issueError = `O rascunho foi guardado, mas não foi possível emitir ${label.toLocaleLowerCase()}: ${getErrorMessage(reason, 'verifique o stock e tente novamente na lista.')}`;
      }
      await loadDocuments();
      if (issueError) setError(issueError);
    } catch (reason) {
      setError(getErrorMessage(reason, `Não foi possível criar o rascunho de ${label.toLocaleLowerCase()}.`));
    } finally {
      setBusy(false);
    }
  }

  async function issueDocument(document: SalesDocument) {
    const definition = documentTypeDefinition(document.doc_type);
    const label = definition?.label ?? documentTypeLabel(document.doc_type);
    const paymentNote = definition?.collectsPayment
      ? ` O pagamento será registado em ${paymentMethodLabel(paymentMethod)}.`
      : '';
    const confirmed = window.confirm(
      `Ao emitir, ${label.toLocaleLowerCase()} recebe um número fiscal e os produtos controlados por stock são descontados.${paymentNote} Confirmar emissão?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const issued = await request<SalesDocument>(`/sales/documents/${document.id}/issue`, {
        method: 'POST',
        companyId,
      });
      let paid = false;
      if (definition?.collectsPayment) {
        await registerReceiptPayment(issued.id, issued.total_cents);
        paid = true;
      }
      setNotice(`${label} emitida${paid ? ` e paga em ${paymentMethodLabel(paymentMethod)}` : ''} com sucesso. Reveja o documento e imprima.`);
      setSheetDocumentId(document.id);
      await loadDocuments();
    } catch (reason) {
      setError(getErrorMessage(reason, `Não foi possível emitir ${label.toLocaleLowerCase()}.`));
    } finally {
      setBusy(false);
    }
  }

  async function cancelDocument(document: SalesDocument) {
    const label = documentTypeLabel(document.doc_type);
    const cancelReason = window.prompt(
      `Motivo da anulação de ${label.toLocaleLowerCase()}${document.document_number ? ` ${document.document_number}` : ''}:`,
    );
    if (cancelReason === null) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setError('Indique um motivo com pelo menos 3 caracteres para anular o documento.');
      return;
    }
    const confirmed = window.confirm(
      `Anular ${label.toLocaleLowerCase()}${document.document_number ? ` ${document.document_number}` : ''}? O stock é reposto quando aplicável. Se este documento foi criado numa venda do POS, anule a venda na página Vendas para manter tudo sincronizado.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/sales/documents/${document.id}/cancel`, {
        method: 'POST',
        companyId,
        body: { reason },
      });
      setNotice(`${label}${document.document_number ? ` ${document.document_number}` : ''} anulada.`);
      await loadDocuments();
    } catch (errorReason) {
      setError(getErrorMessage(errorReason, `Não foi possível anular ${label.toLocaleLowerCase()}.`));
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
      const name = (document.document_number || `documento-${document.id}`)
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
        <div><span className="eyebrow">DOCUMENTOS COMERCIAIS</span><h1>Documentos</h1><p>Emita faturas, proformas, encomendas e guias de remessa padronizadas.</p></div>
        <button className="button button--primary" type="button" onClick={openForm} disabled={formDataLoading}>
          {formDataLoading ? 'A preparar…' : <><span>＋</span> Novo documento</>}
        </button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}

      {showForm && (
        <section className="ops-card ops-form-card">
          <div className="ops-card-heading">
            <div><h2>Novo documento</h2><p>Escolha o tipo, o cliente e os artigos. O stock é atualizado ao emitir.</p></div>
            <button type="button" className="ops-close" aria-label="Fechar" onClick={() => setShowForm(false)}>×</button>
          </div>
          {formDataLoading ? <div className="ops-loading"><span className="loading-dot" />A carregar clientes e produtos…</div> : (
            <form className="ops-form-grid" onSubmit={(event) => void createDocument(event)}>
              <label className="ops-field ops-field--wide"><span>Tipo de documento</span>
                <select value={docType} onChange={(event) => setDocType(event.target.value as SalesDocumentType)}>
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label} · {type.prefix}</option>
                  ))}
                </select>
              </label>
              <p className="ops-form-help ops-field--wide">{selectedType.description}</p>
              <label className="ops-field ops-field--wide"><span>Cliente</span>
                <select required value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                  <option value="">Selecione o cliente</option>
                  {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name || customer.name}{customer.nif ? ` · ${customer.nif}` : ' · sem NIF'}</option>)}
                </select>
              </label>
              {!customers.length && <p className="ops-form-help ops-field--wide">Ainda não há clientes ativos. Registe um cliente para associar ao documento; o NIF é opcional.</p>}
              {selectedType.usesDueDate && (
                <label className="ops-field"><span>Vencimento (opcional)</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              )}
              {selectedType.usesValidUntil && (
                <label className="ops-field"><span>Validade da proforma (opcional)</span><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
              )}
              {selectedType.collectsPayment && (
                <label className="ops-field"><span>Meio de pagamento</span>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                  </select>
                </label>
              )}
              <div className="ops-field ops-field--wide">
                <span>Artigos</span>
                <input
                  aria-label="Pesquisar artigos"
                  placeholder="Pesquisar por nome ou código"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                />
                <div className="document-product-list">
                  {visibleProducts.map((product) => {
                    const quantity = quantities[product.id] || 0;
                    const unavailable = product.track_stock && product.stock_quantity === 0;
                    return (
                      <div className="document-product" key={product.id}>
                        <span><strong>{product.name}</strong><small>{money(product.unit_price_cents)}{product.track_stock ? ` · ${product.stock_quantity} em stock` : product.product_type === 'service' ? ' · Serviço' : ' · Sem controlo de stock'}</small></span>
                        <div className="document-product__stepper">
                          <button aria-label={`Diminuir ${product.name}`} disabled={quantity < 1 || busy} onClick={() => setQuantities((current) => ({ ...current, [product.id]: quantity - 1 }))} type="button">−</button>
                          <output aria-label={`Quantidade de ${product.name}`}>{quantity}</output>
                          <button aria-label={`Aumentar ${product.name}`} disabled={unavailable || busy || (product.track_stock && quantity >= product.stock_quantity) || quantity >= 1_000_000} onClick={() => setQuantities((current) => ({ ...current, [product.id]: quantity + 1 }))} type="button">＋</button>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleProducts.length && <p className="empty-note">{products.length ? 'Não foram encontrados artigos.' : 'Não existem artigos ativos no catálogo.'}</p>}
                </div>
              </div>
              <label className="ops-field ops-field--wide"><span>Observações (opcional)</span><textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              {selectedProducts.some((product) => product.track_stock && quantities[product.id] > product.stock_quantity) && (
                <p className="ops-form-help ops-field--wide">A quantidade indicada ultrapassa o stock disponível.</p>
              )}
              <div className="document-invoice-total ops-field--wide"><span>Total com impostos</span><strong>{money(documentTotal)}</strong></div>
              <p className="document-stock-note ops-field--wide">{selectedType.stockNote}</p>
              <div className="ops-form-actions">
                <button type="button" className="button button--secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="button button--primary" disabled={!canCreate || busy}>{busy ? 'A emitir…' : `Emitir ${selectedType.label.toLocaleLowerCase()}`}</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="ops-card">
        <div className="ops-card-heading">
        <div><h2>Documentos</h2><p>{documents.length} documentos na lista</p></div>
          <button type="button" className="ops-icon-button" aria-label="Atualizar documentos" onClick={() => void loadDocuments()}>↻</button>
        </div>
        {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar documentos…</div> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Documento</th><th>Cliente</th><th>Data</th><th>Estado</th><th>Total</th><th /></tr></thead>
              <tbody>
                {documents.map((document) => {
                  const tone = statusTone(document.status);
                  return (
                    <tr key={document.id}>
                      <td><strong>{document.document_number || 'Rascunho'}</strong><small>{documentTypeLabel(document.doc_type)}</small></td>
                      <td>{document.customer_name || '—'}{document.customer_nif && <small>NIF {document.customer_nif}</small>}</td>
                      <td>{documentDate(document.issue_date)}</td>
                      <td><span className={`ops-sale-status${tone ? ` ops-sale-status--${tone}` : ''}`}>{statusNames[document.status] || document.status}</span></td>
                      <td><strong>{money(document.total_cents)}</strong>{document.balance_cents > 0 && <small>Em falta {money(document.balance_cents)}</small>}</td>
                      <td><span className="document-row-actions">
                        {document.status === 'draft' && <button type="button" className="button button--primary document-action" disabled={busy} onClick={() => void issueDocument(document)}>Emitir</button>}
                        <button type="button" className="button button--secondary document-action" onClick={() => setSheetDocumentId(document.id)}>Ver</button>
                        <button type="button" className="button button--secondary document-action" disabled={busy} onClick={() => void downloadPdf(document)}>PDF</button>
                        {document.status !== 'cancelled' && !['converted', 'fulfilled'].includes(document.status) && document.doc_type !== 'receipt' && (
                          <button type="button" className="button button--secondary document-action" disabled={busy} onClick={() => void cancelDocument(document)}>Anular</button>
                        )}
                      </span></td>
                    </tr>
                  );
                })}
                {!documents.length && <tr><td className="ops-table-empty" colSpan={6}>Ainda não existem documentos. Emita o primeiro para começar.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sheetDocumentId && (
        <DocumentSheet companyId={companyId} documentId={sheetDocumentId} onClose={() => setSheetDocumentId(null)} />
      )}
    </div>
  );
}
