import { expect, test } from '@playwright/test'
import path from 'node:path'

test.use({ viewport: { width: 1536, height: 1024 } })

/** Optional reference screenshots: SCREENSHOT_DIR=… npm run test:e2e */
const dir = process.env.SCREENSHOT_DIR ?? ''

const BLOCKS = [
  { id: 'women-sleeve', label: 'Manga base mujer', pieces: ['sleeve'], items: [/Manga\s*x2/] },
  {
    id: 'women-skirt',
    label: 'Falda base mujer',
    pieces: ['back', 'front'],
    items: [/Espalda\s*x1/, /Delantero\s*x1/],
  },
] as const

const shots: Record<string, string> = {
  'women-sleeve': 'sleeve-10.png',
  'women-skirt': 'skirt-10.png',
}

for (const block of BLOCKS)
  test(`selecting "${block.label}" in Tipo de prenda drafts it`, async ({ page }) => {
    await page.goto('./')
    await page.getByRole('combobox', { name: 'Tipo de prenda' }).selectOption(block.id)
    await expect(page.getByTestId('block-select')).toHaveValue(block.id)
    await expect(page.getByTestId('size-select')).toHaveValue('10')
    await expect(page.getByTestId('piece-outline')).toHaveCount(block.pieces.length)
    for (const id of block.pieces)
      await expect(
        page.locator(`[data-testid="piece-outline"][data-piece="${id}"]`),
      ).toHaveAttribute('d', /^M /)
    await expect(page.getByTestId('piece-item')).toHaveText([...block.items])

    // Every size drafts without errors.
    for (const size of ['6', '16', '10']) {
      await page.getByTestId('size-select').selectOption(size)
      await expect(page.getByTestId('piece-outline')).toHaveCount(block.pieces.length)
    }

    if (dir) {
      await page.mouse.move(700, 500)
      await page.screenshot({ path: path.join(dir, shots[block.id]) })
    }
  })
