import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Toast from './toast.svelte';

describe('Toast', () => {
  it('renders structured error copy and separate recovery controls without taking focus', async () => {
    const retry = vi.fn();
    const settings = vi.fn();
    const dismiss = vi.fn();
    const before = document.activeElement;
    const view = render(Toast, {
      message: 'Not updated: entries, balances, categories, settings, statistics.',
      presentation: { heading: "Couldn't refresh your data" },
      variant: 'destructive', isConnection: true,
      action: { label: 'Retry', run: retry }, onSettings: settings, onDismiss: dismiss,
    });
    expect(view.getByRole('heading', { name: "Couldn't refresh your data" })).toBeInTheDocument();
    expect(view.getByRole('alert')).toHaveTextContent("Couldn't refresh your data Not updated:");
    expect(view.getByRole('status').textContent).toBe('');
    expect(document.activeElement).toBe(before);
    await fireEvent.click(view.getByRole('button', { name: 'Retry' }));
    await fireEvent.click(view.getByRole('button', { name: 'Check Settings' }));
    await fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(settings).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps live regions stable, announces confirmations politely, and alerts for generic errors', async () => {
    const view = render(Toast, { message: null, onDismiss: vi.fn() });
    const polite = view.getByRole('status');
    const alert = view.getByRole('alert');
    await view.rerender({ message: 'Saved', onDismiss: vi.fn() });
    expect(view.getByRole('status')).toBe(polite);
    expect(polite).toHaveTextContent('Saved');
    expect(alert.textContent).toBe('');
    expect(view.queryByRole('heading')).toBeNull();
    await view.rerender({ message: 'Invalid entry', isError: true, onDismiss: vi.fn() });
    expect(view.getByRole('alert')).toBe(alert);
    expect(alert).toHaveTextContent('Invalid entry');
    expect(polite.textContent).toBe('');
    await view.rerender({ message: null, onDismiss: vi.fn() });
    expect(view.queryByRole('region', { name: 'Notification' })).toBeNull();
    expect(alert.textContent).toBe('');
  });
});
