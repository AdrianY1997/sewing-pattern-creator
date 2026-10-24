import { expect, test } from '@playwright/test'

test('loads and shows the title', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Sewing Pattern Creator' })).toBeVisible()
})
