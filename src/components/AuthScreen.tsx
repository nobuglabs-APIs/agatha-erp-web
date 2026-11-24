import { useState, type FormEvent } from 'react';
import { ApiError, request, saveTokens } from '../api/client';
import type { CompanyInput, TokenResponse } from '../api/types';
import { verticalRegistry } from '../verticals/registry';
import { Brand } from './Brand';
import { Icon } from './Icon';

interface RegisterResponse {
  company_id: string;
  status: string;
  tokens: TokenResponse;
}

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
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
  const [legalName, setLegalName] = useState('');
  const [nif, setNif] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [referralCode] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('ref');
    return code?.trim().toUpperCase() || '';
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'register' && registerStep < 3) {
      if (!industryCode && registerStep === 1) {
        setError('Escolha o tipo de negócio para continuar.');
        return;
      }
      if (!event.currentTarget.reportValidity()) return;
      setError('');
      setRegisterStep((registerStep + 1) as 2 | 3);
      return;
    }
    setBusy(true);
    setError('');
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
          legal_name: legalName.trim(),
          trade_name: null,
          nif: nif.trim(),
          legal_form: null,
          registration_number: null,
          incorporation_date: null,
          email: companyEmail.trim(),
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
            ...(referralCode ? { referral_code: referralCode } : {}),
            admin: {
              full_name: fullName.trim(),
              email: adminEmail.trim(),
              password: adminPassword,
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
          <ul className="auth-story__features">
            <li><Icon name="shield" size={15} /> Aprovado para operar em Angola</li>
            <li><Icon name="trend" size={15} /> Vendas, stock e faturação</li>
            <li><Icon name="users" size={15} /> Equipa com permissões</li>
          </ul>
          <div className="story-showcase">
            <div className="story-showcase__head">
              <span className="story-showcase__mark"><img src="/brand/agata-mark.png" alt="" /></span>
              <span className="story-showcase__copy"><strong>Um espaço, toda a operação.</strong><small>Do onboarding à fatura, sem saltar entre ferramentas.</small></span>
            </div>
            <div className="story-showcase__stats">
              <div><strong>7 dias</strong><small>TESTE GRÁTIS</small></div>
              <div><strong>1</strong><small>ESPAÇO</small></div>
              <div><strong>0</strong><small>COMPLICAÇÕES</small></div>
            </div>
          </div>
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
            <h2>{mode === 'login'
              ? 'Entre na sua conta'
              : ['Escolha o seu negócio', 'Dados da empresa', 'Crie o seu acesso'][registerStep - 1]}</h2>
            <p>{mode === 'login'
              ? 'Aceda ao seu espaço Ágata ERP.'
              : ['Defina como a Ágata irá organizar o seu espaço.', 'Informe os dados identificativos da empresa.', 'Use estes dados para entrar e administrar o primeiro espaço.'][registerStep - 1]}</p>
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
                <div className="auth-stepper" aria-label="Etapas do cadastro">
                  {[['Negócio', 1], ['Empresa', 2], ['Acesso', 3]].map(([label, step]) => {
                    const stepNumber = Number(step);
                    return (
                      <div
                        className={`auth-step${registerStep === stepNumber ? ' auth-step--active' : ''}${registerStep > stepNumber ? ' auth-step--done' : ''}`}
                        key={label}
                      >
                        <span>{registerStep > stepNumber ? '✓' : stepNumber}</span>
                        <small>{label}</small>
                      </div>
                    );
                  })}
                </div>

                {registerStep === 1 && (
                  <fieldset className="business-type-fieldset">
                    <legend>Qual é o tipo de negócio?</legend>
                    <p>Este espaço será configurado para esta atividade e não poderá ser alterado depois.</p>
                    <div className="business-type-grid">
                      {verticalRegistry.map((type) => (
                        <label className={industryCode === type.code ? 'business-type-card business-type-card--selected' : 'business-type-card'} key={type.code}>
                          <input
                            type="radio"
                            name="industry_code"
                            value={type.code}
                            required
                            checked={industryCode === type.code}
                            onChange={() => setIndustryCode(type.code)}
                          />
                          <span className="business-type-card__icon" aria-hidden="true"><Icon name={type.icon} size={17} /></span>
                          <span className="business-type-card__copy"><strong>{type.name}</strong><small>{type.description}</small></span>
                          <span className="business-type-card__check" aria-hidden="true">✓</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {registerStep === 2 && (
                  <>
                    {referralCode && <p className="field-hint">Indicação Nobug Rewards aplicada: <strong>{referralCode}</strong></p>}
                    <label className="field">
                      <span>Nome legal da empresa</span>
                      <input name="legal_name" required minLength={2} maxLength={200} value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Ex.: Empresa, Lda." />
                    </label>
                    <div className="field-row">
                      <label className="field">
                        <span>NIF da empresa</span>
                        <input name="nif" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={nif} onChange={(event) => setNif(event.target.value)} placeholder="10 dígitos" />
                      </label>
                      <label className="field">
                        <span>Email da empresa</span>
                        <input name="company_email" required type="email" value={companyEmail} onChange={(event) => setCompanyEmail(event.target.value)} placeholder="geral@empresa.ao" />
                      </label>
                    </div>
                  </>
                )}

                {registerStep === 3 && (
                  <>
                    <label className="field">
                      <span>Nome do administrador</span>
                      <input name="full_name" required minLength={2} maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="O seu nome" />
                    </label>
                    <label className="field">
                      <span>Email de acesso</span>
                      <input name="admin_email" required type="email" autoComplete="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="nome@empresa.ao" />
                    </label>
                    <label className="field">
                      <span>Palavra-passe</span>
                      <input name="admin_password" required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="Pelo menos 10 caracteres" />
                    </label>
                    <p className="field-hint">Após a aprovação, terá 7 dias grátis para usar o ERP completo deste tipo de negócio e escolher um plano.</p>
                  </>
                )}
              </>
            )}

            {error && <div className="alert alert--error" role="alert">{error}</div>}
            <div className={mode === 'register' ? 'auth-form-actions auth-form-actions--register' : 'auth-form-actions'}>
              {mode === 'register' && registerStep > 1 && (
                <button
                  className="button button--quiet button--large"
                  type="button"
                  disabled={busy}
                  onClick={() => { setError(''); setRegisterStep((registerStep - 1) as 1 | 2); }}
                >
                  Voltar
                </button>
              )}
              <button className="button button--primary button--large" type="submit" disabled={busy}>
                {busy
                  ? 'A processar…'
                  : mode === 'login'
                    ? 'Entrar na Ágata'
                    : registerStep < 3
                      ? 'Continuar'
                      : 'Criar conta e empresa'}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>

          <div className="auth-switch">
            <span>{mode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}</span>
            <button type="button" onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setRegisterStep(1);
              setError('');
            }}>
              {mode === 'login' ? 'Registar empresa' : 'Iniciar sessão'}
            </button>
          </div>
          <footer className="auth-legal">Ao continuar, confirma que tem autorização para representar a empresa.</footer>
        </div>
      </section>
    </main>
  );
}
