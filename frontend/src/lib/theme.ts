export interface CategoryStyle {
  color: string;
  soft: string;
  label: string;
}

export const CATEGORIES: Record<string, CategoryStyle> = {
  HOUSING:   { color: '#3a7bc8', soft: 'rgba(58, 123, 200, 0.14)',  label: 'Housing' },
  FOOD:      { color: '#2f8a55', soft: 'rgba(47, 138, 85, 0.14)',   label: 'Food' },
  TRANSIT:   { color: '#c14a32', soft: 'rgba(193, 74, 50, 0.14)',   label: 'Transit' },
  HEALTH:    { color: '#c47818', soft: 'rgba(196, 120, 24, 0.14)',  label: 'Health' },
  FINANCE:   { color: '#8a9618', soft: 'rgba(138, 150, 24, 0.14)',  label: 'Finance' },
  LIFESTYLE: { color: '#787878', soft: 'rgba(120, 120, 120, 0.14)', label: 'Lifestyle' },
  MISC:      { color: '#6650c4', soft: 'rgba(102, 80, 196, 0.14)',  label: 'Misc' },
};

export const CATEGORY_ORDER = ['HOUSING', 'FOOD', 'TRANSIT', 'HEALTH', 'FINANCE', 'LIFESTYLE', 'MISC'] as const;
