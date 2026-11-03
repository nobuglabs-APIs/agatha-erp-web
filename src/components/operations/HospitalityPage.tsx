import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Page } from '../../api/types';
import { dateTime, getErrorMessage, money } from './shared';

interface Room {
  id: string;
  code: string;
  name: string;
  room_type: string;
  capacity: number;
  base_rate_cents: number;
  status: string;
}

interface Reservation {
  id: string;
  number: string;
  room_id: string;
  room_code: string;
  room_name: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  status: string;
  total_cents: number;
  paid_cents: number;
}

interface HousekeepingTask {
  id: string;
  room_id: string;
  room_code: string;
  task_type: string;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
}

const paymentMethods = [
  ['cash', 'Dinheiro'],
  ['multicaixa_express', 'Multicaixa Express'],
  ['card', 'Cartão'],
  ['bank_transfer', 'Transferência'],
  ['other', 'Outro'],
];

function today() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 10);
}

function nextDay() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function HospitalityPage({ companyId }: { companyId: string }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkInDate, setCheckInDate] = useState(today());
  const [checkOutDate, setCheckOutDate] = useState(nextDay());
  const [guestCount, setGuestCount] = useState(2);
  const [childCount, setChildCount] = useState(0);
  const [availabilityError, setAvailabilityError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roomRows, reservationPage, housekeepingPage] = await Promise.all([
        request<Room[]>('/hospitality/rooms', { companyId }),
        request<Page<Reservation>>('/hospitality/reservations?page=1&per_page=100', { companyId }),
        request<Page<HousekeepingTask>>('/hospitality/housekeeping?page=1&per_page=100', { companyId }),
      ]);
      setRooms(roomRows);
      setReservations(reservationPage.items);
      setTasks(housekeepingPage.items);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar a operação de hotelaria.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    let active = true;
    if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
      setAvailableRooms([]);
      setAvailabilityError('');
      return () => { active = false; };
    }
    setAvailabilityError('');
    request<Room[]>(
      `/hospitality/availability?check_in=${encodeURIComponent(checkInDate)}&check_out=${encodeURIComponent(checkOutDate)}&capacity=${guestCount + childCount}`,
      { companyId },
    ).then((available) => {
      if (active) setAvailableRooms(available);
    }).catch((reason: unknown) => {
      if (active) {
        setAvailableRooms([]);
        setAvailabilityError(getErrorMessage(reason, 'Não foi possível verificar a disponibilidade.'));
      }
    });
    return () => { active = false; };
  }, [checkInDate, checkOutDate, guestCount, childCount, companyId]);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await request('/hospitality/rooms', {
        method: 'POST',
        companyId,
        body: {
          code: String(data.get('code') || '').trim(),
          name: String(data.get('name') || '').trim(),
          room_type: String(data.get('room_type') || '').trim(),
          capacity: Number(data.get('capacity')),
          base_rate_cents: Math.round(Number(data.get('rate') || 0) * 100),
          status: 'available',
          notes: null,
        },
      });
      form.reset();
      setNotice('Quarto adicionado.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar o quarto.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRoomMaintenance(room: Room) {
    const status = room.status === 'maintenance' ? 'available' : 'maintenance';
    setBusy(true);
    setError('');
    try {
      await request(`/hospitality/rooms/${room.id}`, {
        method: 'PUT',
        companyId,
        body: {
          code: room.code,
          name: room.name,
          room_type: room.room_type,
          capacity: room.capacity,
          base_rate_cents: room.base_rate_cents,
          status,
          notes: null,
        },
      });
      setNotice(status === 'maintenance' ? `Quarto ${room.code} marcado para manutenção.` : `Quarto ${room.code} voltou a ficar disponível.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar o estado do quarto.'));
    } finally {
      setBusy(false);
    }
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const result = await request<Reservation>('/hospitality/reservations', {
        method: 'POST',
        companyId,
        body: {
          room_id: String(data.get('room_id') || ''),
          customer_id: null,
          guest_name: String(data.get('guest_name') || '').trim(),
          guest_email: String(data.get('guest_email') || '').trim() || null,
          guest_phone: String(data.get('guest_phone') || '').trim() || null,
          check_in_date: String(data.get('check_in_date') || ''),
          check_out_date: String(data.get('check_out_date') || ''),
          adults: Number(data.get('adults')),
          children: Number(data.get('children') || 0),
          tax_rate_bp: Math.round(Number(data.get('tax') || 0) * 100),
          notes: null,
        },
      });
      form.reset();
      setNotice(`Reserva ${result.number} criada no valor de ${money(result.total_cents)}.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível criar a reserva.'));
    } finally {
      setBusy(false);
    }
  }

  async function reservationAction(reservation: Reservation, action: 'confirm' | 'check-in' | 'check-out' | 'cancel' | 'no-show') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/hospitality/reservations/${reservation.id}/${action}`, {
        method: 'POST',
        companyId,
        ...(action === 'cancel' ? { body: { reason: 'Cancelada pelo operador.' } } : {}),
      });
      setNotice(`Reserva ${reservation.number}: ${action === 'check-in' ? 'check-in' : action === 'check-out' ? 'check-out' : action === 'confirm' ? 'confirmada' : action === 'no-show' ? 'não comparência registada' : 'cancelada'}.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar a reserva.'));
    } finally {
      setBusy(false);
    }
  }

  async function receivePayment(event: FormEvent<HTMLFormElement>, reservation: Reservation) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Math.round(Number(data.get('amount') || 0) * 100);
    if (amount <= 0 || amount > reservation.total_cents - reservation.paid_cents) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/hospitality/reservations/${reservation.id}/payments`, {
        method: 'POST',
        companyId,
        body: {
          method: paymentMethod,
          amount_cents: amount,
          reference: String(data.get('reference') || '').trim() || null,
          notes: null,
        },
      });
      setNotice(`Pagamento de ${money(amount)} registado para a reserva ${reservation.number}.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível registar o pagamento.'));
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task: HousekeepingTask, status: 'in_progress' | 'done') {
    setBusy(true);
    setError('');
    try {
      await request(`/hospitality/housekeeping/${task.id}`, {
        method: 'PATCH',
        companyId,
        body: { status },
      });
      setNotice(status === 'done' ? `Tarefa do quarto ${task.room_code} concluída.` : 'Tarefa iniciada.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível atualizar a tarefa.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">HOTELARIA</span><h1>Quartos e reservas</h1><p>Gira disponibilidade, hóspedes, estadias, pagamentos e housekeeping.</p></div>
        <button type="button" className="ops-icon-button" aria-label="Atualizar hotelaria" onClick={() => void loadData()}>↻</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar hotelaria…</div> : (
        <>
          <section className="ops-metrics ops-metric-grid--three">
            <article className="ops-metric"><span className="ops-metric__label">Quartos</span><strong>{rooms.length}</strong><small>{rooms.filter((room) => room.status === 'available').length} disponíveis</small></article>
            <article className="ops-metric"><span className="ops-metric__label">Reservas</span><strong>{reservations.length}</strong></article>
            <article className="ops-metric"><span className="ops-metric__label">Tarefas pendentes</span><strong>{tasks.filter((task) => task.status === 'pending' || task.status === 'in_progress').length}</strong></article>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Quartos</h2><p>Tarifas base e disponibilidade operacional.</p></div></div>
            <div className="ops-industry-actions">{rooms.map((room) => <article className="ops-industry-action" key={room.id}>
              <strong>{room.code} · {room.name} · {room.room_type}</strong><span>{room.capacity} hóspedes · {money(room.base_rate_cents)}/noite · {room.status}</span>
              {room.status !== 'occupied' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void toggleRoomMaintenance(room)}>{room.status === 'maintenance' ? 'Marcar disponível' : 'Enviar para manutenção'}</button>}
            </article>)}</div>
          </section>

          <section className="ops-industry-grid">
            <form className="ops-card ops-form-grid" onSubmit={(event) => void createRoom(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Adicionar quarto</h2><p>Defina a capacidade e tarifa base por noite.</p></div></div>
              <label className="ops-field"><span>Código</span><input name="code" required maxLength={20} /></label>
              <label className="ops-field"><span>Nome</span><input name="name" required maxLength={120} /></label>
              <label className="ops-field"><span>Tipo</span><input name="room_type" required maxLength={60} placeholder="Standard, suite…" /></label>
              <label className="ops-field"><span>Capacidade</span><input name="capacity" type="number" min="1" max="50" defaultValue="2" required /></label>
              <label className="ops-field"><span>Tarifa por noite (Kz)</span><input name="rate" type="number" min="0" step="0.01" required /></label>
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy}>Adicionar quarto</button></div>
            </form>

            <form className="ops-card ops-form-grid" onSubmit={(event) => void createReservation(event)}>
              <div className="ops-card-heading ops-field--wide"><div><h2>Nova reserva</h2><p>O total é calculado no servidor com tarifa do quarto e número de noites.</p></div></div>
              <label className="ops-field ops-field--wide"><span>Quarto disponível</span><select name="room_id" required defaultValue=""><option value="" disabled>{availableRooms.length ? 'Escolher quarto' : 'Sem disponibilidade para estas datas'}</option>{availableRooms.map((room) => <option key={room.id} value={room.id}>{room.code} · {room.name} · {money(room.base_rate_cents)}/noite</option>)}</select></label>
              <label className="ops-field"><span>Hóspede</span><input name="guest_name" required maxLength={200} /></label>
              <label className="ops-field"><span>Email</span><input name="guest_email" type="email" maxLength={254} /></label>
              <label className="ops-field"><span>Telefone</span><input name="guest_phone" maxLength={40} /></label>
              <label className="ops-field"><span>Adultos</span><input name="adults" type="number" min="1" max="50" value={guestCount} onChange={(event) => setGuestCount(Math.max(1, Number(event.target.value)))} required /></label>
              <label className="ops-field"><span>Crianças</span><input name="children" type="number" min="0" max="50" value={childCount} onChange={(event) => setChildCount(Math.max(0, Number(event.target.value)))} /></label>
              <label className="ops-field"><span>Imposto (%)</span><input name="tax" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
              <label className="ops-field"><span>Check-in</span><input name="check_in_date" type="date" min={today()} value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} required /></label>
              <label className="ops-field"><span>Check-out</span><input name="check_out_date" type="date" min={checkInDate} value={checkOutDate} onChange={(event) => setCheckOutDate(event.target.value)} required /></label>
              {availabilityError && <small className="ops-form-help ops-field--wide">{availabilityError}</small>}
              <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || !availableRooms.length || checkOutDate <= checkInDate}>Criar reserva</button></div>
            </form>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Reservas</h2><p>{reservations.length} registos</p></div>
              <label className="ops-field"><span>Meio de pagamento</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Reserva</th><th>Hóspede</th><th>Quarto</th><th>Estadia</th><th>Total/pago</th><th>Estado e ações</th></tr></thead><tbody>
              {reservations.map((reservation) => <tr key={reservation.id}>
                <td>{reservation.number}<small>{reservation.adults} adulto(s), {reservation.children} criança(s)</small></td>
                <td>{reservation.guest_name}<small>{reservation.guest_email || reservation.guest_phone || '—'}</small></td>
                <td>{reservation.room_code} · {reservation.room_name}</td>
                <td>{reservation.check_in_date}<small>até {reservation.check_out_date}</small></td>
                <td>{money(reservation.total_cents)}<small>pago {money(reservation.paid_cents)}</small></td>
                <td><span>{reservation.status}</span><div className="ops-industry-actions">
                  {reservation.status === 'pending' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void reservationAction(reservation, 'confirm')}>Confirmar</button>}
                  {reservation.status === 'confirmed' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void reservationAction(reservation, 'check-in')}>Check-in</button>}
                  {reservation.status === 'checked_in' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void reservationAction(reservation, 'check-out')}>Check-out</button>}
                  {['pending', 'confirmed'].includes(reservation.status) && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void reservationAction(reservation, 'cancel')}>Cancelar</button>}
                  {['pending', 'confirmed'].includes(reservation.status) && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void reservationAction(reservation, 'no-show')}>Não compareceu</button>}
                  {!['cancelled', 'checked_out', 'no_show'].includes(reservation.status) && reservation.total_cents > reservation.paid_cents && <form className="ops-industry-inline-form" onSubmit={(event) => void receivePayment(event, reservation)}>
                    <input name="amount" aria-label="Valor recebido" type="number" min="0.01" max={((reservation.total_cents - reservation.paid_cents) / 100).toFixed(2)} step="0.01" placeholder="Valor Kz" required />
                    <input name="reference" aria-label="Referência de pagamento" placeholder="Referência" />
                    <button className="button button--primary" type="submit" disabled={busy}>Receber</button>
                  </form>}
                </div></td>
              </tr>)}
              {!reservations.length && <tr><td className="ops-table-empty" colSpan={6}>Ainda não há reservas.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Housekeeping</h2><p>O check-out cria automaticamente uma tarefa de limpeza.</p></div></div>
            <div className="ops-industry-actions">{tasks.map((task) => <article className="ops-industry-action" key={task.id}>
              <strong>Quarto {task.room_code} · {task.task_type} · {task.priority}</strong><span>{task.status} · {task.notes || dateTime(task.created_at)}</span>
              <div className="ops-form-actions">{task.status === 'pending' && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void updateTask(task, 'in_progress')}>Iniciar</button>}{task.status === 'in_progress' && <button type="button" className="button button--primary" disabled={busy} onClick={() => void updateTask(task, 'done')}>Concluir tarefa</button>}</div>
            </article>)}</div>
            {!tasks.length && <p className="ops-form-help">Sem tarefas de housekeeping pendentes.</p>}
          </section>
        </>
      )}
    </div>
  );
}
