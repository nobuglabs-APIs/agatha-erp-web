import type { ReactNode } from 'react';

export function VerticalWorkspacePanel({
  id,
  activeId,
  children,
}: {
  id: string;
  activeId: string;
  children: ReactNode;
}) {
  return <div hidden={id !== activeId} className="vertical-workspace-panel" data-vertical-panel={id}>{children}</div>;
}
