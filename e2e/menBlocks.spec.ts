import { expect, test } from '@playwright/test'
import path from 'node:path'

test.use({ viewport: { width: 1536, height: 1024 } })

/** Optional reference screenshots: SCREENSHOT_DIR=… npm run test:e2e */
const dir = process.env.SCREENSHOT_DIR ?? ''

const BLOCKS = [
  {
    id: 'men-bodice',
    label: 'Cuerpo base / camisa hombre',
    pieces: ['back', 'front'],
    items: [/Espalda\s*x1/, /Delantero\s*x1/],
    armhole: { piece: 'Delantero', text: '26.6 cm' },
    shot: 'men-bodice-48.png',
  },
  {
    id: 'men-sleeve',
    label: 'Manga base hombre',
    pieces: ['sleeve'],
    items: [/Manga\s*x2/],
    armhole: null,
    shot: 'men-sleeve-48.png',
  },
] as const

for (const block of BLOCKS)
  test(`selecting "${block.label}" in Tipo de prenda drafts it in men's sizes`, async ({
    page,
  }) => {
    await page.goto('./')
    await page.getByRole('combobox', { name: 'Tipo de prenda' }).selectOption(block.id)
    await expect(page.getByTestId('block-select')).toHaveValue(block.id)
    await expect(page.getByTestId('size-select')).toHaveValue('48')
    await expect(page.getByTestId('piece-outline')).toHaveCount(block.pieces.length)
    for (const id of block.pieces)
      await expect(
        page.locator(`[data-testid="piece-outline"][data-piece="${id}"]`),
      ).toHaveAttribute('d', /^M /)
    await expect(page.getByTestId('piece-item')).toHaveText([...block.items])

    // Every size drafts without errors.
    for (const size of ['40', '54', '48']) {
      await page.getByTestId('size-select').selectOption(size)
      await expect(page.getByTestId('piece-outline')).toHaveCount(block.pieces.length)
    }

    if (dir) {
      await page.mouse.move(700, 500)
      await page.screenshot({ path: path.join(dir, block.shot) })
    }

    // The Sisa readout picks up the armhole segments of the men's bodice.
    if (block.armhole) {
      await page.getByTestId('piece-item').filter({ hasText: block.armhole.piece }).click()
      await expect(page.getByTestId('piece-armhole')).toHaveText(block.armhole.text)
    }
  })
