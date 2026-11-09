import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'trend'
  | 'invoice'
  | 'wallet'
  | 'bag'
  | 'banknote'
  | 'package'
  | 'users'
  | 'layers'
  | 'card'
  | 'store'
  | 'utensils'
  | 'scissors'
  | 'pill'
  | 'bed'
  | 'search'
  | 'plus'
  | 'close'
  | 'arrowRight'
  | 'logout'
  | 'grid'
  | 'clock'
  | 'check'
  | 'shield'
  | 'spark'
  | 'alert'
  | 'printer'
  | 'download';

const icons: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3.5 10.8 12 3.5l8.5 7.3" />
      <path d="M5.5 9.5V20a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5V9.5" />
      <path d="M9.5 20.5v-5.2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v5.2" />
    </>
  ),
  trend: (
    <>
      <path d="M3.5 16.5 9.5 10.5l4 4 7-7" />
      <path d="M14.5 7.5h6v6" />
    </>
  ),
  invoice: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 11h6M9 14.5h6M9 18h4" />
    </>
  ),
  wallet: (
    <>
      <path d="M5 6.5h13.5A1.5 1.5 0 0 1 20 8v9.5a1.5 1.5 0 0 1-1.5 1.5H5A2 2 0 0 1 3 17V7a2 2 0 0 1 2-2h11" />
      <path d="M16 11.5h4V15h-4a1.75 1.75 0 1 1 0-3.5Z" />
    </>
  ),
  bag: (
    <>
      <path d="M6.2 8h11.6l-1 12.5H7.2z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.3" />
      <path d="M6.5 12h.01M17.5 12h.01" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 8.5 4.8v8.4L12 21l-8.5-4.8V7.8Z" />
      <path d="M3.5 7.8 12 12.6l8.5-4.8" />
      <path d="M12 12.6V21" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.2" />
      <path d="M17.5 14.4A5.5 5.5 0 0 1 21 20" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.4L12 11.8 3.5 7.4Z" />
      <path d="m3.5 12.4 8.5 4.4 8.5-4.4" />
      <path d="m3.5 17 8.5 4.4 8.5-4.4" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6.5 14.5h3.5" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.5 5.4 4h13.2L20 9.5" />
      <path d="M4 9.5a2.3 2.3 0 0 0 4.6 0 2.3 2.3 0 0 0 4.6 0 2.3 2.3 0 0 0 4.6 0" />
      <path d="M5 11.5V20h14v-8.5" />
      <path d="M9.5 20v-4.5h5V20" />
    </>
  ),
  utensils: (
    <>
      <path d="M7 3.5v6a2 2 0 0 0 4 0v-6" />
      <path d="M9 9.5V20.5" />
      <path d="M17 3.5c-1.6 1.7-2.2 4-2.2 6.1 0 2 .8 3.2 2.2 3.2v7.7" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="6" cy="17.5" r="2.5" />
      <path d="M8.1 8.1 20 20" />
      <path d="M8.1 15.9 20 4" />
    </>
  ),
  pill: (
    <>
      <path d="M10.6 20.4 3.6 13.4a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7Z" />
      <path d="m8.2 8.2 7.6 7.6" />
    </>
  ),
  bed: (
    <>
      <path d="M3 19V7" />
      <path d="M3 15h18v4" />
      <path d="M21 19v-5a2 2 0 0 0-2-2h-8v3" />
      <circle cx="7" cy="11.5" r="1.8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.4-4.4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3h4" />
      <path d="m16 16.5 4.5-4.5L16 7.5" />
      <path d="M20.5 12H9.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  shield: (
    <>
      <path d="M12 3 5 6v5.2c0 4.6 2.9 7.8 7 9.8 4.1-2 7-5.2 7-9.8V6l-7-3Z" />
      <path d="m9 11.8 2.2 2.2 4-4.2" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" />
      <path d="M18.5 15.5 19.2 17.8 21.5 18.5 19.2 19.2 18.5 21.5 17.8 19.2 15.5 18.5 17.8 17.8Z" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 20H3Z" />
      <path d="M12 9.5V14" />
      <path d="M12 17h.01" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V4.5h10V9" />
      <path d="M7 17H5.5A1.5 1.5 0 0 1 4 15.5v-4A2.5 2.5 0 0 1 6.5 9h11A2.5 2.5 0 0 1 20 11.5v4A1.5 1.5 0 0 1 18.5 17H17" />
      <path d="M7 13.5h10v6H7Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11" />
      <path d="m8 11 4 3.5 4-3.5" />
      <path d="M4.5 16.5v2A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>
  ),
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {icons[name]}
    </svg>
  );
}
