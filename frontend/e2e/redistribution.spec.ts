import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`redistribution contains keyboard focus, dismisses and resets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'Redistribute', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Redistribute Funds' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

    // Wrap both ends of the tab order; background controls must remain unreachable.
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button').last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

    await dialog.getByRole('button', { name: 'HOUSING', exact: true }).first().click();
    await dialog.getByRole('button', { name: 'FOOD', exact: true }).last().click();
    const amount = dialog.getByPlaceholder('0.00');
    await amount.fill('125');
    await expect(dialog.getByRole('button', { name: 'Redistribute', exact: true })).toBeEnabled();
    await amount.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(amount).toHaveValue('');
    await expect(dialog.getByRole('button', { pressed: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Redistribute', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

    const transfers = page.locator('.entry-card').filter({ hasText: '[REDISTRIBUTE]' });
    const previousCount = await transfers.count();
    await trigger.click();
    await dialog.getByRole('button', { name: 'HOUSING', exact: true }).first().click();
    await dialog.getByRole('button', { name: 'FOOD', exact: true }).last().click();
    await amount.fill('125');
    await dialog.getByRole('button', { name: 'Redistribute', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(transfers).toHaveCount(previousCount + 2);
  });
}
