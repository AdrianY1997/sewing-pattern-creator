import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1536, height: 1024 } })

const centre = async (page: Page, selector: string) => {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Screen px per mm of the canvas world group: the scale of its matrix(s 0 0 s x y). */
const worldScale = async (page: Page) => {
  const t = (await page.getByTestId('world').getAttribute('transform')) ?? ''
  return Number(/^matrix\(([^ ]+) /.exec(t)?.[1] ?? NaN)
}

test('hovering a named point shows its name and coordinates', async ({ page }) => {
  await page.goto('./')
  // The Notas layer draws the points: we only need it to find a point's screen position.
  await page.getByRole('checkbox', { name: 'Notas' }).check()
  const p = await centre(page, '[data-point="A34"]')
  await page.mouse.move(p.x + 3, p.y + 2)
  const tip = page.getByTestId('point-tooltip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('A34')
  await expect(tip).toContainText(/X -?\d+\.\d · Y -?\d+\.\d cm/)
  await expect(page.getByTestId('hover-ring')).toHaveCount(1)
  // Snapped to the point: the readout shows its coordinates.
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'point')
  await expect(page.getByTestId('cursor-readout')).toHaveAttribute('data-snapped', 'true')

  await page.mouse.move(p.x + 60, p.y + 60)
  await expect(tip).toHaveCount(0)
})

test('snap can be toggled from the bottom-right bar', async ({ page }) => {
  await page.goto('./')
  const shoulder = await centre(page, '[data-segment="front.shoulder"]')
  await page.mouse.move(shoulder.x, shoulder.y)
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'midpoint')
  await page.getByRole('button', { name: 'Ajuste a puntos (snap)' }).click()
  await page.mouse.move(shoulder.x, shoulder.y)
  await expect(page.getByTestId('snap-marker')).toHaveCount(0)
})

test('clicking a segment shows its length; clicking a piece its measurements', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('inspector')).toHaveCount(0)
  await page.locator('[data-segment="front.shoulder"]').click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toBeVisible()
  await expect(inspector.getByTestId('segment-info')).toContainText('front.shoulder')
  await expect(page.getByTestId('segment-length')).toHaveText(/^\d+\.\d cm$/)
  await expect(page.getByTestId('segment-selection')).toHaveAttribute(
    'data-segment',
    'front.shoulder',
  )
  // The owning piece is selected too, with its perimeter, area and armhole.
  await expect(page.getByTestId('piece-perimeter')).toHaveText(/^\d+\.\d cm$/)
  await expect(page.getByTestId('piece-armhole')).toHaveText(/^\d+\.\d cm$/)

  // Click inside the back piece (not on an edge): piece measurements only.
  const back = await page.locator('[data-testid="piece-outline"][data-piece="back"]').boundingBox()
  if (!back) throw new Error('no back piece')
  await page.mouse.click(back.x + back.width * 0.3, back.y + back.height * 0.75)
  await expect(page.getByTestId('segment-info')).toHaveCount(0)
  await expect(page.getByTestId('piece-info')).toContainText('Espalda')
  await expect(page.getByTestId('piece-area')).toHaveText(/^\d+\.\d cm²$/)
  await expect(page.getByTestId('piece-armhole')).toBeVisible()
})

test('calibration sets px/mm so that 1:1 draws 100 mm as px/mm × 100', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Ajustes' }).click()
  await expect(page.getByTestId('calibration-info')).toContainText('3.780 px/mm')
  await page.getByRole('button', { name: 'Calibrar pantalla' }).click()
  const dialog = page.getByRole('dialog', { name: 'Calibrar pantalla' })
  await expect(dialog).toBeVisible()

  // Card mode: dragging the handle resizes the card rectangle.
  const card = page.getByTestId('calib-card')
  const before = (await card.boundingBox())!.width
  const handle = await centre(page, '.calib-handle')
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  await page.mouse.move(handle.x + 60, handle.y + 10, { steps: 4 })
  await page.mouse.up()
  expect((await card.boundingBox())!.width).toBeCloseTo(before + 60, 0)

  // Ruler mode: the 10 cm line measured 80 mm, so px/mm = (96 / 25.4) × 100 / 80.
  await dialog.getByRole('tab', { name: 'Regla' }).click()
  await dialog.getByLabel('Medida con la regla (mm)').fill('80')
  const expected = ((96 / 25.4) * 100) / 80
  await expect(page.getByTestId('calib-result')).toContainText(`${expected.toFixed(3)} px/mm`)
  await dialog.getByRole('button', { name: 'Guardar calibración' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('calibration-info')).toContainText(`${expected.toFixed(3)} px/mm`)

  await page.getByRole('button', { name: 'Tamaño real' }).click()
  await expect(page.getByTestId('zoom-percent')).toHaveText('1:1')
  expect((await worldScale(page)) * 100).toBeCloseTo(expected * 100, 3)

  // Zooming away leaves 1:1; the calibration survives a reload.
  await page.getByRole('button', { name: 'Acercar' }).click()
  await expect(page.getByTestId('zoom-percent')).toHaveText('125%')
  await page.reload()
  await page.getByRole('button', { name: 'Tamaño real' }).click()
  await expect(page.getByTestId('zoom-percent')).toHaveText('1:1')
  expect((await worldScale(page)) * 100).toBeCloseTo(expected * 100, 3)
})

test('real size centres on the selected piece', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('piece-item').filter({ hasText: 'Delantero' }).click()
  await page.getByRole('button', { name: 'Tamaño real' }).click()
  await expect(page.getByTestId('zoom-percent')).toHaveText('1:1')
  const vp = (await page.getByTestId('canvas-viewport').boundingBox())!
  const piece = (await page
    .locator('[data-testid="piece-outline"][data-piece="front"]')
    .boundingBox())!
  expect(Math.abs(piece.x + piece.width / 2 - (vp.x + vp.width / 2))).toBeLessThan(3)
  expect(Math.abs(piece.y + piece.height / 2 - (vp.y + vp.height / 2))).toBeLessThan(3)
})

test.describe('narrow screens (1000 px)', () => {
  test.use({ viewport: { width: 1000, height: 800 } })

  test('side panels are drawers toggled from the top bar', async ({ page }) => {
    await page.goto('./')
    const designTab = page.getByRole('tab', { name: 'Diseño' })
    const details = page.getByRole('complementary', { name: 'Detalles del patrón' })
    await expect(designTab).toBeHidden()
    await expect(details).toBeHidden()
    const vp = (await page.getByTestId('canvas-viewport').boundingBox())!
    expect(vp.width).toBeGreaterThan(880)

    const leftToggle = page.getByRole('button', { name: 'Panel de configuración' })
    await leftToggle.click()
    await expect(leftToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(designTab).toBeVisible()
    await page.getByTestId('size-select').selectOption('14')
    await leftToggle.click()
    await expect(designTab).toBeHidden()

    const rightToggle = page.getByRole('button', { name: 'Panel de detalles' })
    await rightToggle.click()
    await expect(details).toBeVisible()
    await expect(details.locator('[data-size="14"]')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()

    // Configuración in the rail opens the drawer on the Ajustes tab; the backdrop closes it.
    await page.getByRole('button', { name: 'Configuración', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Ajustes' })).toBeVisible()
    await page.getByTestId('drawer-backdrop').click({ position: { x: 800, y: 300 } })
    await expect(page.getByRole('tab', { name: 'Ajustes' })).toBeHidden()
  })
})
