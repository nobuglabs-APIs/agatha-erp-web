import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import type { Product } from './shared';
import { dateTime, getErrorMessage, listPage, money } from './shared';

interface PharmacyProduct {
  product_id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  stock_quantity: number;
  active_ingredient: string | null;
  dosage_form: string | null;
  strength: string | null;
  prescription_required: boolean;
  controlled_schedule: string;
  is_active: boolean;
}

interface PharmacyBatch {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  batch_number: string;
  expiry_date: string;
  quantity_remaining: number;
  cost_price_cents: number;
  supplier_name: string | null;
}

interface Prescription {
  id: string;
  number: number;
  patient_name: string;
  doctor_name: string;
  issued_on: string;
  valid_until: string | null;
  status: string;
}

interface PharmacyStock {
  product_id: string;
  sku: string;
  name: string;
  stock_quantity: number;
  prescription_required: boolean;
  controlled_schedule: string;
  batch_count: number;
  nearest_expiry: string | null;
}

interface Dispense {
  id: string;
  number: number;
  patient_name: string;
  status: string;
  total_cents: number;
  created_at: string;
}

interface ControlledDispense {
  dispense_id: string;
  dispense_number: number;
  dispensed_at: string;
  patient_name: string;
  doctor_name: string | null;
  product_name: string;
  quantity: number;
  batch_numbers: string | null;
}

const paymentMethods = [
  ['cash', 'Dinheiro'],
  ['multicaixa_express', 'Multicaixa Express'],
  ['card', 'Cartão'],
  ['bank_transfer', 'Transferência'],
  ['other', 'Outro'],
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PharmacyPage({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [configured, setConfigured] = useState<PharmacyProduct[]>([]);
  const [batches, setBatches] = useState<PharmacyBatch[]>([]);
  const [expiring, setExpiring] = useState<PharmacyBatch[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [stock, setStock] = useState<PharmacyStock[]>([]);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [controlled, setControlled] = useState<ControlledDispense[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productPage, configuredRows, batchRows, expiringRows, prescriptionPage, stockRows, dispensePage, controlledPage] = await Promise.all([
        listPage<Product>('/products', companyId, 100),
        request<PharmacyProduct[]>('/pharmacy/products', { companyId }),
        request<PharmacyBatch[]>('/pharmacy/batches', { companyId }),
        request<PharmacyBatch[]>('/pharmacy/expiring?days=90', { companyId }),
        request<Page<Prescription>>('/pharmacy/prescriptions?page=1&per_page=100', { companyId }),
        request<PharmacyStock[]>('/pharmacy/stock', { companyId }),
        request<Page<Dispense>>('/pharmacy/dispenses?page=1&per_page=100', { companyId }),
        request<Page<ControlledDispense>>('/pharmacy/controlled?page=1&per_page=100', { companyId }),
      ]);
      setProducts(productPage.items.filter((item) => item.product_type === 'goods' && item.track_stock && item.is_active));
      setConfigured(configuredRows);
      setBatches(batchRows);
      setExpiring(expiringRows);
      setPrescriptions(prescriptionPage.items);
      setStock(stockRows);
      setDispenses(dispensePage.items);
      setControlled(controlledPage.items);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar a operação da farmácia.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function configureProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const productId = String(data.get('product_id') || '');
    setBusy(true);
    setError('');
    try {
      await request(`/pharmacy/products/${productId}`, {
        method: 'PUT',
        companyId,
        body: {
          active_ingredient: String(data.get('active_ingredient') || '').trim() || null,
          dosage_form: String(data.get('dosage_form') || '').trim() || null,
          strength: String(data.get('strength') || '').trim() || null,
          prescription_required: data.get('prescription_required') === 'on',
          controlled_schedule: String(data.get('controlled_schedule') || 'none'),
          default_shelf_life_days: Number(data.get('shelf_life') || 0) || null,
          notes: null,
        },
      });
      form.reset();
      setNotice('Produto configurado para a farmácia.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível configurar o produto.'));
    } finally {
      setBusy(false);
    }
  }

  async function receiveBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await request('/pharmacy/batches', {
        method: 'POST',
        companyId,
        body: {
          product_id: String(data.get('product_id') || ''),
          batch_number: String(data.get('batch_number') || '').trim(),
          expiry_date: String(data.get('expiry_date') || ''),
          quantity: Number(data.get('quantity')),
          cost_price_cents: Math.round(Number(data.get('cost') || 0) * 100),
          supplier_name: String(data.get('supplier') || '').trim() || null,
          notes: null,
        },
      });
      form.reset();
      setNotice('Lote recebido e stock atualizado.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível receber o lote.'));
    } finally {
      setBusy(false);
    }
  }

  async function createPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const productId = String(data.get('product_id') || '');
    setBusy(true);
    setError('');
    try {
      await request('/pharmacy/prescriptions', {
        method: 'POST',
        companyId,
        body: {
          customer_id: null,
          patient_name: String(data.get('patient_name') || '').trim(),
          patient_document: String(data.get('patient_document') || '').trim() || null,
          doctor_name: String(data.get('doctor_name') || '').trim(),
          doctor_license: String(data.get('doctor_license') || '').trim() || null,
          issued_on: String(data.get('issued_on') || ''),
          valid_until: String(data.get('valid_until') || '') || null,
          notes: null,
          items: [{ product_id: productId, quantity: Number(data.get('quantity')), dosage: String(data.get('dosage') || '').trim() || null }],
        },
      });
      form.reset();
      setNotice('Prescrição registada.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível registar a prescrição.'));
    } finally {
      setBusy(false);
    }
  }

  async function dispense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const idempotencyKey = crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      const result = await request<{ number: number }>('/pharmacy/dispenses', {
        method: 'POST',
        companyId,
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          prescription_id: String(data.get('prescription_id') || '') || null,
          customer_id: null,
          patient_name: String(data.get('patient_name') || '').trim() || null,
          payment_method: String(data.get('payment_method') || 'cash'),
          items: [{ product_id: String(data.get('product_id') || ''), quantity: Number(data.get('quantity')) }],
        },
      });
      form.reset();
      setNotice(`Dispensa #${result.number} concluída; os lotes foram consumidos por validade (FEFO).`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível concluir a dispensa.'));
    } finally {
      setBusy(false);
    }
  }

  const unconfigured = products.filter((product) => !configured.some((item) => item.product_id === product.id));

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">FARMÁCIA</span><h1>Lotes e dispensas</h1><p>Configure medicamentos, receba lotes e registe prescrições e dispensas.</p></div>
        <button type="button" className="ops-icon-button" aria-label="Atualizar farmácia" onClick={() => void loadData()}>↻</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar farmácia…</div> : (
        <>
          <section className="ops-metrics ops-metric-grid--three">
            <article className="ops-metric"><span className="ops-metric__label">Produtos configurados</span><strong>{configured.length}</strong></article>
            <article className="ops-metric"><span className="ops-metric__label">Lotes ativos</span><strong>{batches.length}</strong></article>
            <article className="ops-metric"><span className="ops-metric__label">A expirar em 90 dias</span><strong>{expiring.length}</strong></article>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Stock farmacêutico</h2><p>Saldo, lotes disponíveis e validade mais próxima.</p></div></div>
            <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Medicamento</th><th>Stock</th><th>Lotes</th><th>Validade próxima</th><th>Controlo</th></tr></thead><tbody>
              {stock.map((item) => <tr key={item.product_id}><td>{item.name}<small>{item.sku}</small></td><td>{item.stock_quantity}</td><td>{item.batch_count}</td><td>{item.nearest_expiry || '—'}</td><td>{item.controlled_schedule === 'none' ? item.prescription_required ? 'Com prescrição' : 'Livre' : item.controlled_schedule}</td></tr>)}
              {!stock.length && <tr><td className="ops-table-empty" colSpan={5}>Configure produtos e receba lotes para iniciar o stock farmacêutico.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="ops-industry-grid">
            <form className="ops-card ops-form-grid" onSubmit={(event) => void configureProduct(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Configurar medicamento</h2><p>Escolha um produto de stock e adicione os dados farmacêuticos.</p></div></div>
              <label className="ops-field ops-field--wide"><span>Produto</span><select name="product_id" required defaultValue=""><option value="" disabled>Escolher produto</option>{unconfigured.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
              <label className="ops-field"><span>Princípio ativo</span><input name="active_ingredient" maxLength={200} /></label>
              <label className="ops-field"><span>Forma farmacêutica</span><input name="dosage_form" maxLength={80} placeholder="Comprimido, xarope…" /></label>
              <label className="ops-field"><span>Dosagem</span><input name="strength" maxLength={80} placeholder="500 mg" /></label>
              <label className="ops-field"><span>Validade padrão (dias)</span><input name="shelf_life" type="number" min="1" max="3650" /></label>
              <label className="ops-field"><span>Controlo</span><select name="controlled_schedule"><option value="none">Não controlado</option><option value="schedule_i">Escalão I</option><option value="schedule_ii">Escalão II</option><option value="schedule_iii">Escalão III</option><option value="schedule_iv">Escalão IV</option></select></label>
              <label className="ops-industry-primary"><input name="prescription_required" type="checkbox" /><span>Exige prescrição</span></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !unconfigured.length}>Configurar produto</button></div>
            </form>

            <form className="ops-card ops-form-grid" onSubmit={(event) => void receiveBatch(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Receber lote</h2><p>A receção atualiza stock e regista a validade.</p></div></div>
              <label className="ops-field ops-field--wide"><span>Produto configurado</span><select name="product_id" required defaultValue=""><option value="" disabled>Escolher produto</option>{configured.map((product) => <option key={product.product_id} value={product.product_id}>{product.name} · {product.sku}</option>)}</select></label>
              <label className="ops-field"><span>Número do lote</span><input name="batch_number" required maxLength={80} /></label>
              <label className="ops-field"><span>Validade</span><input name="expiry_date" type="date" min={today()} required /></label>
              <label className="ops-field"><span>Quantidade</span><input name="quantity" type="number" min="1" required /></label>
              <label className="ops-field"><span>Custo unitário (Kz)</span><input name="cost" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label className="ops-field"><span>Fornecedor</span><input name="supplier" maxLength={160} /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !configured.length}>Receber lote</button></div>
            </form>
          </section>

          <section className="ops-industry-grid">
            <form className="ops-card ops-form-grid" onSubmit={(event) => void createPrescription(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Nova prescrição</h2><p>Registe o paciente, médico e pelo menos um medicamento.</p></div></div>
              <label className="ops-field"><span>Paciente</span><input name="patient_name" required maxLength={160} /></label>
              <label className="ops-field"><span>Documento do paciente</span><input name="patient_document" maxLength={80} /></label>
              <label className="ops-field"><span>Médico</span><input name="doctor_name" required maxLength={160} /></label>
              <label className="ops-field"><span>Cédula do médico</span><input name="doctor_license" maxLength={80} /></label>
              <label className="ops-field"><span>Emitida em</span><input name="issued_on" type="date" defaultValue={today()} required /></label>
              <label className="ops-field"><span>Válida até</span><input name="valid_until" type="date" /></label>
              <label className="ops-field"><span>Medicamento</span><select name="product_id" required defaultValue=""><option value="" disabled>Escolher</option>{configured.filter((product) => product.prescription_required || product.controlled_schedule !== 'none').map((product) => <option key={product.product_id} value={product.product_id}>{product.name}</option>)}</select></label>
              <label className="ops-field"><span>Quantidade</span><input name="quantity" type="number" min="1" defaultValue="1" required /></label>
              <label className="ops-field ops-field--wide"><span>Posologia</span><input name="dosage" maxLength={500} placeholder="Ex.: 1 comprimido de 8 em 8 horas" /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy}>Registar prescrição</button></div>
            </form>

            <form className="ops-card ops-form-grid" onSubmit={(event) => void dispense(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Dispensar produto</h2><p>O sistema escolhe os lotes válidos por FEFO.</p></div></div>
              <label className="ops-field ops-field--wide"><span>Medicamento</span><select name="product_id" required defaultValue=""><option value="" disabled>Escolher produto</option>{configured.map((product) => <option key={product.product_id} value={product.product_id}>{product.name} · stock {product.stock_quantity}</option>)}</select></label>
              <label className="ops-field"><span>Quantidade</span><input name="quantity" type="number" min="1" defaultValue="1" required /></label>
              <label className="ops-field"><span>Prescrição (opcional)</span><select name="prescription_id" defaultValue=""><option value="">Sem prescrição</option>{prescriptions.filter((item) => item.status === 'open' || item.status === 'partially_dispensed').map((item) => <option key={item.id} value={item.id}>#{item.number} · {item.patient_name}</option>)}</select></label>
              <label className="ops-field"><span>Paciente</span><input name="patient_name" maxLength={160} /></label>
              <label className="ops-field"><span>Pagamento</span><select name="payment_method">{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !configured.length}>Concluir dispensa</button></div>
            </form>
          </section>

          <section className="ops-industry-grid">
            <section className="ops-card"><div className="ops-card-heading"><div><h2>Lotes e validade</h2><p>{batches.length} lotes com saldo</p></div></div>
              <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Produto/lote</th><th>Validade</th><th>Saldo</th><th>Fornecedor</th></tr></thead><tbody>
                {batches.map((batch) => <tr key={batch.id}><td>{batch.product_name}<small>{batch.batch_number}</small></td><td>{batch.expiry_date}</td><td>{batch.quantity_remaining}</td><td>{batch.supplier_name || '—'}</td></tr>)}
                {!batches.length && <tr><td className="ops-table-empty" colSpan={4}>Ainda não há lotes registados.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="ops-card"><div className="ops-card-heading"><div><h2>Prescrições</h2><p>{prescriptions.length} prescrições</p></div></div>
              <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Número/paciente</th><th>Médico</th><th>Emitida</th><th>Estado</th></tr></thead><tbody>
                {prescriptions.map((item) => <tr key={item.id}><td>#{item.number}<small>{item.patient_name}</small></td><td>{item.doctor_name}</td><td>{item.issued_on}</td><td>{item.status}</td></tr>)}
                {!prescriptions.length && <tr><td className="ops-table-empty" colSpan={4}>Ainda não há prescrições.</td></tr>}
              </tbody></table></div>
            </section>
          </section>
          <section className="ops-industry-grid">
            <section className="ops-card"><div className="ops-card-heading"><div><h2>Dispensas recentes</h2><p>{dispenses.length} registos</p></div></div>
              <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Dispensa</th><th>Paciente</th><th>Valor</th><th>Estado</th><th>Data</th></tr></thead><tbody>
                {dispenses.map((item) => <tr key={item.id}><td>#{item.number}</td><td>{item.patient_name}</td><td>{money(item.total_cents)}</td><td>{item.status}</td><td>{dateTime(item.created_at)}</td></tr>)}
                {!dispenses.length && <tr><td className="ops-table-empty" colSpan={5}>Ainda não há dispensas.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="ops-card"><div className="ops-card-heading"><div><h2>Registo de medicamentos controlados</h2><p>Rastreabilidade por paciente, medicamento e lote.</p></div></div>
              <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Dispensa</th><th>Paciente/médico</th><th>Medicamento</th><th>Quantidade</th><th>Lotes/data</th></tr></thead><tbody>
                {controlled.map((item) => <tr key={`${item.dispense_id}-${item.product_name}`}><td>#{item.dispense_number}</td><td>{item.patient_name}<small>{item.doctor_name || '—'}</small></td><td>{item.product_name}</td><td>{item.quantity}</td><td>{item.batch_numbers || '—'}<small>{dateTime(item.dispensed_at)}</small></td></tr>)}
                {!controlled.length && <tr><td className="ops-table-empty" colSpan={5}>Ainda não há dispensas de medicamentos controlados.</td></tr>}
              </tbody></table></div>
            </section>
          </section>
          {!!expiring.length && <div className="ops-alert" role="status">{expiring.length} lote(s) expiram nos próximos 90 dias. Reveja a lista de lotes e priorize a dispensa.</div>}
        </>
      )}
    </div>
  );
}

export type { PharmacyProduct };
