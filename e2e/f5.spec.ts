/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { WOMEN_BODICE_BLOCK, WOMEN_SKIRT_BLOCK, draftBlock, type AnyBlockDef } from '../src/blocks'
import {
  distance,
  fitRulerToCurve,
  getRuler,
  reverseSegment,
  segmentLength,
  segmentPointAtLength,
  stripMeta,
  type RulerId,
  type Segment,
  type Vec,
} from '../src/core'

test.use({ viewport: { width: 1536, height: 1024 } })

const separateAll = async (page: Page) => {
  await page.goto('./')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  await page.getByTestId('separate-all').click()
  await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  await page
    .locator('.layers-head[aria-expanded="true"]')
    .click({ timeout: 500 })
    .catch(() => undefined)
}

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
    return [at(0), at(el.getTotalLength())] as const
  }, key)

const outlineD = (page: Page, piece: string) =>
  page.locator(`[data-testid="piece-outline"][data-piece="${piece}"]`).getAttribute('d')

test('French curve: place, rotate, trace an armhole, undo and redo; Medir', async ({ page }) => {
  await separateAll(page)
  // Segment hit paths exist only with the selection tools: read the ends first.
  const [a, b] = await segmentEnds(page, 'front/front.armhole.1')
  const [s0, s1] = await segmentEnds(page, 'front/front.shoulder')
  await page.getByRole('button', { name: 'Reglas' }).click()
  await page.getByRole('menuitemradio', { name: /Curvígrafo/ }).click()
  const ruler = page.locator('[data-testid="ruler"][data-ruler="french"]')
  await expect(ruler).toBeVisible()
  await expect(page.getByTestId('ruler-panel')).toBeVisible()

  // Rotate with the handle.
  const angle = page.getByTestId('ruler-angle')
  const before = await angle.textContent()
  const handle = await page.getByTestId('ruler-rotate').boundingBox()
  if (!handle) throw new Error('no rotate handle')
  const hx = handle.x + handle.width / 2
  const hy = handle.y + handle.height / 2
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx + 40, hy + 60, { steps: 5 })
  await page.mouse.up()
  await expect(angle).not.toHaveText(before ?? '')

  // Align the ruler on the armhole start, then trace between the ends of the armhole.
  await page.getByRole('button', { name: 'Alinear' }).click()
  await page.mouse.click(a.x, a.y)
  await expect(page.getByRole('button', { name: 'Alinear' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  const original = await outlineD(page, 'front')
  await page.getByRole('button', { name: 'Trazar' }).click()
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(b.x, b.y)
  const info = page.getByTestId('ruler-trace-info')
  await expect(info).toContainText('desviación')
  await expect(page.getByTestId('ruler-trace')).toHaveCount(1)
  await info.getByRole('button', { name: /Aplicar/ }).click()
  await expect(page.getByTestId('ruler-trace')).toHaveCount(0)
  const traced = await outlineD(page, 'front')
  expect(traced).not.toBe(original)
  await expect(page.getByTestId('replay-issues')).toHaveCount(0)

  const undo = page.getByRole('button', { name: 'Deshacer' })
  const redo = page.getByRole('button', { name: 'Rehacer' })
  await undo.click()
  await expect.poll(() => outlineD(page, 'front')).toBe(original)
  await redo.click()
  await expect.poll(() => outlineD(page, 'front')).toBe(traced)

  // Medir: a segment, then two points.
  await page.getByRole('button', { name: 'Medir' }).click()
  await expect(ruler).toHaveCount(0)
  await page.mouse.click((s0.x + s1.x) / 2, (s0.y + s1.y) / 2)
  const chip = page.getByTestId('measure-chip')
  await expect(chip).toContainText(/Largo: \d+\.\d cm/)
  await page.mouse.click(s0.x, s0.y)
  await page.mouse.click(s1.x, s1.y)
  await expect(chip).toContainText(/Distancia: \d+\.\d cm/)
  // Both ends lie on the outline of the piece: the length along it too.
  await expect(chip).toContainText('por el contorno')
})

// ---------- reference screenshots (SCREENSHOT_DIR=… npm run test:e2e) ----------

const dir = process.env.SCREENSHOT_DIR ?? ''

/**
 * The curved draft segments with `role` of piece `pieceId`, in outline order, as one polyline;
 * `upTo` keeps that share of it from its start.
 */
const roleCurve = (block: AnyBlockDef, pieceId: string, role: string, upTo = 1): Vec[] => {
  const draft = draftBlock(block, block.defaultSize, {})
  const piece = draft.pieces.find((p) => p.id === pieceId)!
  const segs: Segment[] = piece.outline
    .filter((r) => draft.segments[r.segment].role === role)
    .map((r) => {
      const s = stripMeta(draft.segments[r.segment])
      return r.reversed ? reverseSegment(s) : s
    })
    .filter((s) => s.kind === 'cubic')
  const out: Vec[] = []
  for (const s of segs)
    for (let i = 0; i <= 40; i++)
      out.push(segmentPointAtLength(s, (segmentLength(s) * i) / 40).point)
  const pts = out.filter((p, i) => i === 0 || distance(p, out[i - 1]) > 1e-6)
  return pts.slice(0, Math.round(upTo * (pts.length - 1)) + 1)
}

const placeRuler = async (page: Page, id: RulerId, curve: Vec[]) => {
  const fit = fitRulerToCurve(getRuler(id), 'curve', curve)
  await page.addInitScript(
    (v) => {
      window.localStorage.setItem('spc:rulers', JSON.stringify(v))
    },
    { rulerId: id, poses: { [id]: fit.pose } },
  )
  return fit
}

/** Zoom in on the middle of a world curve and pan it to the middle of the canvas. */
const zoomOn = async (page: Page, curve: Vec[]) => {
  const mid = curve[Math.floor(curve.length / 2)]
  const screenOf = () =>
    page.evaluate(({ x, y }) => {
      const g = document.querySelector('[data-testid="world"]') as SVGGElement
      const q = new DOMPoint(x, y).matrixTransform(g.getScreenCTM()!)
      return { x: q.x, y: q.y }
    }, mid)
  const at = await screenOf()
  await page.mouse.move(at.x, at.y)
  await page.mouse.wheel(0, -700)
  await page.waitForTimeout(100)
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) throw new Error('no viewport')
  const now = await screenOf()
  // Middle-button drag pans the view.
  await page.mouse.move(now.x, now.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
}

test.describe('F5 screenshots', () => {
  test.skip(!dir, 'set SCREENSHOT_DIR to capture screenshots')

  test('French curve on the women bodice front armhole', async ({ page }) => {
    // The lower 60 % of the armhole (from the underarm), where the curve is.
    const curve = roleCurve(WOMEN_BODICE_BLOCK, 'front', 'armhole', 0.6)
    const fit = await placeRuler(page, 'french', curve)
    expect(fit.deviation).toBeLessThan(1.5)
    await page.goto('./')
    await expect(page.getByTestId('piece-outline')).toHaveCount(2)
    await page
      .locator('.layers-head[aria-expanded="true"]')
      .click({ timeout: 500 })
      .catch(() => undefined)
    await zoomOn(page, curve)
    await page.getByRole('button', { name: 'Reglas' }).click()
    await page.getByRole('menuitemradio', { name: /Curvígrafo/ }).click()
    await expect(page.locator('[data-ruler="french"]')).toBeVisible()
    await page.mouse.move(1500, 1000)
    await page.screenshot({ path: path.join(dir, 'f5-frenchcurve.png') })
  })

  test('hip curve on the skirt side', async ({ page }) => {
    const curve = roleCurve(WOMEN_SKIRT_BLOCK, 'front', 'side')
    const fit = await placeRuler(page, 'hip', curve)
    expect(fit.deviation).toBeLessThan(1.5)
    await page.goto('./')
    await page.getByLabel('Tipo de prenda').selectOption('women-skirt')
    await expect(page.getByTestId('piece-outline')).toHaveCount(2)
    await page
      .locator('.layers-head[aria-expanded="true"]')
      .click({ timeout: 500 })
      .catch(() => undefined)
    await zoomOn(page, curve)
    await page.getByRole('button', { name: 'Reglas' }).click()
    await page.getByRole('menuitemradio', { name: /cadera/ }).click()
    await expect(page.locator('[data-ruler="hip"]')).toBeVisible()
    await page.mouse.move(1500, 1000)
    await page.screenshot({ path: path.join(dir, 'f5-hipcurve.png') })
  })
})
