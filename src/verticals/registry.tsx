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

export interface VerticalDefinition {
  code: VerticalCode;
  name: string;
  description: string;
  icon: IconName;
  emblem: string;
  component: ComponentType<{ companyId: string }>;
}

export const verticalRegistry: readonly VerticalDefinition[] = [
  {
    code: 'commerce',
    name: 'Comércio',
    description: 'Vendas rápidas, stock, promoções e devoluções.',
    icon: 'store',
    emblem: '▣',
    component: CommercePage,
  },
  {
    code: 'restaurant',
    name: 'Restaurante',
    description: 'Mesas, pedidos, cozinha e contas.',
    icon: 'utensils',
    emblem: '♨',
    component: RestaurantPage,
  },
  {
    code: 'barbershop',
    name: 'Barbearia',
    description: 'Agenda, profissionais, serviços e comissões.',
    icon: 'scissors',
    emblem: '✂',
    component: BarbershopPage,
  },
  {
    code: 'pharmacy',
    name: 'Farmácia',
    description: 'Lotes, validade, prescrições e dispensa controlada.',
    icon: 'pill',
    emblem: '+',
    component: PharmacyPage,
  },
  {
    code: 'hospitality',
    name: 'Hotelaria',
    description: 'Quartos, reservas, estadias e limpeza.',
    icon: 'bed',
    emblem: '⌂',
    component: HospitalityPage,
  },
];

export function getVertical(code: string): VerticalDefinition | undefined {
  return verticalRegistry.find((vertical) => vertical.code === code);
}
