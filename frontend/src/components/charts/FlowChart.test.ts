import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FlowChart from './FlowChart.svelte';
import type { MonthFlow } from '../../lib/aggregations';

const DATA: MonthFlow[] = [
  { ym: '2026-01', incoming: 0, outgoing: 0 },
  { ym: '2026-02', incoming: 500, outgoing: 200 },
  { ym: '2026-03', incoming: 1000, outgoing: 800 },
];

describe('FlowChart', () => {
  it('renders one button per month', () => {
    const { getAllByRole } = render(FlowChart, { data: DATA, selected: '2026-03', onselect: () => {} });
    expect(getAllByRole('button')).toHaveLength(3);
  });

  it('marks the selected month as pressed', () => {
    const { getByRole } = render(FlowChart, { data: DATA, selected: '2026-02', onselect: () => {} });
    expect(getByRole('button', { name: /February 2026/ })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: /March 2026/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onselect with the tapped month', async () => {
    const onselect = vi.fn();
    const { getByRole } = render(FlowChart, { data: DATA, selected: '2026-03', onselect });
    await fireEvent.click(getByRole('button', { name: /January 2026/ }));
    expect(onselect).toHaveBeenCalledWith('2026-01');
  });

  it('labels columns with short month names', () => {
    const { getByText } = render(FlowChart, { data: DATA, selected: '2026-03', onselect: () => {} });
    expect(getByText('Jan')).toBeInTheDocument();
    expect(getByText('Feb')).toBeInTheDocument();
    expect(getByText('Mar')).toBeInTheDocument();
  });
});
