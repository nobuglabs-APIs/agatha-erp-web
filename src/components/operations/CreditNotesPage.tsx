import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { request, requestBlob } from '../../api/client';
import type { Page } from '../../api/types';
import { getErrorMessage, money } from './shared';
import { DocumentSheet } from './DocumentSheet';

interface SalesDocument {
  id: string;
  doc_type: string;
  document_number: string | null;
  status: string;
  customer_name: string | null;
  customer_nif: string | null;
  issue_date: string | null;
  total_cents: number;
  credited_cents: number;
  created_at: string;
}

const statusNames: Record<string, string> = {
  draft: 'Rascunho',
  issued: 'Emitida',
  partially_paid: 'Parcialmente paga',
  paid: 'Paga',
  cancelled: 'Anulada',
};

const eligibleInvoiceStatuses = ['issued', 'partially_paid', 'paid'];

function documentDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-AO');
}

export function CreditNotesPage({ companyId }: { companyId: string }) {
  const [creditNotes, setCreditNotes] = useState<SalesDocument[]>([]);
  const [invoices, setInvoices] = useState<SalesDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [returnStock, setReturnStock] = useState(true);
  const [sheetDocumentId, setSheetDocumentId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [notes, invoicePage] = await Promise.all([
        request<Page<SalesDocument>>('/sales/documents?doc_type=credit_note&page=1&per_page=100', { companyId }),
        request<Page<SalesDocument>>('/sales/documents?doc_type=invoice&page=1&per_page=100', { companyId }),
      ]);
      setCreditNotes(notes.items);
      setInvoices(invoicePage.items.filter((invoice) => invoice.credited_cents === 0
        && eligibleInvoiceStatuses.includes(invoice.status)));
    } catch (reason_) {
      setError(getErrorMessage(reason_, 'Não foi possível carregar as notas de crédito.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const eligibleInvoices = useMemo(
    () => [...invoices].sort((left, right) => (right.issue_date || '').localeCompare(left.issue_date || '')),
    [invoices],
  );
  const selectedInvoice = eligibleInvoices.find((invoice) => invoice.id === selectedInvoiceId) || null;

  function openForm() {
    setSelectedInvoiceId('');
    setReason('');
    setReturnStock(true);
    setError('');
    setNotice('');
    setShowForm(true);
  }

  async function createCreditNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice) return;
    const noteReason = reason.trim();
    if (noteReason.length < 3) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const draft = await request<SalesDocument>(`/sales/documents/${selectedInvoice.id}/credit-note`, {
        method: 'POST',
        companyId,
        body: { reason: noteReason, return_stock: returnStock },
      });
      const issued = await request<SalesDocument>(`/sales/documents/${draft.id}/issue`, {
        method: 'POST',
        companyId,
      });
      setNotice(`Nota de crédito ${issued.document_number || ''} emitida para a fatura ${selectedInvoice.document_number || ''}.`);
      setSheetDocumentId(issued.id);
      setShowForm(false);
      setSelectedInvoiceId('');
      setReason('');
      await loadData();
    } catch (reason_) {
      setError(getErrorMessage(reason_, 'Não foi possível emitir a nota de crédito.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelCreditNote(note: SalesDocument) {
    const cancelReason = window.prompt('Motivo da anulação da nota de crédito:');
    if (!cancelReason?.trim() || cancelReason.trim().length < 3) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/sales/documents/${note.id}/cancel`, {
        method: 'POST',
        companyId,
        body: { reason: cancelReason.trim() },
      });
      setNotice(`Nota de crédito ${note.document_number || ''} anulada.`);
      await loadData();
    } catch (reason_) {
      setError(getErrorMessage(reason_, 'Não foi possível anular a nota de crédito.'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(note: SalesDocument) {
    setBusy(true);
    setError('');
    try {
      const pdf = await requestBlob(`/sales/documents/${note.id}/pdf`, companyId);
      const url = URL.createObjectURL(pdf);
      const link = window.document.createElement('a');
      const name = (note.document_number || `nota-credito-${note.id}`)
        .replace(/[\\/:*?"<>|]/g, '-');
      link.href = url;
      link.download = `${name}.pdf`;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason_) {
      setError(getErrorMessage(reason_, 'Não foi possível descarregar o PDF.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">DOCUMENTOS COMERCIAIS</span><h1>Notas de crédito</h1><p>Emita notas de crédito a partir das faturas e acompanhe as devoluções.</p></div>
        <button className="button button--primary" type="button" onClick={openForm} disabled={loading}>
          <span>＋</span> Nova nota de crédito
        </button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}

      {showForm && (
        <section className="ops-card ops-form-card">
          <div className="ops-card-heading">
            <div><h2>Nova nota de crédito</h2><p>Escolha a fatura a creditar. A nota anula integralmente a fatura.</p></div>
            <button type="button" className="ops-close" aria-label="Fechar" onClick={() => setShowForm(false)}>×</button>
          </div>
          <form className="ops-form-grid" onSubmit={(event) => void createCreditNote(event)}>
            <label className="ops-field ops-field--wide"><span>Fatura *</span>
              <select required value={selectedInvoiceId} onChange={(event) => setSelectedInvoiceId(event.target.value)}>
                <option value="">Selecione a fatura</option>
                {eligibleInvoices.map((invoice) => <option value={invoice.id} key={invoice.id}>{invoice.document_number || 'Rascunho'} · {invoice.customer_name || 'Consumidor final'} · {money(invoice.total_cents)}</option>)}
              </select>
            </label>
            {!eligibleInvoices.length && <p className="ops-form-help ops-field--wide">Não há faturas emitidas disponíveis para creditar.</p>}
            <label className="ops-field ops-field--wide"><span>Motivo *</span><textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
            <label className="ops-check-row ops-field--wide"><input type="checkbox" checked={returnStock} onChange={(event) => setReturnStock(event.target.checked)} /><span>Repor os artigos controlados no stock</span></label>
            <p className="ops-form-help ops-field--wide">A nota de crédito anula integralmente a fatura (crédito total) e reduz o saldo em aberto.</p>
            <div className="ops-form-actions">
              <button type="button" className="button button--secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="button button--primary" disabled={!selectedInvoice || busy || reason.trim().length < 3}>{busy ? 'A emitir…' : 'Emitir nota de crédito'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="ops-card">
        <div className="ops-card-heading">
          <div><h2>Notas de crédito</h2><p>{creditNotes.length} documentos na lista</p></div>
          <button type="button" className="ops-icon-button" aria-label="Atualizar notas de crédito" onClick={() => void loadData()}>↻</button>
        </div>
        {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar notas de crédito…</div> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Documento</th><th>Cliente</th><th>Data</th><th>Estado</th><th>Total</th><th /></tr></thead>
              <tbody>
                {creditNotes.map((note) => (
                  <tr key={note.id}>
                    <td><strong>{note.document_number || 'Rascunho'}</strong><small>Nota de crédito</small></td>
                    <td>{note.customer_name || '—'}{note.customer_nif && <small>NIF {note.customer_nif}</small>}</td>
                    <td>{documentDate(note.issue_date)}</td>
                    <td><span className={`ops-sale-status ops-sale-status--${note.status === 'cancelled' ? 'cancelled' : 'paid'}`}>{statusNames[note.status] || note.status}</span></td>
                    <td><strong>{money(note.total_cents)}</strong></td>
                    <td><span className="document-row-actions">
                      {note.status === 'issued' && <button type="button" className="button button--secondary document-action" disabled={busy} onClick={() => void cancelCreditNote(note)}>Anular</button>}
                      <button type="button" className="button button--secondary document-action" onClick={() => setSheetDocumentId(note.id)}>Ver</button>
                      {note.document_number && <button type="button" className="button button--secondary document-action" disabled={busy} onClick={() => void downloadPdf(note)}>PDF</button>}
                    </span></td>
                  </tr>
                ))}
                {!creditNotes.length && <tr><td className="ops-table-empty" colSpan={6}>Ainda não existem notas de crédito. Emita a primeira a partir de uma fatura.</td></tr>}
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
