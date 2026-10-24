import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1536, height: 1024 } })

const separateAll = async (page: Page, block?: string) => {
  await page.goto('./')
  if (block) await page.getByRole('combobox', { name: 'Tipo de prenda' }).selectOption(block)
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  await page.getByTestId('separate-all').click()
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  // The floating Capas panel sits over the back piece: collapse it.
  await page.locator('.layers-head').click()
}

/** Screen centre of a segment's hit path (a straight segment: its midpoint). */
const segmentCentre = async (page: Page, key: string) => {
  const box = await page.locator(`.seg-hit[data-segment="${key}"]`).boundingBox()
  if (!box) throw new Error(`no segment ${key}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const dart = (page: Page, id: string) =>
  page.locator(`[data-testid="dart-item"][data-dart="${id}"]`)

test('women bodice: transfer the bust dart to the shoulder, undo/redo, change size', async ({
  page,
}) => {
  await separateAll(page)
  await page.getByTestId('piece-item').filter({ hasText: 'Delantero' }).click()
  await expect(page.getByTestId('darts-section')).toBeVisible()
  await expect(dart(page, 'front.bustDart')).toBeVisible()

  const shoulder = await segmentCentre(page, 'front/front.shoulder')
  await dart(page, 'front.bustDart').getByRole('button', { name: 'Trasladar' }).click()
  await expect(page.getByTestId('canvas-hint')).toContainText('borde de destino')
  await page.mouse.move(shoulder.x, shoulder.y)
  await expect(page.getByTestId('point-preview')).toHaveCount(1)
  await page.mouse.click(shoulder.x, shoulder.y)

  const moved = dart(page, 'front.bustDart~t')
  await expect(moved).toBeVisible()
  await expect(dart(page, 'front.bustDart')).toHaveCount(0)
  await expect(page.locator('[data-segment="front/front.bustDart~t.open"]')).toHaveCount(1)
  await expect(page.getByTestId('canvas-hint')).toHaveCount(0)

  const undo = page.getByRole('button', { name: 'Deshacer' })
  const redo = page.getByRole('button', { name: 'Rehacer' })
  await undo.click()
  await expect(dart(page, 'front.bustDart')).toBeVisible()
  await expect(moved).toHaveCount(0)
  await redo.click()
  await expect(moved).toBeVisible()

  // Another size: the transfer replays.
  await page.locator('.size-chips [data-size="14"]').click()
  await expect(page.locator('.size-chips [data-size="14"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(moved).toBeVisible()
  await expect(page.locator('[data-segment="front/front.bustDart~t.open"]')).toHaveCount(1)
  await expect(page.getByTestId('replay-issues')).toHaveCount(0)
})

test('add a point on the outline and drag it', async ({ page }) => {
  await separateAll(page)
  await page.getByRole('button', { name: 'Añadir punto' }).click()
  // The hem is the bottom edge of the back piece.
  const outline = await page
    .locator('[data-testid="piece-outline"][data-piece="back"]')
    .boundingBox()
  if (!outline) throw new Error('no back outline')
  const at = { x: outline.x + outline.width * 0.4, y: outline.y + outline.height - 2 }
  await page.mouse.move(at.x, at.y)
  await expect(page.getByTestId('point-preview')).toHaveCount(1)
  await page.mouse.click(at.x, at.y)

  // Seleccionar the piece: the new vertex can be dragged.
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click()
  await page.getByTestId('piece-item').filter({ hasText: 'Espalda' }).click()
  const first = page.locator('.seg-hit[data-segment="back/back.hem~1"]')
  await expect(first).toHaveCount(1)
  const box = await first.boundingBox()
  if (!box) throw new Error('no hem~1')
  // The hem runs from the centre back (left) to the side: the new point is the right end.
  const p = { x: box.x + box.width, y: box.y + box.height / 2 }
  await page.mouse.move(p.x, p.y)
  await expect(page.getByTestId('vertex-preview')).toHaveCount(1)
  await page.mouse.down()
  await page.mouse.move(p.x + 5, p.y + 20, { steps: 5 })
  await page.mouse.move(p.x + 10, p.y + 40, { steps: 5 })
  await page.mouse.up()
  const after = await first.boundingBox()
  if (!after) throw new Error('no hem~1 after the drag')
  expect(after.height).toBeGreaterThan(box.height + 20)
  await expect(page.getByTestId('replay-issues')).toHaveCount(0)

  // One undo step for the whole drag.
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect
    .poll(async () => (await first.boundingBox())?.height ?? 0)
    .toBeLessThan(box.height + 2)

  // A vertex drag cancelled with Escape commits nothing (the preview goes).
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.move(p.x + 10, p.y + 40, { steps: 5 })
  await expect
    .poll(async () => (await first.boundingBox())?.height ?? 0)
    .toBeGreaterThan(box.height + 20)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect
    .poll(async () => (await first.boundingBox())?.height ?? 0)
    .toBeLessThan(box.height + 2)
  await expect(page.getByRole('button', { name: 'Rehacer' })).toBeEnabled()
})

test('men bodice: split the back along the yoke line', async ({ page }) => {
  await separateAll(page, 'men-bodice')
  const yoke = page.locator('.seg-hit[data-segment="back/back.yoke"]')
  await expect(yoke).toHaveCount(1)
  const at = await segmentCentre(page, 'back/back.yoke')
  await page.mouse.click(at.x, at.y)
  await expect(page.getByTestId('segment-section')).toBeVisible()
  await page.getByTestId('split-piece').click()
  await expect(page.locator('[data-testid="piece-outline"][data-piece="back~a"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="piece-outline"][data-piece="back~b"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="piece-outline"][data-piece="back"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="seam-line"][data-piece="back~b"]')).toHaveCount(1)
  await expect(page.getByTestId('replay-issues')).toHaveCount(0)
  // The fold indicator stays on the centre back of both halves.
  await expect(page.locator('[data-piece-fold="back~a"]')).toHaveCount(1)
  await expect(page.locator('[data-piece-fold="back~b"]')).toHaveCount(1)
})
