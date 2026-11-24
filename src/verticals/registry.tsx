import type { ComponentType } from 'react';
import type { IconName } from '../components/Icon';
import { BarbershopPage } from './barbershop';
import { CommercePage } from './commerce';
import { HospitalityPage } from './hospitality';
import { PharmacyPage } from './pharmacy';
import { RestaurantPage } from './restaurant';

export type VerticalCode =
  | 'commerce'
  | 'restaurant'
  | 'barbershop'
  | 'pharmacy'
  | 'hospitality';

export interface VerticalWorkspaceProps {
  companyId: string;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
}

export interface VerticalDefinition {
  code: VerticalCode;
  name: string;
  description: string;
  icon: IconName;
  emblem: string;
  theme: {
    accent: string;
    accentStrong: string;
    surface: string;
    surfaceSoft: string;
  };
  tabs: Array<{ id: string; label: string }>;
  component: ComponentType<VerticalWorkspaceProps>;
}

export const verticalRegistry: readonly VerticalDefinition[] = [
  {
    code: 'commerce',
    name: 'Comércio',
    description: 'Vendas rápidas, stock, promoções e devoluções.',
    icon: 'store',
    emblem: '▣',
    theme: { accent: '#b7794d', accentStrong: '#7d4728', surface: '#fffaf5', surfaceSoft: '#f7eee4' },
    tabs: [
      { id: 'pos', label: 'Caixa' },
      { id: 'promotions', label: 'Promoções' },
      { id: 'returns', label: 'Devoluções' },
    ],
    component: CommercePage,
  },
  {
    code: 'restaurant',
    name: 'Restaurante',
    description: 'Mesas, pedidos, cozinha e contas.',
    icon: 'utensils',
    emblem: '♨',
    theme: { accent: '#c65d3a', accentStrong: '#8e3b28', surface: '#fffaf7', surfaceSoft: '#f8ebe5' },
    tabs: [
      { id: 'floor', label: 'Sala' },
      { id: 'orders', label: 'Pedidos' },
      { id: 'kitchen', label: 'Cozinha' },
      { id: 'menu', label: 'Carta' },
    ],
    component: RestaurantPage,
  },
  {
    code: 'barbershop',
    name: 'Barbearia',
    description: 'Agenda, profissionais, serviços e comissões.',
    icon: 'scissors',
    emblem: '✂',
    theme: { accent: '#b24c79', accentStrong: '#7d3154', surface: '#fff9fb', surfaceSoft: '#f7eaf1' },
    tabs: [
      { id: 'appointments', label: 'Agenda' },
      { id: 'professionals', label: 'Profissionais' },
      { id: 'services', label: 'Serviços' },
      { id: 'commissions', label: 'Comissões' },
    ],
    component: BarbershopPage,
  },
  {
    code: 'pharmacy',
    name: 'Farmácia',
    description: 'Lotes, validade, prescrições e dispensa controlada.',
    icon: 'pill',
    emblem: '+',
    theme: { accent: '#3b8c7a', accentStrong: '#246557', surface: '#f8fcfa', surfaceSoft: '#eaf5f1' },
    tabs: [
      { id: 'stock', label: 'Stock' },
      { id: 'prescriptions', label: 'Prescrições' },
      { id: 'dispensing', label: 'Dispensas' },
      { id: 'batches', label: 'Lotes' },
    ],
    component: PharmacyPage,
  },
  {
    code: 'hospitality',
    name: 'Hotelaria',
    description: 'Quartos, reservas, estadias e limpeza.',
    icon: 'bed',
    emblem: '⌂',
    theme: { accent: '#5f7ea6', accentStrong: '#3d5e82', surface: '#f8fbfd', surfaceSoft: '#edf3f8' },
    tabs: [
      { id: 'rooms', label: 'Quartos' },
      { id: 'reservations', label: 'Reservas' },
      { id: 'housekeeping', label: 'Limpeza' },
    ],
    component: HospitalityPage,
  },
];

export function getVertical(code: string): VerticalDefinition | undefined {
  return verticalRegistry.find((vertical) => vertical.code === code);
}
