import { expect, it } from 'vitest';
import { createRedistributionForm } from './redistributionForm.svelte';
import { today } from './format';

it('builds one ordered Incoming drain/credit pair from an unblurred expression', () => {
  const form = createRedistributionForm();
  form.source = 'FOOD';
  form.target = 'FINANCE';
  form.amount = '100-30';
  expect(form.submitDisabled).toBe(false);
  expect(form.buildPayloads()).toEqual([
    { date: today(), tag: 'FOOD', direction: 'I', description: '[REDISTRIBUTE]', amount: -70 },
    { date: today(), tag: 'FINANCE', direction: 'I', description: '[REDISTRIBUTE]', amount: 70 },
  ]);
});

it('resets the draft for reopening and requires distinct Categories and a positive policy amount', () => {
  const form = createRedistributionForm();
  form.source = 'FOOD'; form.target = 'FOOD'; form.amount = '10';
  expect(form.submitDisabled).toBe(true);
  expect(() => form.buildPayloads()).toThrow('Invalid redistribution');
  form.target = 'FINANCE';
  for (const amount of ['0', '-5', '0.001+0', '10+', '=SUM(10,)', '']) {
    form.amount = amount;
    expect(form.submitDisabled).toBe(true);
    expect(() => form.buildPayloads()).toThrow('Invalid redistribution');
  }
  form.amount = '1.239+0';
  expect(form.buildPayloads().map(leg => leg.amount)).toEqual([-1.24, 1.24]);
  form.reset();
  expect([form.source, form.target, form.amount]).toEqual(['', '', '']);
  expect(form.submitDisabled).toBe(true);
});
