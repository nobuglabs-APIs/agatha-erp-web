export type SalesDocumentType =
  | 'quote'
  | 'order'
  | 'invoice'
  | 'invoice_receipt'
  | 'delivery_note';

export interface DocumentTypeDefinition {
  value: SalesDocumentType;
  label: string;
  shortLabel: string;
  prefix: string;
  description: string;
  stockNote: string;
  usesDueDate: boolean;
  usesValidUntil: boolean;
  collectsPayment: boolean;
}

export const DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  {
    value: 'invoice',
    label: 'Fatura',
    shortLabel: 'Fatura',
    prefix: 'FT',
    description: 'Documento fiscal para pagamento imediato ou a crédito.',
    stockNote: 'Ao emitir, a fatura recebe número fiscal e os artigos controlados são descontados do stock.',
    usesDueDate: true,
    usesValidUntil: false,
    collectsPayment: false,
  },
  {
    value: 'invoice_receipt',
    label: 'Fatura-recibo',
    shortLabel: 'Fatura-recibo',
    prefix: 'FR',
    description: 'Documento fiscal que comprova a venda e o respetivo pagamento.',
    stockNote: 'Ao emitir, a fatura-recibo recebe número fiscal, regista o pagamento e descarrega o stock controlado.',
    usesDueDate: false,
    usesValidUntil: false,
    collectsPayment: true,
  },
  {
    value: 'quote',
    label: 'Proforma',
    shortLabel: 'Proforma',
    prefix: 'ORC',
    description: 'Proposta ou orçamento comercial, sem efeito fiscal.',
    stockNote: 'A proforma não movimenta stock nem gera obrigações fiscais.',
    usesDueDate: false,
    usesValidUntil: true,
    collectsPayment: false,
  },
  {
    value: 'order',
    label: 'Encomenda',
    shortLabel: 'Encomenda',
    prefix: 'ENC',
    description: 'Registo da encomenda do cliente, para preparação e entrega.',
    stockNote: 'A encomenda não movimenta stock; a guia de remessa ou a fatura tratam da saída.',
    usesDueDate: false,
    usesValidUntil: false,
    collectsPayment: false,
  },
  {
    value: 'delivery_note',
    label: 'Guia de remessa',
    shortLabel: 'Guia',
    prefix: 'GR',
    description: 'Documento logístico que acompanha a mercadoria entregue.',
    stockNote: 'Ao emitir, a guia de remessa descarrega o stock controlado.',
    usesDueDate: false,
    usesValidUntil: false,
    collectsPayment: false,
  },
];

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: 'Fatura',
  invoice_receipt: 'Fatura-recibo',
  quote: 'Proforma',
  order: 'Encomenda',
  delivery_note: 'Guia de remessa',
  receipt: 'Recibo',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
};

export function documentTypeDefinition(value: string): DocumentTypeDefinition | undefined {
  return DOCUMENT_TYPES.find((type) => type.value === value);
}

export function documentTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Documento';
  return DOCUMENT_TYPE_LABELS[value] || value;
}
