import type { CategoryMap } from './types';

export interface CategoryStyle {
  color: string;
  soft: string;
  pastel: string;
  dot: string;
  darkColor: string;
  darkDot: string;
  darkSoft: string;
  label: string;
  subcategories: string[];
}

/** The fixed top-level budget Categories, in their spreadsheet/display order. */
export const CATEGORY_ORDER = ['HOUSING', 'FOOD', 'TRANSIT', 'HEALTH', 'FINANCE', 'LIFESTYLE', 'MISC'] as const;

type Category = typeof CATEGORY_ORDER[number];

// Derive the dark label, marker, and tint from the same hue.
function darkCategoryColors(rgb: string) {
  return {
    darkColor: `rgba(${rgb}, 0.9)`,
    darkDot: `rgba(${rgb}, 0.65)`,
    darkSoft: `rgba(${rgb}, 0.06)`,
  };
}

export const CATEGORIES: Record<Category, CategoryStyle> = {
  HOUSING:   { color: '#2a5899', soft: 'rgba(58, 123, 200, 0.14)',  pastel: '#dce8f8', dot: '#2f78bc', ...darkCategoryColors('151, 181, 220'), label: 'Housing',
               subcategories: ['Rent', 'Utilities', 'Maintenance'] },
  FOOD:      { color: '#186e34', soft: 'rgba(26, 138, 63, 0.14)',   pastel: '#cdebd6', dot: '#258a46', ...darkCategoryColors('155, 195, 164'), label: 'Food',
               subcategories: ['Groceries', 'Dining'] },
  TRANSIT:   { color: '#9a2e1c', soft: 'rgba(193, 74, 50, 0.14)',   pastel: '#f8ddd9', dot: '#b03636', ...darkCategoryColors('221, 160, 152'), label: 'Transit',
               subcategories: ['Commute Fare', 'Auto Maintenance', 'Fuel', 'Parking'] },
  HEALTH:    { color: '#9a5c0a', soft: 'rgba(196, 120, 24, 0.14)',  pastel: '#fdecd0', dot: '#ae5206', ...darkCategoryColors('215, 173, 132'), label: 'Health',
               subcategories: ['Consultation Fee', 'Pharmacy', 'Fitness', 'Insurance'] },
  FINANCE:   { color: '#636b0e', soft: 'rgba(138, 150, 24, 0.14)',  pastel: '#eef0c8', dot: '#9e8200', ...darkCategoryColors('201, 184, 94'), label: 'Finance',
               subcategories: ['Tax', 'Debt', 'Investment', 'Savings'] },
  LIFESTYLE: { color: '#4a4a4a', soft: 'rgba(120, 120, 120, 0.14)', pastel: '#e8e8e8', dot: '#5e5e5e', ...darkCategoryColors('184, 185, 194'), label: 'Lifestyle',
               subcategories: ['Leisure', 'Entertainment', 'Subscription', 'Grooming', 'Clothing', 'Gifts'] },
  MISC:      { color: '#4e3aab', soft: 'rgba(102, 80, 196, 0.14)',  pastel: '#e4dff8', dot: '#6040b0', ...darkCategoryColors('185, 168, 216'), label: 'Misc',
               subcategories: ['Career', 'Uniform', 'Tools'] },
};

const FALLBACK_STYLE: CategoryStyle = {
  color: 'var(--muted-foreground)',
  soft: 'var(--muted)',
  pastel: 'var(--muted)',
  dot: 'var(--muted-foreground)',
  darkColor: 'var(--muted-foreground)',
  darkDot: 'var(--muted-foreground)',
  darkSoft: 'var(--muted)',
  label: '',
  subcategories: [],
};

export function resolveCategoryStyle(key: string): CategoryStyle {
  return CATEGORIES[key] ?? { ...FALLBACK_STYLE, label: key };
}

export const CATEGORY_MAP: CategoryMap = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, v.subcategories])
);
