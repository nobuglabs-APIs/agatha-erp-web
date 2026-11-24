import type { CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import type { VerticalDefinition } from './registry';

export function VerticalWorkspaceHeader({
  vertical,
  activeTab,
  onSelectTab,
}: {
  vertical: VerticalDefinition;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
}) {
  return (
    <header
      className="ops-vertical-header"
      data-vertical={vertical.code}
      style={{
        '--vertical-accent': vertical.theme.accent,
        '--vertical-accent-strong': vertical.theme.accentStrong,
        '--vertical-surface': vertical.theme.surface,
        '--vertical-surface-soft': vertical.theme.surfaceSoft,
      } as CSSProperties}
    >
      <div className="ops-vertical-header__identity">
        <span className="ops-vertical-header__icon" aria-hidden="true"><Icon name={vertical.icon} size={20} /></span>
        <div>
          <small>AMBIENTE DE TRABALHO</small>
          <strong>{vertical.name}</strong>
        </div>
      </div>
      <nav className="ops-vertical-tabs" aria-label={`Áreas de ${vertical.name}`}>
        {vertical.tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={activeTab === tab.id ? 'ops-vertical-tab ops-vertical-tab--active' : 'ops-vertical-tab'}
            onClick={() => onSelectTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
