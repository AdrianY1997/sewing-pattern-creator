import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1536, height: 1024 } })

const outline = (page: Page, piece: string) =>
  page.locator(`[data-testid="piece-outline"][data-piece="${piece}"]`)

test('loads the editor shell with the default block', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByLabel('Título del patrón')).toHaveValue('Cuerpo base mujer')
  await expect(page.getByTestId('block-select')).toHaveValue('women-bodice')
  await expect(page.getByRole('tab', { name: 'Diseño' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  await expect(page.getByTestId('piece-item')).toHaveText([/Espalda\s*x1/, /Delantero\s*x1/])
  const sizeChips = page.getByRole('group', { name: 'Tallas disponibles' }).getByRole('button')
  await expect(sizeChips).toHaveText(['6 (XS)', '8 (S)', '10 (M)', '12 (L)', '14 (XL)', '16 (XXL)'])
  await expect(page.getByRole('button', { name: 'Vista 3D' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeDisabled()
  await expect(page.getByTestId('zoom-percent')).toHaveText(/^\d+%$/)
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(600)
  expect(box?.height ?? 0).toBeGreaterThan(500)
})

test('switching size changes the drawing', async ({ page }) => {
  await page.goto('./')
  const front = outline(page, 'front')
  const at10 = await front.getAttribute('d')
  expect(at10).toMatch(/^M /)

  await page.getByTestId('size-select').selectOption('16')
  await expect(front).not.toHaveAttribute('d', at10 ?? '')
  const at16 = await front.getAttribute('d')

  await page.locator('[data-size="6"]').click()
  await expect(page.getByTestId('size-select')).toHaveValue('6')
  await expect(front).not.toHaveAttribute('d', at16 ?? '')
})

test('toggling layers hides and shows them', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('layer-outline')).toHaveCount(1)
  await page.getByRole('checkbox', { name: 'Contorno' }).uncheck()
  await expect(page.getByTestId('layer-outline')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Contorno' }).check()
  await expect(page.getByTestId('layer-outline')).toHaveCount(1)

  await expect(page.getByTestId('layer-darts')).toHaveCount(1)
  await page.getByRole('checkbox', { name: 'Pinzas' }).uncheck()
  await expect(page.getByTestId('layer-darts')).toHaveCount(0)

  await expect(page.getByTestId('layer-sizes')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Tallas' }).check()
  await expect(page.getByTestId('layer-sizes').locator('path')).toHaveCount(12)

  await page.getByRole('checkbox', { name: 'Notas' }).check()
  await expect(page.getByTestId('layer-notes').getByText('A34', { exact: true })).toHaveCount(1)
})

test('zoom buttons and the wheel change the % readout', async ({ page }) => {
  await page.goto('./')
  const pct = page.getByTestId('zoom-percent')
  const read = async () => Number((await pct.textContent())?.replace('%', ''))
  await page.getByRole('button', { name: 'Ajustar a pantalla' }).click()
  await expect(pct).toHaveText(/^\d+%$/)
  const start = await read()

  await page.getByRole('button', { name: 'Acercar' }).click()
  await expect.poll(read).toBeGreaterThan(start)
  await page.getByRole('button', { name: 'Alejar' }).click()
  await page.getByRole('button', { name: 'Alejar' }).click()
  await expect.poll(read).toBeLessThan(start)
  await page.getByRole('button', { name: 'Ajustar a pantalla' }).click()
  await expect.poll(read).toBe(start)

  const vp = await page.getByTestId('canvas-viewport').boundingBox()
  if (!vp) throw new Error('no viewport')
  await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2)
  await page.mouse.wheel(0, -300)
  await expect.poll(read).toBeGreaterThan(start)
  await expect(page.getByTestId('cursor-readout')).toContainText(/X: -?\d+\.\d/)
})

test('selecting a piece in the list highlights it on the canvas', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('selection')).toHaveCount(0)
  const item = page.getByTestId('piece-item').filter({ hasText: 'Delantero' })
  await item.click()
  await expect(outline(page, 'front')).toHaveClass(/is-selected/)
  await expect(page.getByTestId('selection')).toHaveCount(1)
  await item.click()
  await expect(page.getByTestId('selection')).toHaveCount(0)
})

test('the Medidas tab shows the table for the current size', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('size-select').selectOption('14')
  await page.getByRole('tab', { name: 'Medidas' }).click()
  const table = page.getByTestId('measurements-table')
  await expect(table.locator('tr[data-key="bust"] td')).toHaveText('100 cm')
  await expect(table.locator('tr[data-key="shoulderLength"] td')).toHaveText('12.5 cm')
})
