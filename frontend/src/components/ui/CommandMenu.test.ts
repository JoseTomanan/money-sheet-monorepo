import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import CommandMenu from './CommandMenu.svelte';
import { appCommands } from '$lib/commandMenu';

const originalScrollIntoView = Element.prototype.scrollIntoView;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Element.prototype.scrollIntoView = originalScrollIntoView; });

it('updates disabled reasons while open and admits an enabled selection once', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const state = { loading: false, error: null, selecting: false, entries: false, redistributionAvailable: false, syncAction: 'Refresh data' };
  const onclose = vi.fn(); const onselect = vi.fn(() => true);
  const props = { open: true, commands: appCommands(state), opener: null, onclose, onselect };
  const view = render(CommandMenu, props);
  const add = () => view.getByRole('option', { name: 'Add Entry' });
  await waitFor(() => expect(view.getByRole('combobox')).toHaveFocus());
  await fireEvent.input(view.getByRole('combobox'), { target: { value: 'new' } });
  await view.rerender({ ...props, commands: appCommands({ ...state, loading: true }) });
  expect(add()).toHaveAttribute('aria-disabled', 'true');
  expect(add()).toHaveAccessibleDescription('Wait for data to load.');
  await fireEvent.click(add());
  await fireEvent.keyDown(view.getByRole('combobox'), { key: 'Enter' });
  expect(onclose).not.toHaveBeenCalled();
  await view.rerender({ ...props, commands: appCommands(state) });
  await fireEvent.keyDown(view.getByRole('combobox'), { key: 'Enter', repeat: true });
  expect(onclose).not.toHaveBeenCalled();
  await fireEvent.click(add()); await fireEvent.click(add());
  expect(onclose).toHaveBeenCalledTimes(1);
  expect(onselect).not.toHaveBeenCalled();
  await view.rerender({ ...props, open: false });
  await waitFor(() => expect(onselect).toHaveBeenCalledExactlyOnceWith('add'));
  await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
});
