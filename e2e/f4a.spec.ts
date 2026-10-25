import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1536, height: 1024 } })

const outline = (page: Page, piece: string) =>
  page.locator(`[data-testid="piece-outline"][data-piece="${piece}"]`)

const box = async (page: Page, piece: string) => {
  const b = await outline(page, piece).boundingBox()
  if (!b) throw new Error(`no box for ${piece}`)
  return b
}

const separateAll = async (page: Page) => {
  await page.goto('./')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  await page.getByTestId('separate-all').click()
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
}

test('separate all, mirror, undo, redo and change size keep the pieces', async ({ page }) => {
  await separateAll(page)
  await expect(page.getByRole('button', { name: 'Piezas', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // Separated: back and front no longer overlap.
  const back = await box(page, 'back')
  const front = await box(page, 'front')
  expect(back.x + back.width).toBeLessThan(front.x)

  const undo = page.getByRole('button', { name: 'Deshacer' })
  const redo = page.getByRole('button', { name: 'Rehacer' })
  await expect(undo).toBeEnabled()
  await expect(redo).toBeDisabled()

  await page.getByTestId('piece-item').filter({ hasText: 'Delantero' }).click()
  const before = await outline(page, 'front').getAttribute('d')
  await page.getByTestId('piece-editor').getByRole('button', { name: 'Espejar ↔' }).click()
  const mirrored = await outline(page, 'front').getAttribute('d')
  expect(mirrored).not.toBe(before)

  await undo.click()
  await expect(outline(page, 'front')).toHaveAttribute('d', before!)
  await redo.click()
  await expect(outline(page, 'front')).toHaveAttribute('d', mirrored!)
  // Keyboard shortcuts.
  await page.locator('body').press('Control+z')
  await expect(outline(page, 'front')).toHaveAttribute('d', before!)
  await page.locator('body').press('Control+Shift+z')
  await expect(outline(page, 'front')).toHaveAttribute('d', mirrored!)
  await page.locator('body').press('Control+z')
  await page.locator('body').press('Control+y')
  await expect(outline(page, 'front')).toHaveAttribute('d', mirrored!)

  // Another size: the operations replay, the pieces are still there.
  await page.locator('.size-chips [data-size="14"]').click()
  await expect(page.locator('.size-chips [data-size="14"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  await expect(outline(page, 'front')).not.toHaveAttribute('d', mirrored!)
  await expect(page.getByTestId('replay-issues')).toHaveCount(0)

  // Trazo still shows the combined construction.
  await page.getByRole('button', { name: 'Trazo', exact: true }).click()
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'trace')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
})

test('context menu: cut on fold on the centre back, rotate and duplicate', async ({ page }) => {
  await separateAll(page)
  // The floating Capas panel sits over the back piece: collapse it.
  await page
    .locator('.layers-head[aria-expanded="true"]')
    .click({ timeout: 500 })
    .catch(() => undefined)
  // Select the centre back edge, then right-click it.
  // (A vertical path has a zero-width box, which Playwright treats as hidden: click its centre.)
  const cb = await page.locator('[data-segment="back/back.cb"]').boundingBox()
  if (!cb) throw new Error('no centre back edge')
  const at = { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }
  await page.mouse.click(at.x, at.y)
  await expect(page.getByTestId('segment-selection')).toHaveAttribute(
    'data-segment',
    'back/back.cb',
  )
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const menu = page.getByTestId('piece-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Cortar al doblez' }).click()
  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('fold-line')).toHaveCount(1)

  const before = await box(page, 'front')
  // A dart line of the same piece may lie under that point: it opens the same menu.
  await outline(page, 'front').click({ button: 'right', position: { x: 60, y: 200 }, force: true })
  await page.getByTestId('piece-menu').getByRole('menuitem', { name: 'Rotar 90°' }).click()
  const after = await box(page, 'front')
  // A 90° turn swaps the width and the height of the bounding box.
  expect(Math.abs(after.width - before.height)).toBeLessThan(3)

  await outline(page, 'front').click({ button: 'right', position: { x: 20, y: 20 } })
  await page.getByTestId('piece-menu').getByRole('menuitem', { name: 'Duplicar' }).click()
  await expect(page.getByTestId('piece-outline')).toHaveCount(3)
  await expect(outline(page, 'front-2')).toHaveCount(1)
})

test('Mover drags a piece and commits one operation', async ({ page }) => {
  await separateAll(page)
  await page.getByRole('button', { name: 'Mover', exact: true }).click()
  const before = await box(page, 'back')
  const start = { x: before.x + before.width * 0.4, y: before.y + before.height * 0.6 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) await page.mouse.move(start.x + i * 8, start.y + i * 12)
  await page.mouse.up()
  const after = await box(page, 'back')
  expect(after.y - before.y).toBeGreaterThan(40)
  // One drag = one undo step.
  await page.getByRole('button', { name: 'Deshacer' }).click()
  const undone = await box(page, 'back')
  expect(Math.abs(undone.y - before.y)).toBeLessThan(1)
  expect(Math.abs(undone.x - before.x)).toBeLessThan(1)
})

test('meta fields edit the piece label', async ({ page }) => {
  await separateAll(page)
  await page.getByTestId('piece-item').filter({ hasText: 'Espalda' }).click()
  await page.getByTestId('meta-count').fill('2')
  await page.getByTestId('meta-fabric').fill('Forro')
  await page.getByTestId('meta-fabric').press('Enter')
  const label = page.locator('[data-testid="piece-label"][data-piece="back"]')
  await expect(label).toContainText('x2')
  await expect(label).toContainText('(Forro)')
})

test('Rotar drags with Shift in 15° steps; Simetría mirrors the selected piece', async ({
  page,
}) => {
  await separateAll(page)
  await page.getByTestId('piece-item').filter({ hasText: 'Delantero' }).click()
  const d0 = await outline(page, 'front').getAttribute('d')
  await page.getByRole('button', { name: 'Simetría', exact: true }).click()
  await expect(outline(page, 'front')).not.toHaveAttribute('d', d0!)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(outline(page, 'front')).toHaveAttribute('d', d0!)

  await page.getByRole('button', { name: 'Rotar', exact: true }).click()
  const b = await box(page, 'front')
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  const start = { x: c.x, y: c.y + b.height * 0.3 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.keyboard.down('Shift')
  // Quarter turn around the centre (clockwise on screen: from below to the left).
  for (let i = 1; i <= 8; i++) {
    const a = (Math.PI / 2) * (i / 8)
    const r = b.height * 0.3
    await page.mouse.move(c.x - r * Math.sin(a), c.y + r * Math.cos(a))
  }
  await page.mouse.up()
  await page.keyboard.up('Shift')
  const after = await box(page, 'front')
  // Snapped to exactly 90°: width and height swap.
  expect(Math.abs(after.width - b.height)).toBeLessThan(2)
  expect(Math.abs(after.height - b.width)).toBeLessThan(2)
})

test('Guardar persists the operations with the project', async ({ page }) => {
  await separateAll(page)
  await page.getByTestId('piece-item').filter({ hasText: 'Espalda' }).click()
  await page.getByTestId('piece-editor').getByRole('button', { name: 'Duplicar' }).click()
  await expect(page.getByTestId('piece-outline')).toHaveCount(3)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Piezas', exact: true }).click()
  await expect(page.getByTestId('piece-outline')).toHaveCount(3)
  await expect(outline(page, 'back-2')).toHaveCount(1)
})

/** Start a Mover drag on the back piece and move it, leaving the button pressed. */
const startDrag = async (page: Page) => {
  await page.getByRole('button', { name: 'Mover', exact: true }).click()
  const before = await box(page, 'back')
  const start = { x: before.x + before.width * 0.4, y: before.y + before.height * 0.6 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) await page.mouse.move(start.x + i * 8, start.y + i * 12)
  const viewport = page.getByTestId('canvas-viewport')
  await expect(viewport).toHaveClass(/is-dragging/)
  return { before, viewport, start }
}

const cancels: [string, (page: Page) => Promise<void>][] = [
  ['Escape', (page) => page.keyboard.press('Escape')],
  [
    'pointercancel',
    (page) => page.getByTestId('canvas-viewport').dispatchEvent('pointercancel', { pointerId: 1 }),
  ],
  [
    'lostpointercapture',
    (page) =>
      page.getByTestId('canvas-viewport').dispatchEvent('lostpointercapture', { pointerId: 1 }),
  ],
]

for (const [name, cancel] of cancels)
  test(`a drag cancelled by ${name} clears the preview and commits nothing`, async ({ page }) => {
    await separateAll(page)
    const { before, viewport, start } = await startDrag(page)
    const moving = await box(page, 'back')
    expect(moving.y - before.y).toBeGreaterThan(40) // the preview follows the cursor
    await cancel(page)
    await expect(viewport).not.toHaveClass(/is-dragging/)
    const after = await box(page, 'back')
    expect(Math.abs(after.y - before.y)).toBeLessThan(1)
    expect(Math.abs(after.x - before.x)).toBeLessThan(1)
    // Releasing the button afterwards commits nothing and later moves do not drag the piece.
    await page.mouse.up()
    await page.mouse.move(start.x + 100, start.y + 100)
    const later = await box(page, 'back')
    expect(Math.abs(later.y - before.y)).toBeLessThan(1)
    // The only operation is still the extraction: one undo empties the pieces view.
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(page.getByTestId('pieces-empty')).toBeVisible()
  })

test('half pieces are separated "al doblez" by default; unfolding makes them x1 whole', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('combobox', { name: 'Tipo de prenda' }).selectOption('women-skirt')
  await page.getByTestId('separate-all').click()
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  const label = page.locator('[data-testid="piece-label"][data-piece="back"]')
  await expect(label).toContainText('x1 (al doblez)')
  await page.getByTestId('piece-item').filter({ hasText: 'Espalda' }).click()
  await expect(page.getByRole('checkbox', { name: 'Al doblez' })).toBeChecked()
  await page.getByRole('checkbox', { name: 'Al doblez' }).uncheck()
  await expect(label).not.toContainText('al doblez')
  await expect(label).toContainText('x1')
})
