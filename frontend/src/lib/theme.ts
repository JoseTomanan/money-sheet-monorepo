export interface CategoryStyle {
  color: string;
  soft: string;
  pastel: string;
  label: string;
}

export const CATEGORIES: Record<string, CategoryStyle> = {
  HOUSING:   { color: '#2a5899', soft: 'rgba(58, 123, 200, 0.14)',  pastel: '#dce8f8', label: 'Housing' },
  FOOD:      { color: '#1e6b3d', soft: 'rgba(47, 138, 85, 0.14)',   pastel: '#d2eedc', label: 'Food' },
  TRANSIT:   { color: '#9a2e1c', soft: 'rgba(193, 74, 50, 0.14)',   pastel: '#f8ddd9', label: 'Transit' },
  HEALTH:    { color: '#9a5c0a', soft: 'rgba(196, 120, 24, 0.14)',  pastel: '#fdecd0', label: 'Health' },
  FINANCE:   { color: '#636b0e', soft: 'rgba(138, 150, 24, 0.14)',  pastel: '#eef0c8', label: 'Finance' },
  LIFESTYLE: { color: '#4a4a4a', soft: 'rgba(120, 120, 120, 0.14)', pastel: '#e8e8e8', label: 'Lifestyle' },
  MISC:      { color: '#4e3aab', soft: 'rgba(102, 80, 196, 0.14)',  pastel: '#e4dff8', label: 'Misc' },
};

export const CATEGORY_ORDER = ['HOUSING', 'FOOD', 'TRANSIT', 'HEALTH', 'FINANCE', 'LIFESTYLE', 'MISC'] as const;
