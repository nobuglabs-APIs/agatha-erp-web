import { useCallback, useEffect, useState } from 'react';
import { ApiError, clearTokens, hasSession, logoutSession, request } from './api/client';
import type { UserProfile } from './api/types';
import { AuthScreen } from './components/AuthScreen';
import { Brand } from './components/Brand';
import { CompanyWorkspace } from './components/CompanyWorkspace';
import { Icon } from './components/Icon';

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasSession());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [loading, setLoading] = useState(hasSession());
  const [error, setError] = useState('');

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await request<UserProfile>('/auth/me');
      setProfile(current);
      const rememberedCompany = sessionStorage.getItem('agatha_company_id');
      const nextCompanyId = current.companies.some((item) => item.company_id === rememberedCompany)
        ? rememberedCompany || ''
        : current.companies[0]?.company_id || '';
      setSelectedCompanyId(nextCompanyId);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        clearTokens();
        setAuthenticated(false);
        setProfile(null);
      } else {
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a sessão.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) void loadSession();
  }, [authenticated, loadSession]);

  function chooseCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    sessionStorage.setItem('agatha_company_id', companyId);
  }

  async function logout() {
    setError('');
    try {
      await logoutSession();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível revogar a sessão no servidor.');
    } finally {
      clearTokens();
    }
    sessionStorage.removeItem('agatha_company_id');
    setProfile(null);
    setAuthenticated(false);
  }

  if (!authenticated) return <AuthScreen onAuthenticated={() => setAuthenticated(true)} initialError={error} />;
  if (loading) {
    return <main className="loading-screen"><Brand /><span className="loading-dot" />A preparar o seu espaço…</main>;
  }
  if (error && !profile) {
    return <main className="error-screen"><Brand /><div className="alert alert--error">{error}</div><button className="button button--primary" onClick={() => void loadSession()}>Tentar novamente</button></main>;
  }
  if (!profile) return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;

  return (
    <div className="app-frame">
      <header className="topbar">
        <Brand compact />
        <div className="topbar__account">
          <span className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</span>
          <span className="topbar__identity"><strong>{profile.full_name}</strong><small>{profile.email}</small></span>
          <button type="button" className="button button--quiet" onClick={() => void logout()}>Terminar sessão</button>
        </div>
      </header>
      {error && <div className="app-global-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadSession()}>Tentar novamente</button></div>}
      {profile.companies.length > 0 ? (
        <CompanyWorkspace
          profile={profile}
          selectedCompanyId={selectedCompanyId}
          onCompanyChange={chooseCompany}
          onLogout={() => void logout()}
        />
      ) : (
        <main className="empty-company">
          <span className="empty-company__icon"><Icon name="plus" size={22} /></span>
          <span className="eyebrow">O SEU ESPAÇO</span>
          <h1>Registe uma empresa para começar</h1>
          <p>Esta conta ainda não está ligada a uma empresa. Termine a sessão e use “Registar empresa” para criar o primeiro espaço.</p>
        </main>
      )}
      <footer className="app-footer">Ágata ERP <span>·</span> Todos os direitos reservados · Nobug Labs</footer>
    </div>
  );
}
