import { expect, test } from '@playwright/test'

test('loads and shows the title', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Sewing Pattern Creator' })).toBeVisible()
})

test('renders the women bodice preview and reacts to size and toggles', async ({ page }) => {
  await page.goto('./')
  const svg = page.getByTestId('draft-svg')
  await expect(svg).toBeVisible()
  await expect(svg.locator('path.outline')).toHaveCount(2)
  const box = await svg.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(200)
  expect(box?.height ?? 0).toBeGreaterThan(200)
  await expect(page.getByTestId('labels-layer')).toBeVisible()

  const armhole = page.getByTestId('armhole-back')
  await expect(armhole).toHaveText(/^\d+\.\d cm$/)
  const at10 = await armhole.textContent()
  await page.getByTestId('size-select').selectOption('16')
  await expect(armhole).not.toHaveText(at10 ?? '')

  await page.getByLabel('Nombres de puntos').uncheck()
  await expect(page.getByTestId('labels-layer')).toHaveCount(0)
  await page.getByLabel('Líneas de construcción').uncheck()
  await expect(page.getByTestId('construction-layer')).toHaveCount(0)
})
