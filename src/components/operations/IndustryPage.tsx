import { useCallback, useEffect, useState } from 'react';
import { request } from '../../api/client';
import type { CompanyFeatures } from '../../api/types';
import { getErrorMessage } from './shared';

interface IndustryPack {
  code: string;
  name: string;
  description: string | null;
  capabilities: string[];
  is_active: boolean;
  sort_order: number;
}

interface IndustryPacksResponse {
  available: IndustryPack[];
  selected: Array<{ pack_code: string; name: string; enabled: boolean; is_primary: boolean }>;
}

const verticalIntros: Record<string, string> = {
  commerce: 'Venda no balcão com pesquisa, códigos de barras, promoções e devoluções.',
  restaurant: 'Mesas, pedidos, menu e o ritmo entre sala e cozinha.',
  barbershop: 'Profissionais, serviços, agenda e comissões num só espaço.',
  pharmacy: 'Stock farmacêutico, lotes, validade e dispensa controlada.',
  hospitality: 'Quartos, reservas, estadias, check-in e housekeeping.',
};

const verticalIcons: Record<string, string> = {
  commerce: '▣',
  restaurant: '♨',
  barbershop: '✂',
  pharmacy: '+',
  hospitality: '⌂',
};

export function IndustrySettingsPage({
  companyId,
  canManage,
  onSaved,
}: {
  companyId: string;
  canManage: boolean;
  onSaved: (features: CompanyFeatures) => void;
}) {
  const [catalog, setCatalog] = useState<IndustryPack[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await request<IndustryPacksResponse>('/company/industry-packs', { companyId });
      setCatalog(response.available);
      setSelectedCode(response.selected.find((pack) => pack.enabled && pack.is_primary)?.pack_code || '');
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível carregar os tipos de negócio.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!selectedCode || !canManage) return;
    setBusy(true);
    setError('');
    try {
      const features = await request<CompanyFeatures>('/company/industry-packs', {
        method: 'PUT',
        companyId,
        body: {
          primary_industry_code: selectedCode,
          packs: [{ code: selectedCode, enabled: true, config: {} }],
        },
      });
      onSaved(features);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível guardar o tipo de negócio.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="business-choice">
      <div className="business-choice__heading">
        <span className="eyebrow">PASSO OBRIGATÓRIO</span>
        <h2>Escolha o ambiente do seu negócio</h2>
        <p>Vamos adaptar o seu espaço de trabalho às operações da sua empresa. Esta escolha fica bloqueada depois de guardada.</p>
      </div>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {loading ? <div className="workspace-loading"><span className="loading-dot" />A carregar tipos de negócio…</div> : (
        <>
          <div className="business-choice__grid">
            {catalog.map((pack) => (
              <label className={selectedCode === pack.code ? 'business-choice-card business-choice-card--selected' : 'business-choice-card'} key={pack.code}>
                <input
                  type="radio"
                  name="company-business-type"
                  value={pack.code}
                  checked={selectedCode === pack.code}
                  disabled={!canManage}
                  onChange={() => setSelectedCode(pack.code)}
                />
                <span className="business-choice-card__icon" aria-hidden="true">{verticalIcons[pack.code] || '◇'}</span>
                <span className="business-choice-card__copy">
                  <strong>{pack.name}</strong>
                  <small>{verticalIntros[pack.code] || pack.description}</small>
                </span>
                <span className="business-choice-card__check" aria-hidden="true">✓</span>
              </label>
            ))}
          </div>
          {canManage
            ? <button type="button" className="button button--primary" disabled={busy || !selectedCode} onClick={() => void save()}>{busy ? 'A guardar…' : 'Confirmar tipo de negócio'}</button>
            : <p className="field-hint">Só um administrador da empresa pode escolher o tipo de negócio.</p>}
        </>
      )}
    </section>
  );
}
