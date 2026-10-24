import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1536, height: 1024 } })

const seam = (page: Page, piece: string) =>
  page.locator(`[data-testid="seam-line"][data-piece="${piece}"]`)

const separateAll = async (page: Page) => {
  await page.goto('./')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  await page.getByTestId('separate-all').click()
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  // The floating Capas panel sits over the back piece: collapse it.
  await page.locator('.layers-head').click()
}

test('seam allowance, notches by clicking, size change, undo and redo', async ({ page }) => {
  await separateAll(page)
  // Costura: one dashed cut line per piece.
  await expect(page.getByTestId('layer-seam')).toBeVisible()
  await expect(page.getByTestId('seam-line')).toHaveCount(2)

  // One edge to 2 cm.
  await page.getByTestId('piece-item').filter({ hasText: 'Espalda' }).click()
  const d0 = await seam(page, 'back').getAttribute('d')
  const shoulder = page.locator('[data-testid="allowance-input"][data-segment="back.shoulder"]')
  await expect(shoulder).toHaveValue('10')
  await shoulder.fill('20')
  await shoulder.press('Enter')
  await expect(seam(page, 'back')).not.toHaveAttribute('d', d0!)
  await expect(shoulder).toHaveValue('20')
  const d1 = await seam(page, 'back').getAttribute('d')

  // "Añadir piquete": click on the centre back of the back piece.
  const notches = page.locator('[data-testid="notch"][data-notch^="back/"]')
  const before = await notches.count()
  await page.getByRole('button', { name: 'Añadir piquete' }).click()
  const outline = await page
    .locator('[data-testid="piece-outline"][data-piece="back"]')
    .boundingBox()
  if (!outline) throw new Error('no back outline')
  // The centre back is cut on the fold (no allowance, so no cut-line notch): click the hem instead,
  // a little above it (snap tolerance).
  const at = { x: outline.x + outline.width * 0.5, y: outline.y + outline.height - 3 }
  await page.mouse.move(at.x, at.y)
  await expect(page.getByTestId('notch-preview')).toHaveCount(1)
  await page.mouse.click(at.x, at.y)
  await expect(notches).toHaveCount(before + 1)
  // Repeated on the cut line.
  await expect(page.locator('[data-testid="seam-notch"][data-notch^="back/"]')).toHaveCount(
    before + 1,
  )
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click()
  await expect(page.getByTestId('marks-section').getByTestId('mark-item')).toHaveCount(
    before + 2, // + grainline
  )

  // Another size: the allowance and the notch replay.
  await page.locator('.size-chips [data-size="14"]').click()
  await expect(page.locator('.size-chips [data-size="14"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(notches).toHaveCount(before + 1)
  await expect(page.getByTestId('replay-issues')).toHaveCount(0)
  await expect(seam(page, 'back')).not.toHaveAttribute('d', d1!)
  // The piece stays selected: its allowance is still 2 cm.
  await expect(
    page.locator('[data-testid="allowance-input"][data-segment="back.shoulder"]'),
  ).toHaveValue('20')

  // Undo the notch, then the allowance; redo both.
  const undo = page.getByRole('button', { name: 'Deshacer' })
  const redo = page.getByRole('button', { name: 'Rehacer' })
  await undo.click()
  await expect(notches).toHaveCount(before)
  await undo.click()
  await expect(
    page.locator('[data-testid="allowance-input"][data-segment="back.shoulder"]'),
  ).toHaveValue('10')
  await redo.click()
  await redo.click()
  await expect(notches).toHaveCount(before + 1)
  await expect(
    page.locator('[data-testid="allowance-input"][data-segment="back.shoulder"]'),
  ).toHaveValue('20')
})

test('Aplicar a todos, typed notch, delete a mark and the Costura layer toggle', async ({
  page,
}) => {
  await separateAll(page)
  await page.getByTestId('piece-item').filter({ hasText: 'Delantero' }).click()
  const d0 = await seam(page, 'front').getAttribute('d')
  await page.getByLabel('Margen para todos los bordes (mm)').fill('15')
  await page.getByTestId('allowance-all').click()
  await expect(seam(page, 'front')).not.toHaveAttribute('d', d0!)
  const inputs = page.getByTestId('allowance-input')
  const n = await inputs.count()
  // The centre front is cut on the fold ("al doblez" by default): disabled, always 0.
  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i)
    await expect(input).toHaveValue((await input.isDisabled()) ? '0' : '15')
  }

  // Typed notch: select the shoulder edge, then 30 mm from its start.
  await page.locator('tr[data-segment="front.shoulder"] .edge-name').click()
  const marks = page.getByTestId('marks-section').getByTestId('mark-item')
  const count = await marks.count()
  await page.getByTestId('notch-mm').fill('30')
  await page.getByTestId('notch-mm').press('Enter')
  await expect(marks).toHaveCount(count + 1)
  await expect(marks.last()).toContainText('Hombro 3.0 cm')
  await marks.last().getByTestId('mark-delete').click()
  await expect(marks).toHaveCount(count)

  await page.locator('.layers-head').click()
  await page.getByRole('checkbox', { name: 'Costura' }).uncheck()
  await expect(page.getByTestId('seam-line')).toHaveCount(0)
})

test('the grainline handle rotates with Shift snapping to 45°', async ({ page }) => {
  await separateAll(page)
  await page.getByTestId('piece-item').filter({ hasText: 'Delantero' }).click()
  const centre = await page.getByTestId('grain-handle-move').boundingBox()
  const ends = page.getByTestId('grain-handle-rotate')
  const end = await ends.last().boundingBox()
  if (!centre || !end) throw new Error('no grainline handles')
  const c = { x: centre.x + centre.width / 2, y: centre.y + centre.height / 2 }
  const e = { x: end.x + end.width / 2, y: end.y + end.height / 2 }
  const r = Math.hypot(e.x - c.x, e.y - c.y)
  await page.mouse.move(e.x, e.y)
  await page.mouse.down()
  await page.keyboard.down('Shift')
  // Towards 40° off the grain: snaps to 45°.
  const a = (40 * Math.PI) / 180
  await page.mouse.move(c.x - r * Math.sin(a), c.y + r * Math.cos(a), { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('marks-section').locator('[data-kind="grainline"]')).toContainText(
    'Hilo · 45°',
  )

  // Move it by the centre handle, then reset.
  const c2 = await page.getByTestId('grain-handle-move').boundingBox()
  if (!c2) throw new Error('no handle')
  await page.mouse.move(c2.x + c2.width / 2, c2.y + c2.height / 2)
  await page.mouse.down()
  await page.mouse.move(c2.x + 40, c2.y + 10, { steps: 4 })
  await page.mouse.up()
  const moved = await page.getByTestId('grain-handle-move').boundingBox()
  expect(Math.abs(moved!.x - c2.x)).toBeGreaterThan(20)
  await page.getByRole('button', { name: 'Restablecer' }).click()
  await expect(page.getByTestId('marks-section').locator('[data-kind="grainline"]')).toContainText(
    'Hilo · 0°',
  )
})
