import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import { getErrorMessage, money, parseAmountCents } from './shared';

interface CashSession {
  id: string;
  status: 'open' | 'closed';
  opening_cash_cents: number;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  difference_cents: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

interface CashMovement {
  id: string;
  movement_type: 'inflow' | 'outflow';
  amount_cents: number;
  description: string;
  created_at: string;
}

export function CashRegisterPage({ companyId }: { companyId: string }) {
  const [session, setSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [openingAmount, setOpeningAmount] = useState('0.00');
  const [countedAmount, setCountedAmount] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementType, setMovementType] = useState<'inflow' | 'outflow'>('outflow');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const active = await request<CashSession | null>('/cash-register/active', { companyId });
      setSession(active);
      if (active) {
        const rows = await request<CashMovement[]>(`/cash-register/sessions/${active.id}/movements`, { companyId });
        setMovements(rows);
        setCountedAmount(((active.expected_cash_cents || 0) / 100).toFixed(2));
      } else {
        setMovements([]);
        setCountedAmount('');
      }
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar o estado do caixa.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function openSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const openingCash = parseAmountCents(openingAmount);
    if (openingCash === null || openingCash < 0) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<CashSession>('/cash-register/sessions', {
        method: 'POST',
        companyId,
        body: { opening_cash_cents: openingCash },
      });
      setNotice('Caixa aberto. Os pagamentos em dinheiro serão associados a esta sessão.');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível abrir o caixa.'));
    } finally {
      setBusy(false);
    }
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const amount = parseAmountCents(movementAmount);
    if (!amount || description.trim().length < 2) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request<CashMovement>(`/cash-register/sessions/${session.id}/movements`, {
        method: 'POST',
        companyId,
        body: { movement_type: movementType, amount_cents: amount, description: description.trim() },
      });
      setNotice(movementType === 'inflow' ? 'Entrada de caixa registada.' : 'Saída de caixa registada.');
      setMovementAmount('');
      setDescription('');
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível registar o movimento de caixa.'));
    } finally {
      setBusy(false);
    }
  }

  async function closeSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const counted = parseAmountCents(countedAmount);
    if (counted === null || counted < 0) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const closed = await request<CashSession>(`/cash-register/sessions/${session.id}/close`, {
        method: 'POST',
        companyId,
        body: { counted_cash_cents: counted },
      });
      const difference = closed.difference_cents || 0;
      setNotice(`Caixa fechado. Esperado ${money(closed.expected_cash_cents || 0)}; contado ${money(counted)}; diferença ${difference >= 0 ? '+' : ''}${money(difference)}.`);
      await loadData();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível fechar o caixa.'));
    } finally {
      setBusy(false);
    }
  }

  const expectedCash = session?.expected_cash_cents || 0;
  const countedCents = parseAmountCents(countedAmount);
  const movementCents = parseAmountCents(movementAmount);

  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div><span className="eyebrow">FINANÇAS</span><h1>Caixa</h1><p>Abra o caixa, registe movimentos e confira o dinheiro no fecho.</p></div>
        <button type="button" className="ops-icon-button" aria-label="Atualizar caixa" onClick={() => void loadData()}>↻</button>
      </div>
      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}
      {loading ? <div className="ops-loading"><span className="loading-dot" />A carregar caixa…</div> : !session ? (
        <section className="ops-card">
          <div className="ops-card-heading"><div><h2>Caixa fechado</h2><p>Indique o fundo inicial para abrir a sessão do dia.</p></div></div>
          <form className="ops-form-grid" onSubmit={(event) => void openSession(event)}>
            <label className="ops-field"><span>Fundo inicial (Kz)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} required /></label>
            <div className="ops-form-actions"><button className="button button--primary" type="submit" disabled={busy || parseAmountCents(openingAmount) === null}>{busy ? 'A abrir…' : 'Abrir caixa'}</button></div>
          </form>
        </section>
      ) : (
        <>
          <section className="ops-metrics">
            <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon">◷</span><span className="ops-metric__label">Fundo inicial</span></span><strong>{money(session.opening_cash_cents)}</strong><small>Aberto em {new Date(session.opened_at).toLocaleString('pt-AO')}</small></article>
            <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon">₭</span><span className="ops-metric__label">Saldo esperado</span></span><strong>{money(expectedCash)}</strong><small>Dinheiro recebido menos saídas registadas</small></article>
            <article className="ops-metric"><span className="ops-metric__top"><span className="ops-metric__icon">↕</span><span className="ops-metric__label">Movimentos manuais</span></span><strong>{movements.length}</strong><small>Entradas e saídas do caixa</small></article>
          </section>
          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Movimento manual</h2><p>Use para entradas ou saídas não registadas noutra operação.</p></div></div>
            <form className="ops-form-grid" onSubmit={(event) => void addMovement(event)}>
              <label className="ops-field"><span>Tipo</span><select value={movementType} onChange={(event) => setMovementType(event.target.value as 'inflow' | 'outflow')}><option value="outflow">Saída</option><option value="inflow">Entrada</option></select></label>
              <label className="ops-field"><span>Valor (Kz)</span><input type="number" inputMode="decimal" min="0.01" step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} required /></label>
              <label className="ops-field ops-field--wide"><span>Descrição</span><input value={description} onChange={(event) => setDescription(event.target.value)} minLength={2} maxLength={500} required /></label>
              <div className="ops-form-actions ops-field--wide"><button className="button button--primary" type="submit" disabled={busy || !movementCents}>{busy ? 'A guardar…' : 'Registar movimento'}</button></div>
            </form>
          </section>
          <section className="ops-card">
            <div className="ops-card-heading"><div><h2>Movimentos manuais</h2><p>Entradas e saídas registadas nesta sessão</p></div></div>
            <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>
              {movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.created_at).toLocaleString('pt-AO')}</td><td>{movement.movement_type === 'inflow' ? 'Entrada' : 'Saída'}</td><td>{movement.description}</td><td><strong>{movement.movement_type === 'inflow' ? '+' : '−'}{money(movement.amount_cents)}</strong></td></tr>)}
              {!movements.length && <tr><td className="ops-table-empty" colSpan={4}>Ainda não há movimentos manuais nesta sessão.</td></tr>}
            </tbody></table></div>
          </section>
          <form className="ops-card ops-form-grid" onSubmit={(event) => void closeSession(event)}>
            <div className="ops-card-heading ops-field--wide"><div><h2>Fechar caixa</h2><p>Conte o dinheiro físico e compare com o saldo esperado de {money(expectedCash)}.</p></div></div>
            <label className="ops-field"><span>Dinheiro contado (Kz)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={countedAmount} onChange={(event) => setCountedAmount(event.target.value)} required /></label>
            {countedCents !== null && <p className="ops-credit-note">Diferença: <strong>{countedCents >= expectedCash ? '+' : '−'}{money(Math.abs(countedCents - expectedCash))}</strong></p>}
            <div className="ops-form-actions ops-field--wide"><button className="button button--primary" type="submit" disabled={busy || countedCents === null}>{busy ? 'A fechar…' : 'Confirmar fecho'}</button></div>
          </form>
        </>
      )}
    </div>
  );
}
