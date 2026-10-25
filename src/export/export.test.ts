import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, type PDFPage } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { blockSizes, draftBlock, getBlock, isHalfPiece, pieceCut } from '../blocks'
import {
  DEFAULT_ALLOWANCE,
  pathLength,
  pieceWorldPath,
  replay,
  segEnd,
  segmentLength,
  stripMeta,
  type Operation,
  type ReplayOptions,
} from '../core'
import {
  A0_MM,
  boxesSeparated,
  buildExportDocument,
  compilePage,
  DEFAULT_EXPORT_OPTIONS,
  exportBaseName,
  exportPieces,
  exportPdf,
  exportSvgs,
  groupBox,
  MIN_PIECE_GAP,
  PT_PER_MM,
  TEST_SQUARE_MM,
  type ExportOptions,
  type ExportSource,
  type Group,
  type PdfOp,
} from '.'

const K = 72 / 25.4

const replayOptions = (blockId: string): ReplayOptions => {
  const block = getBlock(blockId)
  return {
    pieceDefaults: (id) => ({
      cutCount: pieceCut(block, id).count,
      fabric: pieceCut(block, id).material,
      halfPiece: isHalfPiece(block, id),
    }),
    allowance: DEFAULT_ALLOWANCE,
  }
}

const EXTRACT: Operation[] = [{ id: 'op1', type: 'extractAll' }]

function source(
  sizes: readonly string[],
  ops: readonly Operation[] = EXTRACT,
  blockId = 'women-bodice',
): ExportSource {
  const block = getBlock(blockId)
  const ro = replayOptions(blockId)
  return {
    title: 'Cuerpo base mujer',
    sizes: sizes.map((id) => {
      const draft = draftBlock(block, id)
      const r = replay(draft, ops, ro)
      return { id, label: id, draft, pattern: r.pattern, issueCount: r.issues.length }
    }),
    replayOptions: ro,
    referenceSize: sizes[0],
    date: '24/10/2026',
    appUrl: 'https://example.test/',
  }
}

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  ...DEFAULT_EXPORT_OPTIONS,
  ...o,
})

const findGroup = (gs: readonly Group[], id: string): Group | undefined => {
  for (const g of gs) {
    if (g.id === id) return g
    const c = findGroup(g.children ?? [], id)
    if (c) return c
  }
  return undefined
}

/** Decoded content stream(s) of a pdf-lib page. */
function contentOf(page: PDFPage): string {
  const node = page.node.Contents()
  const streams =
    node instanceof PDFArray ? node.asArray().map((r) => page.doc.context.lookup(r)) : [node]
  return streams
    .map((s) =>
      s instanceof PDFRawStream
        ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode())
        : '',
    )
    .join('\n')
}

describe('PDF export', () => {
  it('uses exactly 72/25.4 pt per mm', () => {
    expect(PT_PER_MM).toBe(72 / 25.4)
  })

  it('MediaBox in pt equals the page size in mm × 72/25.4 (single sheet and A0)', async () => {
    for (const mode of ['single', 'a0'] as const) {
      const { bytes, doc } = await exportPdf(source(['10']), opts({ mode }))
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(doc.pages.length)
      doc.pages.forEach((p, i) => {
        const box = pdf.getPage(i).getMediaBox()
        expect(box.x).toBe(0)
        expect(box.y).toBe(0)
        expect(Math.abs(box.width - p.widthMm * K)).toBeLessThan(0.01)
        expect(Math.abs(box.height - p.heightMm * K)).toBeLessThan(0.01)
      })
      if (mode === 'a0') {
        const p = doc.pages[0]
        expect([p.widthMm, p.heightMm].sort()).toEqual([A0_MM.w, A0_MM.h].sort())
      }
    }
  })

  it('single sheet = layout bounding box + 10 mm margin', () => {
    const doc = buildExportDocument(source(['10']), opts())
    const p = doc.pages[0]
    const all = p.groups.map(groupBox)
    const minX = Math.min(...all.map((b) => b.minX))
    const minY = Math.min(...all.map((b) => b.minY))
    expect(minX).toBeGreaterThanOrEqual(10 - 1e-6)
    expect(minY).toBeGreaterThanOrEqual(10 - 1e-6)
    expect(p.contentBox.minX).toBeCloseTo(10, 6)
    expect(p.contentBox.minY).toBeCloseTo(10, 6)
  })

  it('the test square measures exactly 100 mm (draw ops and content stream)', async () => {
    const { bytes, doc } = await exportPdf(source(['10']), opts())
    const ops = compilePage(doc.pages[0]).ops
    const sq = ops.filter(
      (o): o is Extract<PdfOp, { op: 'rect' }> => o.op === 'rect' && o.tag === 'TestSquare',
    )
    expect(sq).toHaveLength(1)
    expect(sq[0].w / K).toBeCloseTo(TEST_SQUARE_MM, 9)
    expect(sq[0].h / K).toBeCloseTo(TEST_SQUARE_MM, 9)

    const pdf = await PDFDocument.load(bytes)
    const text = contentOf(pdf.getPage(0))
    const m = /\/TestSquare BMC[\s\S]*?(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/.exec(text)
    expect(m).not.toBeNull()
    expect(Math.abs(Number(m![3]) - 100 * K)).toBeLessThan(0.01)
    expect(Math.abs(Number(m![4]) - 100 * K)).toBeLessThan(0.01)
    // Béziers are written as curves, not flattened.
    expect(text).toMatch(/ c\n/)
  })

  it('every page has the test square, the title block and a page number', () => {
    const doc = buildExportDocument(
      source(['6', '10', '16']),
      opts({ mode: 'single', pagePerSize: true }),
    )
    doc.pages.forEach((p, i) => {
      expect(findGroup(p.groups, 'test-square')).toBeDefined()
      expect(findGroup(p.groups, 'title-block')).toBeDefined()
      const num = findGroup(p.groups, 'page-number')!
      expect(num.prims.some((x) => x.kind === 'text' && x.text === `Página ${i + 1} de 3`)).toBe(
        true,
      )
      const label = findGroup(p.groups, 'test-square')!.prims.find((x) => x.kind === 'text')
      expect(label && label.kind === 'text' && label.text).toBe('10 cm — comprobar escala al 100 %')
    })
  })

  it('one page per size when asked; sizes nested on one page with a legend otherwise', async () => {
    const sizes = ['6', '10', '14']
    const { bytes, doc } = await exportPdf(source(sizes), opts({ pagePerSize: true }))
    expect(doc.pages).toHaveLength(3)
    expect(doc.pages.map((p) => p.sizes)).toEqual([['6'], ['10'], ['14']])
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3)

    const nested = buildExportDocument(source(sizes), opts({ pagePerSize: false }))
    expect(nested.pages).toHaveLength(1)
    expect(findGroup(nested.pages[0].groups, 'legend')).toBeDefined()
    const cut = findGroup(nested.pages[0].groups, 'piece-front-cut')!
    expect(cut.children!.map((c) => c.id)).toEqual(sizes.map((s) => `piece-front-cut-t${s}`))
    // Each size has its own colour.
    const colors = cut.children!.map((c) => {
      const p = c.prims[0]
      return p.kind === 'path' ? p.stroke?.color : null
    })
    expect(new Set(colors).size).toBe(3)
  })

  it('a known segment keeps its pattern length in the PDF (±0.05 mm)', () => {
    const src = source(['10'])
    const back = src.sizes[0].pattern.pieces.find((p) => p.id === 'back')!
    const doc = buildExportDocument(src, opts())
    const page = doc.pages[0]
    const seamGroup = findGroup(page.groups, 'piece-back-seam')!
    const ops = compilePage({ ...page, groups: [seamGroup] }).ops
    expect(ops).toHaveLength(1)
    const path = ops[0] as Extract<PdfOp, { op: 'path' }>
    // Perimeter of the seam line, back in mm.
    let len = 0
    let cur: [number, number] = [0, 0]
    let start = cur
    for (const [k, ...n] of path.cmds) {
      if (k === 'm') cur = start = [n[0], n[1]]
      else if (k === 'l') {
        len += Math.hypot(n[0] - cur[0], n[1] - cur[1])
        cur = [n[0], n[1]]
      } else if (k === 'c') {
        // Fine sampling of the cubic (pt).
        const P = [cur, [n[0], n[1]], [n[2], n[3]], [n[4], n[5]]]
        let prev = cur
        for (let i = 1; i <= 2000; i++) {
          const t = i / 2000
          const u = 1 - t
          const q: [number, number] = [0, 1].map(
            (j) =>
              u * u * u * P[0][j] +
              3 * u * u * t * P[1][j] +
              3 * u * t * t * P[2][j] +
              t * t * t * P[3][j],
          ) as [number, number]
          len += Math.hypot(q[0] - prev[0], q[1] - prev[1])
          prev = q
        }
        cur = [n[4], n[5]]
      } else {
        len += Math.hypot(start[0] - cur[0], start[1] - cur[1])
        cur = start
      }
    }
    expect(Math.abs(len / K - pathLength(pieceWorldPath(back)))).toBeLessThan(0.05)

    // The shoulder (a straight edge): one `l` of exactly its length.
    const sh = stripMeta(back.segments['back.shoulder'])
    const L = segmentLength(sh)
    expect(L).toBeGreaterThan(50)
    let found = false
    let p0: [number, number] = [0, 0]
    for (const [k, ...n] of path.cmds) {
      if (k === 'l' && Math.abs(Math.hypot(n[0] - p0[0], n[1] - p0[1]) / K - L) < 0.05) found = true
      if (k !== 'h') p0 = [n[n.length - 2], n[n.length - 1]]
    }
    expect(found).toBe(true)
    expect(segEnd(sh)).toBeDefined()
  })

  it('splits across A0 sheets without cutting any piece', () => {
    // Many copies in one long row: the arrangement does not fit one sheet.
    const ops: Operation[] = [
      ...EXTRACT,
      ...Array.from({ length: 6 }, (_, i): Operation[] => [
        { id: `df${i}`, type: 'duplicatePiece', pieceId: 'front', newId: `front-c${i}` },
        { id: `db${i}`, type: 'duplicatePiece', pieceId: 'back', newId: `back-c${i}` },
      ]).flat(),
    ]
    const src = source(['16'], ops)
    expect(src.sizes[0].issueCount).toBe(0)
    const doc = buildExportDocument(src, opts({ mode: 'a0' }))
    expect(doc.pages.length).toBeGreaterThan(1)
    const ids = doc.pages.flatMap((p) => p.itemIds)
    expect(ids.sort()).toEqual(src.sizes[0].pattern.pieces.map((p) => p.id).sort())
    for (const page of doc.pages) {
      expect([page.widthMm, page.heightMm].sort()).toEqual([A0_MM.w, A0_MM.h].sort())
      for (const pl of page.placements) {
        expect(pl.box.minX).toBeGreaterThanOrEqual(page.contentBox.minX - 1e-6)
        expect(pl.box.minY).toBeGreaterThanOrEqual(page.contentBox.minY - 1e-6)
        expect(pl.box.maxX).toBeLessThanOrEqual(page.contentBox.maxX + 1e-6)
        expect(pl.box.maxY).toBeLessThanOrEqual(page.contentBox.maxY + 1e-6)
      }
      // Whole pieces inside the sheet, cut lines ≥ 20 mm apart.
      for (const id of page.itemIds) {
        const b = groupBox(findGroup(page.groups, `piece-${id}`)!)
        expect(b.minX).toBeGreaterThanOrEqual(0)
        expect(b.minY).toBeGreaterThanOrEqual(0)
        expect(b.maxX).toBeLessThanOrEqual(page.widthMm)
        expect(b.maxY).toBeLessThanOrEqual(page.heightMm)
      }
      expect(
        boxesSeparated(
          page.placements.map((p) => p.box),
          MIN_PIECE_GAP,
        ),
      ).toBe(true)
    }
  })

  it('a piece larger than A0 gets a warning and its own page', () => {
    const src = source(['10'])
    const s0 = src.sizes[0]
    const big = {
      ...s0,
      pattern: {
        ...s0.pattern,
        pieces: s0.pattern.pieces.map((p) =>
          p.id === 'back' ? { ...p, transform: { a: 4, b: 0, c: 0, d: 4, e: 2000, f: 0 } } : p,
        ),
      },
    }
    const doc = buildExportDocument({ ...src, sizes: [big] }, opts({ mode: 'a0' }))
    const over = doc.pages.filter((p) => p.oversize)
    expect(over).toHaveLength(1)
    expect(over[0].itemIds).toEqual(['back'])
    expect(over[0].widthMm > A0_MM.h || over[0].heightMm > A0_MM.h).toBe(true)
    expect(doc.warnings.some((w) => w.includes('no cabe en un A0'))).toBe(true)
    expect(doc.pages.find((p) => !p.oversize)!.itemIds).toEqual(['front'])
  })

  it('exports the extracted equivalent when nothing is extracted, without the construction frame', () => {
    const doc = buildExportDocument(source(['10'], []), opts())
    expect([...doc.pages[0].itemIds].sort()).toEqual(['back', 'front'])
    expect(
      boxesSeparated(
        doc.pages[0].placements.map((p) => p.box),
        MIN_PIECE_GAP,
      ),
    ).toBe(true)
    const withFrame = buildExportDocument(source(['10'], []), opts({ includeConstruction: true }))
    expect(withFrame.pages[0].itemIds).toContain('construccion')
  })

  it('layers can be switched off', () => {
    const doc = buildExportDocument(
      source(['10']),
      opts({ layers: { ...DEFAULT_EXPORT_OPTIONS.layers, cut: false, label: false } }),
    )
    expect(findGroup(doc.pages[0].groups, 'piece-front-cut')).toBeUndefined()
    expect(findGroup(doc.pages[0].groups, 'piece-front-label')).toBeUndefined()
    expect(findGroup(doc.pages[0].groups, 'piece-front-seam')).toBeDefined()
  })

  it('dashed cut lines', () => {
    const doc = buildExportDocument(source(['10']), opts({ cutLine: 'dashed' }))
    const g = findGroup(doc.pages[0].groups, 'piece-front-cut')!
    const p = g.children![0].prims[0]
    expect(p.kind === 'path' && p.stroke?.dash?.length).toBeTruthy()
  })
})

describe('SVG export', () => {
  it('width and height in mm, viewBox in mm, groups by piece and layer', () => {
    const [{ svg }] = exportSvgs(source(['10']), opts())
    const m =
      /<svg [^>]*width="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
    expect(m).not.toBeNull()
    expect(m![1]).toBe(m![3])
    expect(m![2]).toBe(m![4])
    expect(svg).toContain('<g id="piece-front">')
    expect(svg).toContain('<g id="piece-front-seam">')
    expect(svg).toMatch(
      /<rect id="test-square-rect" x="[\d.]+" y="[\d.]+" width="100" height="100"/,
    )
    expect(svg).toMatch(/C[\d.]+ /)
  })

  it('one SVG per size page', () => {
    const files = exportSvgs(source(['6', '8']), opts({ pagePerSize: true }))
    expect(files.map((f) => f.suffix)).toEqual(['-t6', '-t8'])
  })
})

describe('file names', () => {
  it('<titulo>-talla-<x>', () => {
    expect(exportBaseName('Cuerpo base mujer', ['10'])).toBe('cuerpo-base-mujer-talla-10')
    expect(exportBaseName('Falda ñandú', ['6', '8'])).toBe('falda-nandu-talla-6-8')
  })
})

describe('every block exports', () => {
  it('all sizes nested on A0 for each block', () => {
    for (const id of [
      'women-bodice',
      'women-skirt',
      'women-sleeve',
      'women-trousers',
      'men-bodice',
      'men-sleeve',
      'men-trousers',
    ]) {
      const sizes = blockSizes(getBlock(id))
      const doc = buildExportDocument(source(sizes, EXTRACT, id), opts({ mode: 'a0' }))
      expect(doc.pages.length).toBeGreaterThan(0)
      for (const p of doc.pages)
        expect(
          boxesSeparated(
            p.placements.map((x) => x.box),
            MIN_PIECE_GAP,
          ),
        ).toBe(true)
    }
  })
})

describe('piece selection', () => {
  it('leaves out excluded pieces, single and nested sizes', () => {
    for (const sizes of [['M'], ['S', 'M']]) {
      const src = source(blockSizes(getBlock('women-bodice')).slice(0, sizes.length))
      const pieces = exportPieces(src)
      expect(pieces.length).toBeGreaterThan(1)
      const all = buildExportDocument(src, opts({ pagePerSize: false }))
      const some = buildExportDocument(
        src,
        opts({ pagePerSize: false, excludedPieces: [pieces[0].id] }),
      )
      const ids = (d: typeof all) => d.pages.flatMap((p) => p.itemIds)
      expect(ids(all).some((i) => i.startsWith(pieces[0].id))).toBe(true)
      expect(ids(some).some((i) => i.startsWith(pieces[0].id))).toBe(false)
      expect(ids(some).length).toBe(ids(all).length - 1)
    }
  })
})
