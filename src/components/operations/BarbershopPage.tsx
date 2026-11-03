import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import type { Product } from './shared';
import { dateTime, getErrorMessage, money, listPage } from './shared';

interface Professional {
  id: string;
  name: string;
  phone: string | null;
  commission_bp: number;
  is_active: boolean;
}

interface Service {
  id: string;
  product_id: string;
  name: string;
  unit_price_cents: number;
  duration_minutes: number;
  is_active: boolean;
}

interface Appointment {
  id: string;
  number: number;
  professional_id: string;
  professional_name: string;
  service_name: string;
  client_name: string;
  client_phone: string | null;
  start_at: string;
  status: string;
  total_cents: number;
  commission_cents: number;
}

interface CommissionReport {
  total_base_cents: number;
  total_commission_cents: number;
  items: Array<{
    appointment_id: string;
    number: number;
    professional_name: string;
    service_name: string;
    commission_cents: number;
    completed_at: string | null;
  }>;
}

const paymentMethods = [
  ['cash', 'Dinheiro'],
  ['multicaixa_express', 'Multicaixa Express'],
  ['card', 'Cartão'],
  ['bank_transfer', 'Transferência'],
  ['other', 'Outro'],
];

function localDateTimeValue() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export function BarbershopPage({ companyId }: { companyId: string }) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceProducts, setServiceProducts] = useState<Product[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [commissions, setCommissions] = useState<CommissionReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [professionalRows, serviceRows, productPage, appointmentPage, commissionReport] = await Promise.all([
        request<Professional[]>('/barbershop/professionals', { companyId }),
        request<Service[]>('/barbershop/services', { companyId }),
        listPage<Product>('/products', companyId, 100),
        request<Page<Appointment>>('/barbershop/appointments?page=1&per_page=100', { companyId }),
        request<CommissionReport>('/barbershop/commissions', { companyId }),
      ]);
      setProfessionals(professionalRows.filter((item) => item.is_active));
      setServices(serviceRows.filter((item) => item.is_active));
      setServiceProducts(productPage.items.filter((item) => item.product_type === 'service' && item.is_active));
      setAppointments(appointmentPage.items);
      setCommissions(commissionReport);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar a operação da barbearia.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function createProfessional(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await request('/barbershop/professionals', {
        method: 'POST',
        companyId,
        body: {
          name: String(data.get('name') || '').trim(),
          phone: String(data.get('phone') || '').trim() || null,
          email: String(data.get('email') || '').trim() || null,
          commission_bp: Math.round(Number(data.get('commission') || 0) * 100),
          notes: null,
        },
      });
      form.reset();
      setNotice('Profissional adicionado.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível adicionar o profissional.'));
    } finally {
      setBusy(false);
    }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await request('/barbershop/services', {
        method: 'POST',
        companyId,
        body: {
          product_id: String(data.get('product_id') || ''),
          duration_minutes: Number(data.get('duration')),
          is_active: true,
          notes: null,
        },
      });
      form.reset();
      setNotice('Serviço associado ao catálogo.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível configurar o serviço.'));
    } finally {
      setBusy(false);
    }
  }

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const starts = String(data.get('start_at') || '');
    setBusy(true);
    setError('');
    try {
      await request('/barbershop/appointments', {
        method: 'POST',
        companyId,
        body: {
          professional_id: String(data.get('professional_id') || ''),
          service_id: String(data.get('service_id') || ''),
          customer_id: null,
          client_name: String(data.get('client_name') || '').trim() || null,
          client_phone: String(data.get('client_phone') || '').trim() || null,
          start_at: new Date(starts).toISOString(),
          notes: null,
        },
      });
      form.reset();
      setNotice('Marcação criada.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar a marcação.'));
    } finally {
      setBusy(false);
    }
  }

  async function appointmentAction(appointment: Appointment, action: 'confirm' | 'start' | 'complete' | 'no-show' | 'cancel') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/barbershop/appointments/${appointment.id}/${action}`, {
        method: 'POST',
        companyId,
        ...(action === 'complete' ? { body: { payment_method: paymentMethod } } : {}),
        ...(action === 'cancel' ? { body: { reason: 'Cancelada pelo operador.' } } : {}),
      });
      setNotice(action === 'complete' ? `Marcação #${appointment.number} concluída e venda criada.` : `Marcação #${appointment.number} atualizada.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar a marcação.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">BARBEARIA</span><h1>Agenda e serviços</h1><p>Gira profissionais, serviços, marcações e comissões.</p></div>
        <button type="button" className="ops-icon-button" aria-label="Atualizar barbearia" onClick={() => void loadData()}>↻</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar barbearia…</div> : (
        <>
          <section className="ops-metrics ops-metric-grid--three">
            <article className="ops-metric"><span className="ops-metric__label">Profissionais ativos</span><strong>{professionals.length}</strong></article>
            <article className="ops-metric"><span className="ops-metric__label">Marcações</span><strong>{appointments.length}</strong><small>Todos os estados</small></article>
            <article className="ops-metric"><span className="ops-metric__label">Comissões acumuladas</span><strong>{money(commissions?.total_commission_cents || 0)}</strong><small>Base {money(commissions?.total_base_cents || 0)}</small></article>
          </section>

          <section className="ops-industry-grid">
            <form className="ops-card ops-form-grid" onSubmit={(event) => void createProfessional(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Adicionar profissional</h2><p>Defina a taxa de comissão sobre o serviço.</p></div></div>
              <label className="ops-field"><span>Nome</span><input name="name" required maxLength={120} /></label>
              <label className="ops-field"><span>Telefone</span><input name="phone" maxLength={30} /></label>
              <label className="ops-field"><span>Email</span><input name="email" type="email" maxLength={160} /></label>
              <label className="ops-field"><span>Comissão (%)</span><input name="commission" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy}>Adicionar</button></div>
            </form>

            <form className="ops-card ops-form-grid" onSubmit={(event) => void createService(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Configurar serviço</h2><p>O serviço deve existir no catálogo como produto do tipo serviço.</p></div></div>
              <label className="ops-field ops-field--wide"><span>Produto/serviço</span><select name="product_id" required defaultValue=""><option value="" disabled>Escolher do catálogo</option>{serviceProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_cents)}</option>)}</select></label>
              <label className="ops-field"><span>Duração (minutos)</span><input name="duration" type="number" min="1" max="480" defaultValue="30" required /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !serviceProducts.length}>Associar serviço</button></div>
            </form>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Nova marcação</h2><p>O sistema valida automaticamente conflitos de horário.</p></div></div>
            <form className="ops-form-grid" onSubmit={(event) => void createAppointment(event)}>
              <label className="ops-field"><span>Profissional</span><select name="professional_id" required defaultValue=""><option value="" disabled>Escolher</option>{professionals.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              <label className="ops-field"><span>Serviço</span><select name="service_id" required defaultValue=""><option value="" disabled>Escolher</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.duration_minutes} min</option>)}</select></label>
              <label className="ops-field"><span>Cliente</span><input name="client_name" required maxLength={120} /></label>
              <label className="ops-field"><span>Telefone</span><input name="client_phone" maxLength={30} /></label>
              <label className="ops-field"><span>Data e hora</span><input name="start_at" type="datetime-local" min={localDateTimeValue()} defaultValue={localDateTimeValue()} required /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !professionals.length || !services.length}>Criar marcação</button></div>
            </form>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Marcações</h2><p>{appointments.length} registos</p></div>
              <label className="ops-field"><span>Pagamento ao concluir</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Marcação</th><th>Cliente</th><th>Profissional/serviço</th><th>Total</th><th>Estado</th><th>Ações</th></tr></thead><tbody>
              {appointments.map((appointment) => <tr key={appointment.id}>
                <td>#{appointment.number}<small>{dateTime(appointment.start_at)}</small></td>
                <td>{appointment.client_name}<small>{appointment.client_phone || '—'}</small></td>
                <td>{appointment.professional_name}<small>{appointment.service_name}</small></td>
                <td>{money(appointment.total_cents)}</td><td>{appointment.status}</td>
                <td><div className="ops-industry-actions">
                  {appointment.status === 'scheduled' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void appointmentAction(appointment, 'confirm')}>Confirmar</button>}
                  {appointment.status === 'confirmed' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void appointmentAction(appointment, 'start')}>Iniciar</button>}
                  {appointment.status === 'in_progress' && <button className="button button--primary" type="button" disabled={busy} onClick={() => void appointmentAction(appointment, 'complete')}>Concluir e cobrar</button>}
                  {['scheduled', 'confirmed'].includes(appointment.status) && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void appointmentAction(appointment, 'no-show')}>Falta</button>}
                  {['scheduled', 'confirmed', 'in_progress'].includes(appointment.status) && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void appointmentAction(appointment, 'cancel')}>Cancelar</button>}
                </div></td>
              </tr>)}
              {!appointments.length && <tr><td className="ops-table-empty" colSpan={6}>Ainda não há marcações.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Comissões</h2><p>Marcações concluídas e respectivas comissões.</p></div></div>
            <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Marcação</th><th>Profissional</th><th>Serviço</th><th>Concluída</th><th>Comissão</th></tr></thead><tbody>
              {(commissions?.items || []).map((item) => <tr key={item.appointment_id}><td>#{item.number}</td><td>{item.professional_name}</td><td>{item.service_name}</td><td>{item.completed_at ? dateTime(item.completed_at) : '—'}</td><td>{money(item.commission_cents)}</td></tr>)}
              {!commissions?.items.length && <tr><td className="ops-table-empty" colSpan={5}>Ainda não existem comissões calculadas.</td></tr>}
            </tbody></table></div>
          </section>
        </>
      )}
    </div>
  );
}
