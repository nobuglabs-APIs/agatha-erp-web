import { useState, type FormEvent } from 'react';
import { ApiError, request, saveTokens } from '../api/client';
import type { CompanyInput, TokenResponse } from '../api/types';
import { Brand } from './Brand';

interface RegisterResponse {
  company_id: string;
  status: string;
  tokens: TokenResponse;
}

const businessTypes = [
  { code: 'commerce', name: 'Comércio', description: 'Vendas rápidas, stock, promoções e devoluções.', icon: '▣' },
  { code: 'restaurant', name: 'Restaurante', description: 'Mesas, pedidos, cozinha e contas.', icon: '♨' },
  { code: 'barbershop', name: 'Barbearia', description: 'Agenda, profissionais, serviços e comissões.', icon: '✂' },
  { code: 'pharmacy', name: 'Farmácia', description: 'Lotes, validade, prescrições e dispensa.', icon: '+' },
  { code: 'hospitality', name: 'Hotelaria', description: 'Quartos, reservas, estadias e limpeza.', icon: '⌂' },
] as const;

export function AuthScreen({
  onAuthenticated,
  initialError = '',
}: {
  onAuthenticated: () => void;
  initialError?: string;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [industryCode, setIndustryCode] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      if (mode === 'login') {
        const tokens = await request<TokenResponse>('/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        saveTokens(tokens);
      } else {
        if (!industryCode) {
          setError('Escolha o tipo de negócio para continuar.');
          return;
        }
        const company: CompanyInput = {
          legal_name: String(data.get('legal_name') || '').trim(),
          trade_name: null,
          nif: String(data.get('nif') || '').trim(),
          legal_form: null,
          registration_number: null,
          incorporation_date: null,
          email: String(data.get('company_email') || '').trim(),
          phone: null,
          address: null,
          city: null,
          municipality: null,
          province: null,
          country: 'Angola',
          business_activity: null,
        };
        const result = await request<RegisterResponse>('/auth/register-company', {
          method: 'POST',
          body: {
            company,
            industry_code: industryCode,
            admin: {
              full_name: String(data.get('full_name') || '').trim(),
              email: String(data.get('admin_email') || '').trim(),
              password: String(data.get('admin_password') || ''),
            },
          },
        });
        saveTokens(result.tokens);
      }
      onAuthenticated();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Não foi possível contactar a API. Verifique a ligação e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story__content">
          <span className="eyebrow">GESTÃO QUE ACOMPANHA O SEU RITMO</span>
          <h1>Mais clareza para fazer o seu negócio crescer.</h1>
          <p>Operações, equipa e informação da empresa num só lugar — simples de entender e pronto para o dia a dia.</p>
        </div>
        <div className="story-foot">
          <span className="story-foot__spark">✳</span>
          <span>Feito para empresas angolanas.<br /><strong>Todos os direitos reservados · Nobug Labs</strong></span>
        </div>
      </section>

      <section className="auth-form-side">
        <div className={mode === 'register' ? 'auth-form-wrap auth-form-wrap--register' : 'auth-form-wrap'}>
          <div className="auth-mobile-brand"><Brand /></div>
          <div className="auth-heading">
            <span className="eyebrow">{mode === 'login' ? 'BEM-VINDO DE VOLTA' : 'COMECE AQUI'}</span>
            <h2>{mode === 'login' ? 'Entre na sua conta' : 'Registe a sua empresa'}</h2>
            <p>{mode === 'login' ? 'Aceda ao seu espaço Agatha ERP.' : 'Crie a conta de administrador e inicie o onboarding.'}</p>
          </div>

          <form className="auth-form" key={mode} onSubmit={submit}>
            {mode === 'login' ? (
              <>
                <label className="field">
                  <span>Email</span>
                  <input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@empresa.ao" />
                </label>
                <label className="field">
                  <span>Palavra-passe</span>
                  <input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="A sua palavra-passe" />
                </label>
              </>
            ) : (
              <>
                <fieldset className="business-type-fieldset">
                  <legend>Qual é o tipo de negócio?</legend>
                  <p>Este espaço será configurado para esta atividade e não poderá ser alterado depois.</p>
                  <div className="business-type-grid">
                    {businessTypes.map((type) => (
                      <label className={industryCode === type.code ? 'business-type-card business-type-card--selected' : 'business-type-card'} key={type.code}>
                        <input
                          type="radio"
                          name="industry_code"
                          value={type.code}
                          required
                          checked={industryCode === type.code}
                          onChange={() => setIndustryCode(type.code)}
                        />
                        <span className="business-type-card__icon" aria-hidden="true">{type.icon}</span>
                        <span className="business-type-card__copy"><strong>{type.name}</strong><small>{type.description}</small></span>
                        <span className="business-type-card__check" aria-hidden="true">✓</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="field">
                  <span>Nome legal da empresa</span>
                  <input name="legal_name" required minLength={2} maxLength={200} placeholder="Ex.: Empresa, Lda." />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>NIF da empresa</span>
                    <input name="nif" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="10 dígitos" />
                  </label>
                  <label className="field">
                    <span>Email da empresa</span>
                    <input name="company_email" required type="email" placeholder="geral@empresa.ao" />
                  </label>
                </div>
                <label className="field">
                  <span>Nome do administrador</span>
                  <input name="full_name" required minLength={2} maxLength={200} placeholder="O seu nome" />
                </label>
                <label className="field">
                  <span>Email de acesso</span>
                  <input name="admin_email" required type="email" autoComplete="email" placeholder="nome@empresa.ao" />
                </label>
                <label className="field">
                  <span>Palavra-passe</span>
                  <input name="admin_password" required type="password" minLength={10} maxLength={128} autoComplete="new-password" placeholder="Pelo menos 10 caracteres" />
                </label>
                <p className="field-hint">Após a aprovação, terá 7 dias grátis para usar o ERP completo deste tipo de negócio e escolher um plano.</p>
              </>
            )}

            {error && <div className="alert alert--error" role="alert">{error}</div>}
            <button className="button button--primary button--large" type="submit" disabled={busy}>
              {busy ? 'A processar…' : mode === 'login' ? 'Entrar no Agatha' : 'Criar conta e empresa'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div className="auth-switch">
            <span>{mode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}</span>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Registar empresa' : 'Iniciar sessão'}
            </button>
          </div>
          <footer className="auth-legal">Ao continuar, confirma que tem autorização para representar a empresa.</footer>
        </div>
      </section>
    </main>
  );
}
