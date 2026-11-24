import { useEffect, useState, type FormEvent } from 'react';
import { request } from '../../api/client';
import type { Company, CompanyInput } from '../../api/types';
import { getErrorMessage } from './shared';
import { Icon } from '../Icon';

export function SettingsPage({
  profileName,
  profileEmail,
  canManageBilling,
  onOpenBilling,
  company,
  companyId,
  onCompanyUpdated,
}: {
  profileName: string;
  profileEmail: string;
  canManageBilling: boolean;
  onOpenBilling: () => void;
  company: Company;
  companyId: string;
  onCompanyUpdated: (company: Company) => void;
}) {
  const [form, setForm] = useState<CompanyInput>({
    legal_name: company.legal_name,
    trade_name: company.trade_name,
    nif: company.nif,
    legal_form: company.legal_form,
    registration_number: company.registration_number,
    incorporation_date: company.incorporation_date,
    email: company.email,
    phone: company.phone,
    address: company.address,
    city: company.city,
    municipality: company.municipality,
    province: company.province,
    country: company.country,
    business_activity: company.business_activity,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setForm({
      legal_name: company.legal_name,
      trade_name: company.trade_name,
      nif: company.nif,
      legal_form: company.legal_form,
      registration_number: company.registration_number,
      incorporation_date: company.incorporation_date,
      email: company.email,
      phone: company.phone,
      address: company.address,
      city: company.city,
      municipality: company.municipality,
      province: company.province,
      country: company.country,
      business_activity: company.business_activity,
    });
  }, [company]);

  function updateField(field: keyof CompanyInput, value: string) {
    setForm((current) => ({ ...current, [field]: value || null }));
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await request<Company>('/company', {
        method: 'PUT',
        companyId,
        body: form,
      });
      onCompanyUpdated(updated);
      setNotice('Dados da empresa guardados.');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível guardar os dados da empresa.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-page ops-settings">
      <div className="ops-page-heading">
        <div>
          <span className="eyebrow">CONFIGURAÇÕES DA EMPRESA</span>
          <h1>Preferências e administração</h1>
          <p>Gerir os dados principais da conta e os recursos da empresa.</p>
        </div>
      </div>

      {error && <div className="ops-alert ops-alert--error" role="alert">{error}</div>}
      {notice && <div className="ops-alert ops-alert--success" role="status">{notice}</div>}

      <div className="ops-settings-layout">
        <form className="ops-card ops-settings-company" onSubmit={saveCompany}>
          <div className="ops-card-heading">
            <div>
              <h2>Dados da empresa</h2>
              <p>Nome, identificação fiscal e contacto oficial.</p>
            </div>
            <span className="status-pill status-pill--active">{company.status === 'approved' ? 'Aprovada' : company.status}</span>
          </div>

          <div className="ops-form-grid">
            <label className="ops-field ops-field--wide"><span>Nome legal</span><input required minLength={2} maxLength={200} value={form.legal_name} onChange={(event) => setForm((current) => ({ ...current, legal_name: event.target.value }))} /></label>
            <label className="ops-field"><span>Nome comercial</span><input maxLength={200} value={form.trade_name || ''} onChange={(event) => updateField('trade_name', event.target.value)} /></label>
            <label className="ops-field"><span>NIF</span><input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.nif} onChange={(event) => setForm((current) => ({ ...current, nif: event.target.value }))} /></label>
            <label className="ops-field"><span>Forma jurídica</span><input maxLength={100} value={form.legal_form || ''} onChange={(event) => updateField('legal_form', event.target.value)} /></label>
            <label className="ops-field"><span>Registo comercial</span><input maxLength={100} value={form.registration_number || ''} onChange={(event) => updateField('registration_number', event.target.value)} /></label>
            <label className="ops-field"><span>Data de constituição</span><input type="date" value={form.incorporation_date || ''} onChange={(event) => updateField('incorporation_date', event.target.value)} /></label>
            <label className="ops-field"><span>Email</span><input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="ops-field"><span>Telefone</span><input value={form.phone || ''} onChange={(event) => updateField('phone', event.target.value)} /></label>
            <label className="ops-field ops-field--wide"><span>Morada</span><input value={form.address || ''} onChange={(event) => updateField('address', event.target.value)} /></label>
            <label className="ops-field"><span>Cidade</span><input value={form.city || ''} onChange={(event) => updateField('city', event.target.value)} /></label>
            <label className="ops-field"><span>Município</span><input value={form.municipality || ''} onChange={(event) => updateField('municipality', event.target.value)} /></label>
            <label className="ops-field"><span>Província</span><input value={form.province || ''} onChange={(event) => updateField('province', event.target.value)} /></label>
            <label className="ops-field"><span>País</span><input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} /></label>
            <label className="ops-field ops-field--wide"><span>Atividade da empresa</span><textarea rows={2} value={form.business_activity || ''} onChange={(event) => updateField('business_activity', event.target.value)} /></label>
            <div className="ops-form-actions">
              <button type="submit" className="button button--primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar alterações'}</button>
            </div>
          </div>
        </form>

        <aside className="ops-settings-aside">
          <article className="ops-card ops-settings-profile">
            <div className="ops-settings-card__icon"><Icon name="users" size={20} /></div>
            <div><h2>Conta do utilizador</h2><strong>{profileName}</strong><p>{profileEmail}</p></div>
          </article>
          {canManageBilling && (
            <button type="button" className="ops-card ops-settings-card--action" onClick={onOpenBilling}>
              <div className="ops-settings-card__icon"><Icon name="card" size={20} /></div>
              <div><h2>Plano e faturação</h2><p>Consultar plano, teste grátis e pagamento.</p></div>
              <Icon name="arrowRight" size={18} />
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
