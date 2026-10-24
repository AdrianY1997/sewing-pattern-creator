import { expect, test } from '@playwright/test'
import path from 'node:path'

/** Reference screenshots, only when SCREENSHOT_DIR is set (SCREENSHOT_DIR=… npm run test:e2e). */
const dir = process.env.SCREENSHOT_DIR ?? ''

test.skip(!dir, 'set SCREENSHOT_DIR to capture screenshots')
test.use({ viewport: { width: 1536, height: 1024 } })

test('editor screenshots', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  const front = page.getByTestId('piece-item').filter({ hasText: 'Delantero' })
  await front.click()
  await page.mouse.move(700, 500)
  await page.screenshot({ path: path.join(dir, 'f2a-editor.png') })

  await front.click()
  await page.getByRole('checkbox', { name: 'Tallas' }).check()
  await expect(page.getByTestId('layer-sizes')).toHaveCount(1)
  await page.screenshot({ path: path.join(dir, 'f2a-sizes.png') })
})

test('F2b: segment selected with a snap marker', async ({ page }) => {
  await page.goto('./')
  await page.locator('[data-segment="front.shoulder"]').click()
  await expect(page.getByTestId('inspector')).toBeVisible()
  // Near the midpoint of the back side seam.
  const side = await page.locator('[data-segment="back.side"]').boundingBox()
  if (!side) throw new Error('no segment')
  await page.mouse.move(side.x + side.width / 2 + 4, side.y + side.height / 2 + 3)
  await expect(page.getByTestId('snap-marker')).toBeVisible()
  await page.screenshot({ path: path.join(dir, 'f2b-editor.png') })
})

test('F4a: separated pieces, with and without nested sizes', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('separate-all').click()
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  await page.mouse.move(700, 900)
  await page.screenshot({ path: path.join(dir, 'f4a-pieces.png') })
  await page.getByRole('checkbox', { name: 'Tallas' }).check()
  await expect(page.getByTestId('layer-sizes')).toHaveCount(1)
  await page.screenshot({ path: path.join(dir, 'f4a-pieces-sizes.png') })
})

test('F4b: skirt and trousers separated, with seam allowance and notches', async ({ page }) => {
  for (const [block, file] of [
    ['women-skirt', 'f4b-skirt.png'],
    ['women-trousers', 'f4b-trousers.png'],
  ] as const) {
    await page.goto('./')
    await page.getByLabel('Tipo de prenda').selectOption(block)
    await page.getByTestId('separate-all').click()
    await expect(page.getByTestId('seam-line')).toHaveCount(2)
    await page.locator('.layers-head').click()
    // A notch added by clicking on the outline of the back piece (centre back, half way).
    await page.getByRole('button', { name: 'Añadir piquete' }).click()
    const outline = await page
      .locator('[data-testid="piece-outline"][data-piece="back"]')
      .boundingBox()
    if (!outline) throw new Error('no back piece')
    await page.mouse.click(outline.x + 1, outline.y + outline.height * 0.3)
    // The notch selects the back piece: its Márgenes / Marcas show in the right panel.
    await page.getByRole('button', { name: 'Seleccionar', exact: true }).click()
    await expect(page.getByTestId('allowance-section')).toBeVisible()
    await page.mouse.move(700, 1000)
    await page.screenshot({ path: path.join(dir, file) })
  }
})

test.describe('narrow', () => {
  test.use({ viewport: { width: 1000, height: 800 } })
  test('F2b: drawers at 1000 px', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Panel de detalles' }).click()
    await expect(page.getByRole('complementary', { name: 'Detalles del patrón' })).toBeVisible()
    await page.screenshot({ path: path.join(dir, 'f2b-narrow.png') })
  })
})
