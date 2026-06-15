import type { CategoryMap } from './types';

export interface CategoryStyle {
  color: string;
  soft: string;
  pastel: string;
  dot: string;
  darkColor: string;
  darkDot: string;
  label: string;
  subcategories: string[];
}

export const CATEGORIES: Record<string, CategoryStyle> = {
  HOUSING:   { color: '#2a5899', soft: 'rgba(58, 123, 200, 0.14)',  pastel: '#dce8f8', dot: '#5a9ad8', darkColor: '#60a5fa', darkDot: '#93c5fd', label: 'Housing',
               subcategories: ['Rent', 'Utilities', 'Maintenance'] },
  FOOD:      { color: '#186e34', soft: 'rgba(26, 138, 63, 0.14)',   pastel: '#cdebd6', dot: '#4daa66', darkColor: '#4ade80', darkDot: '#86efac', label: 'Food',
               subcategories: ['Groceries', 'Dining'] },
  TRANSIT:   { color: '#9a2e1c', soft: 'rgba(193, 74, 50, 0.14)',   pastel: '#f8ddd9', dot: '#d46060', darkColor: '#f87171', darkDot: '#fca5a5', label: 'Transit',
               subcategories: ['Commute Fare', 'Auto Maintenance', 'Fuel', 'Parking'] },
  HEALTH:    { color: '#9a5c0a', soft: 'rgba(196, 120, 24, 0.14)',  pastel: '#fdecd0', dot: '#d4782a', darkColor: '#fb923c', darkDot: '#fdba74', label: 'Health',
               subcategories: ['Consultation Fee', 'Pharmacy', 'Fitness', 'Insurance'] },
  FINANCE:   { color: '#636b0e', soft: 'rgba(138, 150, 24, 0.14)',  pastel: '#eef0c8', dot: '#c8a800', darkColor: '#a3e635', darkDot: '#d9f99d', label: 'Finance',
               subcategories: ['Tax', 'Debt', 'Investment', 'Savings'] },
  LIFESTYLE: { color: '#4a4a4a', soft: 'rgba(120, 120, 120, 0.14)', pastel: '#e8e8e8', dot: '#888888', darkColor: '#d4d4d8', darkDot: '#e4e4e7', label: 'Lifestyle',
               subcategories: ['Leisure', 'Entertainment', 'Subscription', 'Grooming', 'Clothing', 'Gifts'] },
  MISC:      { color: '#4e3aab', soft: 'rgba(102, 80, 196, 0.14)',  pastel: '#e4dff8', dot: '#8e6ed0', darkColor: '#a78bfa', darkDot: '#c4b5fd', label: 'Misc',
               subcategories: ['Career', 'Uniform', 'Tools'] },
};

export const CATEGORY_ORDER = ['HOUSING', 'FOOD', 'TRANSIT', 'HEALTH', 'FINANCE', 'LIFESTYLE', 'MISC'] as const;

const FALLBACK_STYLE: CategoryStyle = {
  color: 'var(--muted-foreground)',
  soft: 'var(--muted)',
  pastel: 'var(--muted)',
  dot: 'var(--muted-foreground)',
  darkColor: 'var(--muted-foreground)',
  darkDot: 'var(--muted-foreground)',
  label: '',
  subcategories: [],
};

export function resolveCategoryStyle(key: string): CategoryStyle {
  return CATEGORIES[key] ?? { ...FALLBACK_STYLE, label: key };
}

export const CATEGORY_MAP: CategoryMap = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, v.subcategories])
);
