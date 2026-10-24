/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

test.use({ viewport: { width: 1536, height: 1024 } })

/** Screen positions of the start and end of a segment's hit path. */
const segmentEnds = (page: Page, key: string) =>
  page.evaluate((k) => {
    const el = document.querySelector(`.seg-hit[data-segment="${k}"]`) as SVGPathElement | null
    if (!el) throw new Error(`no segment ${k}`)
    const m = el.getScreenCTM()!
    const at = (s: number) => {
      const p = el.getPointAtLength(s)
      const q = new DOMPoint(p.x, p.y).matrixTransform(m)
      return { x: q.x, y: q.y }
    }
    return [at(0), at(el.getTotalLength() / 2), at(el.getTotalLength())] as const
  }, key)

const outlineD = (page: Page, piece: string) =>
  page.locator(`[data-testid="piece-outline"][data-piece="${piece}"]`).getAttribute('d')

const dir = process.env.SCREENSHOT_DIR ?? ''

test('Trazar across the 3-edge front armhole after Ajuste automático', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  await page.getByTestId('separate-all').click()
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  await page
    .locator('.layers-head[aria-expanded="true"]')
    .click({ timeout: 500 })
    .catch(() => undefined)
  await page.getByTestId('piece-item').filter({ hasText: 'Delantero' }).click()
  const sisa = page.getByTestId('piece-armhole')
  await expect(sisa).toBeVisible()
  const sisaBefore = await sisa.textContent()

  // Zoom in on the armhole (wheel over its middle) and pan it to the middle of the canvas; then
  // read its ends: A26 (shoulder) and A27 (side).
  const [, mid] = await segmentEnds(page, 'front/front.armhole.1')
  await page.mouse.move(mid.x, mid.y)
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(150)
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) throw new Error('no viewport')
  const [s0] = await segmentEnds(page, 'front/front.armhole.0')
  const [, , s1] = await segmentEnds(page, 'front/front.armhole.2')
  // Middle-button drag pans the view: the armhole's middle to below the canvas's floating bars.
  await page.mouse.move((s0.x + s1.x) / 2, (s0.y + s1.y) / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  const [a26] = await segmentEnds(page, 'front/front.armhole.0')
  const [, , a27] = await segmentEnds(page, 'front/front.armhole.2')
  for (const p of [a26, a27]) expect(p.y).toBeGreaterThan(box.y + 70)

  await page.getByRole('button', { name: 'Reglas' }).click()
  await page.getByRole('menuitemradio', { name: /Curvígrafo/ }).click()
  await expect(page.locator('[data-testid="ruler"][data-ruler="french"]')).toBeVisible()
  const original = await outlineD(page, 'front')
  await page.getByRole('button', { name: 'Trazar' }).click()
  await page.mouse.click(a26.x, a26.y)
  await page.mouse.click(a27.x, a27.y)
  await page.getByTestId('ruler-auto-align').click()
  await expect(page.getByTestId('ruler-fit-info')).toContainText(/Ajuste: \d+\.\d mm/)
  const info = page.getByTestId('ruler-trace-info')
  await expect(info).toContainText('desviación')
  await expect(page.getByTestId('ruler-trace')).toHaveCount(1)
  await info.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByTestId('ruler-trace')).toHaveCount(0)
  await expect(page.getByTestId('replay-issues')).toHaveCount(0)
  expect(await outlineD(page, 'front')).not.toBe(original)
  // One armhole edge chain replaced the three edges; the Sisa readout measures it.
  await expect(page.locator('.seg-hit[data-segment="front/front.armhole.1"]')).toHaveCount(0)
  await expect(sisa).not.toHaveText(sisaBefore ?? '')
  await expect(sisa).toHaveText(/\d+\.\d cm/)
  if (dir) {
    await page.mouse.move(1500, 1000)
    await page.screenshot({ path: path.join(dir, 'trace-armhole.png') })
  }

  // Undo / redo the trace as one step.
  const traced = await outlineD(page, 'front')
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect.poll(() => outlineD(page, 'front')).toBe(original)
  await page.getByRole('button', { name: 'Rehacer' }).click()
  await expect.poll(() => outlineD(page, 'front')).toBe(traced)
})
