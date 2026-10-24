import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, type PDFPage } from 'pdf-lib'

test.use({ viewport: { width: 1536, height: 1024 } })

const K = 72 / 25.4
/** Target of the sender: the build's VITE_A0TD_URL, else the published a0-to-domestic. */
const A0TD = process.env.VITE_A0TD_URL || 'https://adriany1997.github.io/a0-to-domestic/'
const APP_ORIGIN = 'http://localhost:4173'
const here = path.dirname(fileURLToPath(import.meta.url))
const RECEIVER = readFileSync(path.join(here, 'fixtures', 'a0td-receiver.html'), 'utf8')

/** Serve the fake receiver (e2e/fixtures) in place of a0-to-domestic. */
async function fakeReceiver(context: BrowserContext, mode: string) {
  await context.route(`${A0TD}**`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: RECEIVER.replace('__ALLOWED_ORIGIN__', APP_ORIGIN).replace('__ACK_MODE__', mode),
    }),
  )
}

async function openExport(page: Page, separate = true) {
  await page.goto('./')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  if (separate) {
    await page.getByTestId('separate-all').click()
    await expect(page.getByTestId('canvas-viewport')).toHaveAttribute('data-view', 'pieces')
  }
  await page.getByRole('button', { name: 'Exportar', exact: true }).click()
  await expect(page.getByTestId('export-dialog')).toBeVisible()
}

function contentOf(page: PDFPage): string {
  const node = page.node.Contents()
  const streams =
    node instanceof PDFArray ? node.asArray().map((r) => page.doc.context.lookup(r)) : [node]
  return streams
    .map((s) =>
      s instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1')
        : '',
    )
    .join('\n')
}

/** Width and height (pt) of the rectangle inside the /TestSquare marked content. */
function testSquare(page: PDFPage): { w: number; h: number } {
  const m = /\/TestSquare BMC[\s\S]*?(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/.exec(
    contentOf(page),
  )
  if (!m) throw new Error('no test square')
  return { w: Number(m[3]), h: Number(m[4]) }
}

test('PDF hoja única of the women bodice: page size and 10 cm test square', async ({ page }) => {
  await openExport(page)
  await page.locator('[data-format="pdf-single"]').click()
  const preview = page.getByTestId('preview-page')
  await expect(preview).toHaveCount(1)
  const wMm = Number(await preview.getAttribute('data-width-mm'))
  const hMm = Number(await preview.getAttribute('data-height-mm'))
  expect(wMm).toBeGreaterThan(300)

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('cuerpo-base-mujer-talla-10.pdf')
  const pdf = await PDFDocument.load(readFileSync((await download.path())!))
  expect(pdf.getPageCount()).toBe(1)
  const p = pdf.getPage(0)
  const box = p.getMediaBox()
  expect(Math.abs(box.width - wMm * K)).toBeLessThan(0.02)
  expect(Math.abs(box.height - hMm * K)).toBeLessThan(0.02)
  const sq = testSquare(p)
  expect(Math.abs(sq.w / K - 100)).toBeLessThan(0.01)
  expect(Math.abs(sq.h / K - 100)).toBeLessThan(0.01)
})

test('A0, sizes and SVG options', async ({ page }) => {
  await openExport(page)
  await page.locator('[data-format="pdf-a0"]').click()
  await page
    .getByTestId('export-dialog')
    .getByRole('button', { name: 'Todas', exact: true })
    .click()
  await expect(page.getByTestId('export-summary')).toContainText('1 página · 841 × 1189 mm')
  await page.getByLabel('Una página por talla').check()
  await expect(page.getByTestId('preview-page')).toHaveCount(6)

  await page.locator('[data-format="svg"]').click()
  await page.getByLabel('Una página por talla').check()
  const files: string[] = []
  page.on('download', (d) => files.push(d.suggestedFilename()))
  await page.getByRole('button', { name: 'Descargar' }).click()
  await expect.poll(() => files.length).toBe(6)
  expect(files).toContain('cuerpo-base-mujer-talla-6-8-10-12-14-16-t6.svg')
})

test('Enviar a a0-to-domestic: full handshake and ack', async ({ page, context }) => {
  await fakeReceiver(context, 'ok')
  await openExport(page)
  await page.locator('.export-sizes [data-size="14"]').click()
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Enviar a a0-to-domestic' }).click()
  const popup = await opening
  expect(popup.url()).toBe(`${A0TD}#/import?source=sewing-pattern-creator`)
  await expect(page.getByTestId('export-status')).toContainText('a0-to-domestic recibió el patrón')
  await expect(popup.locator('#state')).toHaveText('importado')

  const got = await popup.evaluate(
    () => (globalThis as unknown as { __received: Record<string, unknown> }).__received,
  )
  expect(got.origin).toBe(APP_ORIGIN)
  expect(got.sourceIsOpener).toBe(true)
  expect(got.type).toBe('a0td:import')
  expect(got.version).toBe(1)
  expect(got.mime).toBe('application/pdf')
  expect(got.header).toBe('%PDF-')
  expect(got.name).toBe('cuerpo-base-mujer-talla-10-14.pdf')
  expect(got.source).toEqual({ app: 'sewing-pattern-creator', version: expect.any(String) })
  const acks = await popup.evaluate(() => (globalThis as unknown as { __acks: unknown[] }).__acks)
  expect(acks).toEqual([
    { type: 'a0td:import-ack', requestId: got.requestId, ok: true, documentId: 'doc-e2e-1' },
  ])
  // The single-sheet PDF, one page per size, with the exact test square.
  const pdf = await PDFDocument.load(new Uint8Array(got.bytes as number[]))
  expect(pdf.getPageCount()).toBe(2)
  for (const p of pdf.getPages()) {
    const sq = testSquare(p)
    expect(Math.abs(sq.w / K - 100)).toBeLessThan(0.01)
  }
  // The sender leaves the tab open.
  expect(popup.isClosed()).toBe(false)
})

test('Enviar a a0-to-domestic: an error ack is shown in Spanish', async ({ page, context }) => {
  await fakeReceiver(context, 'TOO_LARGE')
  await openExport(page)
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Enviar a a0-to-domestic' }).click()
  await opening
  await expect(page.getByTestId('export-status')).toContainText(
    'El PDF es demasiado grande para a0-to-domestic',
  )
})

test('Enviar a a0-to-domestic: popup blocked → the PDF is downloaded', async ({ page }) => {
  await page.addInitScript(() => {
    ;(globalThis as unknown as { open: () => null }).open = () => null
  })
  await openExport(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Enviar a a0-to-domestic' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('cuerpo-base-mujer-talla-10.pdf')
  const status = page.getByTestId('export-status')
  await expect(status).toContainText('Abre a0-to-domestic y carga el archivo descargado')
  await expect(status.getByRole('link')).toHaveAttribute('href', A0TD)
})

test('Enviar a a0-to-domestic: no ready within 15 s → the PDF is downloaded', async ({
  page,
  context,
}) => {
  await fakeReceiver(context, 'silent')
  await page.clock.install()
  await openExport(page, false)
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Enviar a a0-to-domestic' }).click()
  const popup = await opening
  await expect(page.getByTestId('export-status')).toContainText('esperando respuesta')
  const downloading = page.waitForEvent('download')
  await page.clock.fastForward(16_000)
  await downloading
  await expect(page.getByTestId('export-status')).toContainText('no respondió a tiempo')
  expect(popup.isClosed()).toBe(false)
})

test('Medidas: grading irregularities are flagged', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Medidas' }).click()
  // Women's table: the jeans bottom width grades irregularly (SPEC §3.4.1).
  await expect(
    page.locator('[data-key="halfJeansBottomWidth"] [data-testid="grading-irregularity"]'),
  ).toHaveCount(1)
  await expect(page.locator('[data-key="bust"] [data-testid="grading-irregularity"]')).toHaveCount(
    0,
  )
})

/** Reference images, only when SCREENSHOT_DIR is set. */
test('F6 screenshots', async ({ page, browser }) => {
  const dir = process.env.SCREENSHOT_DIR ?? ''
  test.skip(!dir, 'set SCREENSHOT_DIR to capture screenshots')
  await openExport(page)
  await page.locator('[data-format="pdf-a0"]').click()
  await page
    .getByTestId('export-dialog')
    .getByRole('button', { name: 'Todas', exact: true })
    .click()
  await expect(page.getByTestId('preview-page')).toHaveCount(1)
  await page.screenshot({ path: path.join(dir, 'f6-dialog.png') })

  // First A0 page (all sizes nested, separated, with allowance) through the SVG export.
  await page.locator('[data-format="svg"]').click()
  await page.getByLabel('Hojas A0').check()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar' }).click()
  const svg = readFileSync((await (await downloading).path())!, 'utf8')
  const m = /width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg)!
  const w = 1700
  const h = Math.round((w * Number(m[2])) / Number(m[1]))
  const view = await browser.newPage({ viewport: { width: w, height: h } })
  await view.setContent(
    `<body style="margin:0;background:#fff">${svg
      .replace(/^<\?xml[^>]*>/, '')
      .replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${w}" height="${h}"`)}</body>`,
  )
  await view.screenshot({ path: path.join(dir, 'f6-a0.png') })
  await view.close()
})
