import type { ComponentType } from 'react';
import {
  ArrowRight,
  Bank,
  Bed,
  ChartLineUp,
  Check,
  Clock,
  CreditCard,
  DownloadSimple,
  ForkKnife,
  GridFour,
  House,
  MagnifyingGlass,
  Package,
  Pill,
  Plus,
  Printer,
  Receipt,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  SignOut,
  Sparkle,
  SquaresFour,
  Storefront,
  Users,
  Wallet,
  WarningCircle,
  X,
} from '@phosphor-icons/react';

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

type IconComponent = ComponentType<{ size?: number; className?: string; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }>;

const icons: Record<IconName, IconComponent> = {
  home: House,
  trend: ChartLineUp,
  invoice: Receipt,
  wallet: Wallet,
  bag: ShoppingBag,
  banknote: Bank,
  package: Package,
  users: Users,
  layers: SquaresFour,
  card: CreditCard,
  store: Storefront,
  utensils: ForkKnife,
  scissors: Scissors,
  pill: Pill,
  bed: Bed,
  search: MagnifyingGlass,
  plus: Plus,
  close: X,
  arrowRight: ArrowRight,
  logout: SignOut,
  grid: GridFour,
  clock: Clock,
  check: Check,
  shield: ShieldCheck,
  spark: Sparkle,
  alert: WarningCircle,
  printer: Printer,
  download: DownloadSimple,
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  const IconComponent = icons[name];
  return <IconComponent size={size} weight="duotone" className={className} aria-hidden="true" />;
}
