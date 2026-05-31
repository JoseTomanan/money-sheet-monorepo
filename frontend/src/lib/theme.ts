import type { CategoryMap } from './types';

export interface CategoryStyle {
  color: string;
  soft: string;
  pastel: string;
  label: string;
  subcategories: string[];
}

export const CATEGORIES: Record<string, CategoryStyle> = {
  HOUSING:   { color: '#2a5899', soft: 'rgba(58, 123, 200, 0.14)',  pastel: '#dce8f8', label: 'Housing',
               subcategories: ['Rent', 'Utilities', 'Maintenance'] },
  FOOD:      { color: '#186e34', soft: 'rgba(26, 138, 63, 0.14)',   pastel: '#cdebd6', label: 'Food',
               subcategories: ['Groceries', 'Dining'] },
  TRANSIT:   { color: '#9a2e1c', soft: 'rgba(193, 74, 50, 0.14)',   pastel: '#f8ddd9', label: 'Transit',
               subcategories: ['Commute Fare', 'Auto Maintenance', 'Fuel', 'Parking'] },
  HEALTH:    { color: '#9a5c0a', soft: 'rgba(196, 120, 24, 0.14)',  pastel: '#fdecd0', label: 'Health',
               subcategories: ['Consultation Fee', 'Pharmacy', 'Fitness', 'Insurance'] },
  FINANCE:   { color: '#636b0e', soft: 'rgba(138, 150, 24, 0.14)',  pastel: '#eef0c8', label: 'Finance',
               subcategories: ['Tax', 'Debt', 'Investment', 'Savings'] },
  LIFESTYLE: { color: '#4a4a4a', soft: 'rgba(120, 120, 120, 0.14)', pastel: '#e8e8e8', label: 'Lifestyle',
               subcategories: ['Leisure', 'Entertainment', 'Subscription', 'Grooming', 'Clothing', 'Gifts'] },
  MISC:      { color: '#4e3aab', soft: 'rgba(102, 80, 196, 0.14)',  pastel: '#e4dff8', label: 'Misc',
               subcategories: ['Career', 'Uniform', 'Tools'] },
};

export const CATEGORY_ORDER = ['HOUSING', 'FOOD', 'TRANSIT', 'HEALTH', 'FINANCE', 'LIFESTYLE', 'MISC'] as const;

const FALLBACK_STYLE: CategoryStyle = {
  color: 'var(--muted-foreground)',
  soft: 'var(--muted)',
  pastel: 'var(--muted)',
  label: '',
  subcategories: [],
};

export function resolveCategoryStyle(key: string): CategoryStyle {
  return CATEGORIES[key] ?? { ...FALLBACK_STYLE, label: key };
}

export const CATEGORY_MAP: CategoryMap = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, v.subcategories])
);
