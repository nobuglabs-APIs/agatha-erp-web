import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { request, requestBlob } from '../../api/client';
import { Icon } from '../Icon';
import type { Company } from '../../api/types';
import { getErrorMessage, money } from './shared';

export interface SalesDocumentLine {
  id: string;
  description: string;
  sku: string | null;
  unit_symbol: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  tax_rate_bp: number;
  line_subtotal_cents: number;
  line_tax_cents: number;
  line_total_cents: number;
}

export interface SalesDocumentPayment {
  id: string;
  method: string;
  amount_cents: number;
  reference: string | null;
}

export interface SalesDocumentDetail {
  id: string;
  doc_type: string;
  document_number: string | null;
  status: string;
  customer_name: string | null;
  customer_nif: string | null;
  customer_address: string | null;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  cancel_reason: string | null;
  issued_at: string | null;
  items: SalesDocumentLine[];
  payments: SalesDocumentPayment[];
}

const typeLabels: Record<string, string> = {
  invoice: 'Fatura',
  invoice_receipt: 'Fatura-recibo',
  receipt: 'Recibo',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
  quote: 'Orçamento',
  order: 'Encomenda',
  delivery_note: 'Guia de remessa',
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  issued: 'Emitida',
  partially_paid: 'Parcialmente paga',
  paid: 'Paga',
  cancelled: 'Anulada',
};

const paymentLabels: Record<string, string> = {
  cash: 'Dinheiro',
  multicaixa_express: 'Multicaixa Express',
  card: 'Cartão',
  bank_transfer: 'Transferência bancária',
  other: 'Outro',
};

function formatRate(bps: number): string {
  return `${(bps / 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;
}

function formatMoment(value: string): string {
  return new Date(value).toLocaleString('pt-AO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-AO');
}

function groupTaxes(lines: SalesDocumentLine[]) {
  const grouped = new Map<number, { rate: number; base: number; tax: number }>();
  for (const line of lines) {
    const row = grouped.get(line.tax_rate_bp) ?? { rate: line.tax_rate_bp, base: 0, tax: 0 };
    row.base += line.line_subtotal_cents;
    row.tax += line.line_tax_cents;
    grouped.set(line.tax_rate_bp, row);
  }
  return [...grouped.values()].sort((left, right) => right.rate - left.rate);
}

/**
 * Folha A4 de um documento comercial. Busca o documento e o emitente por ID,
 * para que qualquer lista possa abrir a fatura com uma única chamada ao estado.
 */
export function DocumentSheet({
  companyId,
  documentId,
  onClose,
}: {
  companyId: string;
  documentId: string;
  onClose: () => void;
}) {
  const [document, setDocument] = useState<SalesDocumentDetail | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [detail, currentCompany] = await Promise.all([
        request<SalesDocumentDetail>(`/sales/documents/${documentId}`, { companyId }),
        request<Company>('/company', { companyId }).catch(() => null),
      ]);
      setDocument(detail);
      setCompany(currentCompany);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível abrir o documento.'));
    }
  }, [companyId, documentId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function downloadPdf() {
    if (!document?.document_number) return;
    setDownloading(true);
    setError('');
    try {
      const pdf = await requestBlob(`/sales/documents/${document.id}/pdf`, companyId);
      const url = URL.createObjectURL(pdf);
      const link = window.document.createElement('a');
      const name = document.document_number.replace(/[\\/:*?"<>|]/g, '-');
      link.href = url;
      link.download = `${name}.pdf`;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível descarregar o PDF.'));
    } finally {
      setDownloading(false);
    }
  }

  const issuerName = company ? company.trade_name || company.legal_name : '';
  const issuerLocation = company
    ? [company.address, company.city, company.province, company.country].filter(Boolean).join(', ')
    : '';
  const cancelled = document?.status === 'cancelled';
  const title = document ? `${typeLabels[document.doc_type] || document.doc_type} ${document.document_number || '(rascunho)'}` : 'Documento';

  return createPortal(
    <div className="invoice-overlay" role="dialog" aria-label={title} aria-modal="true">
      <div className="invoice-overlay__bar">
        <div>
          <strong>{title}</strong>
          <small>
            {document ? `${document.customer_name || 'Consumidor final'} · ${money(document.total_cents)}` : 'A carregar documento…'}
          </small>
        </div>
        <div className="invoice-overlay__actions">
          {document?.document_number && (
            <button className="invoice-overlay__button" disabled={downloading} onClick={() => void downloadPdf()} type="button">
              <Icon name="download" size={15} /> {downloading ? 'A preparar…' : 'PDF'}
            </button>
          )}
          <button className="invoice-overlay__button invoice-overlay__button--primary" disabled={!document} onClick={() => window.print()} type="button">
            <Icon name="printer" size={15} /> Imprimir
          </button>
          <button className="invoice-overlay__close" aria-label="Fechar documento" onClick={onClose} type="button">
            <Icon name="close" size={17} />
          </button>
        </div>
      </div>

      <div className="invoice-overlay__scroll">
        {error && <div className="invoice-overlay__error" role="alert">{error}<button onClick={() => void load()} type="button">Tentar novamente</button></div>}
        {!document && !error && <div className="invoice-overlay__loading"><span className="loading-dot" />A preparar documento…</div>}

        {document && (
          <article className="invoice-sheet" id="printable-invoice">
            <header className="inv-head">
              <div className="inv-issuer">
                <span className="inv-issuer__mark">ÁGATA ERP</span>
                <strong>{issuerName || 'Empresa'}</strong>
                {issuerLocation && <span>{issuerLocation}</span>}
                <span>
                  {company?.nif ? `NIF ${company.nif}` : 'NIF não configurado'}
                  {company?.phone ? ` · Tel. ${company.phone}` : ''}
                </span>
                {company?.email && <span>{company.email}</span>}
              </div>
              <div className="inv-title">
                <span className="inv-title__kind">{typeLabels[document.doc_type] || document.doc_type}</span>
                <strong>{document.document_number || 'Rascunho'}</strong>
                <span className={`inv-badge inv-badge--${cancelled ? 'cancelled' : 'issued'}`}>
                  {statusLabels[document.status] || document.status}
                </span>
                <small>
                  {document.issued_at ? `Emitida em ${formatMoment(document.issued_at)}` : `Data ${formatDay(document.issue_date)}`}
                </small>
              </div>
            </header>

            <section className="inv-parties">
              <div>
                <small>Cliente</small>
                <strong>{document.customer_name || 'Consumidor final'}</strong>
                <span>{document.customer_nif ? `NIF ${document.customer_nif}` : 'Sem NIF'}</span>
                {document.customer_address && <span>{document.customer_address}</span>}
              </div>
              <div>
                <small>Datas</small>
                <span>Emissão {formatDay(document.issue_date)}</span>
                <span>Vencimento {formatDay(document.due_date)}</span>
                {cancelled && <span>Anulada em {formatDay(document.issued_at)}</span>}
              </div>
            </section>

            <table className="inv-table">
              <thead>
                <tr>
                  <th className="inv-col-number">#</th>
                  <th>Descrição</th>
                  <th className="inv-col-qty">Qtd.</th>
                  <th className="inv-col-price">Preço unit.</th>
                  <th className="inv-col-tax">IVA</th>
                  <th className="inv-col-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {document.items.map((line, index) => (
                  <tr key={line.id}>
                    <td className="inv-col-number">{index + 1}</td>
                    <td>
                      <strong>{line.description}</strong>
                      <small>{line.sku ? `${line.sku} · ${line.quantity} ${line.unit_symbol}` : `${line.quantity} ${line.unit_symbol}`}</small>
                    </td>
                    <td className="inv-col-qty">{line.quantity}</td>
                    <td className="inv-col-price">{money(line.unit_price_cents)}</td>
                    <td className="inv-col-tax">{formatRate(line.tax_rate_bp)}</td>
                    <td className="inv-col-total">{money(line.line_total_cents)}</td>
                  </tr>
                ))}
                {!document.items.length && (
                  <tr><td colSpan={6} className="inv-table__empty">Documento sem linhas.</td></tr>
                )}
              </tbody>
            </table>

            <div className="inv-totals">
              <div className="inv-totals__taxes">
                {document.payments.length > 0 && (
                  <>
                    <small>Pagamentos</small>
                    {document.payments.map((payment) => (
                      <span key={payment.id}>
                        <span>{paymentLabels[payment.method] || payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</span>
                        <span>{money(payment.amount_cents)}</span>
                      </span>
                    ))}
                  </>
                )}
                {document.items.length > 0 && (
                  <>
                    <small>Resumo de imposto</small>
                    {groupTaxes(document.items).map((row) => (
                      <span key={row.rate}>
                        <span>Base {formatRate(row.rate)} · {money(row.base)}</span>
                        <span>{money(row.tax)}</span>
                      </span>
                    ))}
                  </>
                )}
              </div>
              <div className="inv-totals__rows">
                <div><span>Subtotal</span><strong>{money(document.subtotal_cents)}</strong></div>
                {document.discount_cents > 0 && <div><span>Desconto</span><strong>−{money(document.discount_cents)}</strong></div>}
                <div><span>Impostos</span><strong>{money(document.tax_cents)}</strong></div>
                <div className="inv-totals__grand"><span>Total</span><strong>{money(document.total_cents)}</strong></div>
                <div><span>Recebido</span><strong>{money(document.paid_cents)}</strong></div>
                {document.balance_cents > 0 && <div className="inv-totals__balance"><span>Em falta</span><strong>{money(document.balance_cents)}</strong></div>}
              </div>
            </div>

            {document.notes && <p className="inv-notes">{document.notes}</p>}
            {cancelled && document.cancel_reason && <p className="inv-notes">Motivo de anulação: {document.cancel_reason}</p>}

            <footer className="inv-foot">
              <div className="inv-foot__integrity">
                <Icon name="check" size={13} />
                <span>Documento processado por software certificado</span>
                <code>{document.document_number || 'SEM NÚMERO FISCAL'}</code>
              </div>
              <p>Ágata ERP · Nobug Labs{company?.email ? ` · ${company.email}` : ''}</p>
            </footer>

            {cancelled && <div className="inv-stamp">Anulado</div>}
          </article>
        )}
      </div>
    </div>,
    window.document.body,
  );
}
