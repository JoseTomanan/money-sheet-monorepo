import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import PaceChart from './PaceChart.svelte';

const cumulative = (daily: number[]) => {
  let run = 0;
  return daily.map(v => (run += v));
};

describe('PaceChart', () => {
  it('renders an svg with current and previous month paths', () => {
    const { container } = render(PaceChart, {
      current: cumulative([100, 0, 50, ...new Array(28).fill(0)]),
      previous: cumulative([20, 30, ...new Array(28).fill(10)]),
      upToDay: 3,
      curLabel: 'Jun',
      prevLabel: 'May',
    });
    expect(container.querySelector('svg')).not.toBeNull();
    // baseline + ghost + area + current line at minimum
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the today marker when the month is in progress', () => {
    const { container } = render(PaceChart, {
      current: cumulative([100, ...new Array(29).fill(0)]),
      previous: [],
      upToDay: 10,
      curLabel: 'Jun',
      prevLabel: 'May',
    });
    expect(container.querySelector('circle')).not.toBeNull();
  });

  it('omits the today marker for a completed month', () => {
    const days = cumulative(new Array(30).fill(10));
    const { container } = render(PaceChart, {
      current: days,
      previous: [],
      upToDay: 30,
      curLabel: 'May',
      prevLabel: 'Apr',
    });
    expect(container.querySelector('circle')).toBeNull();
  });

  it('renders both legend labels when a previous month is supplied', () => {
    const { getByText } = render(PaceChart, {
      current: cumulative(new Array(30).fill(5)),
      previous: cumulative(new Array(31).fill(5)),
      upToDay: 30,
      curLabel: 'Jun',
      prevLabel: 'May',
    });
    expect(getByText('Jun')).toBeInTheDocument();
    expect(getByText('May')).toBeInTheDocument();
  });

  it('does not crash with empty data', () => {
    const { container } = render(PaceChart, {
      current: [],
      previous: [],
      upToDay: 0,
      curLabel: 'Jun',
      prevLabel: 'May',
    });
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
