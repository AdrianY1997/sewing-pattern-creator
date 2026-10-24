import { expect, test } from '@playwright/test'
import path from 'node:path'

test.use({ viewport: { width: 1536, height: 1024 } })

/** Optional reference screenshots: SCREENSHOT_DIR=… npm run test:e2e */
const dir = process.env.SCREENSHOT_DIR ?? ''

const TROUSERS = [
  {
    id: 'women-trousers',
    label: 'Pantalón base mujer',
    size: '10',
    sizes: ['6', '16', '10'],
    shot: 'women-trousers-10.png',
  },
  {
    id: 'men-trousers',
    label: 'Pantalón base hombre',
    size: '48',
    sizes: ['40', '54', '48'],
    shot: 'men-trousers-48.png',
  },
] as const

for (const block of TROUSERS)
  test(`selecting "${block.label}" in Tipo de prenda drafts front and back`, async ({ page }) => {
    await page.goto('./')
    await page.getByRole('combobox', { name: 'Tipo de prenda' }).selectOption(block.id)
    await expect(page.getByTestId('block-select')).toHaveValue(block.id)
    await expect(page.getByTestId('size-select')).toHaveValue(block.size)
    await expect(page.getByTestId('piece-outline')).toHaveCount(2)
    for (const id of ['front', 'back'])
      await expect(
        page.locator(`[data-testid="piece-outline"][data-piece="${id}"]`),
      ).toHaveAttribute('d', /^M /)
    await expect(page.getByTestId('piece-item')).toHaveText([/Delantero\s*x2/, /Espalda\s*x2/])
    await expect(page.getByLabel('Título del patrón')).toHaveValue(block.label)

    for (const size of block.sizes) {
      await page.getByTestId('size-select').selectOption(size)
      await expect(page.getByTestId('piece-outline')).toHaveCount(2)
    }

    if (dir) {
      await page.mouse.move(700, 500)
      await page.screenshot({ path: path.join(dir, block.shot) })
    }
  })
