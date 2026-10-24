/**
 * Vector PDF of an export document with pdf-lib: 1 mm = 72/25.4 pt exactly, MediaBox = the page
 * size, Béziers written as PDF curves (`c`), the test square as an exact rectangle (`re`) inside a
 * `/TestSquare BMC … EMC` marked-content section.
 */
import {
  appendBezierCurve,
  beginMarkedContent,
  closePath,
  degrees,
  endMarkedContent,
  fill,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setDashPattern,
  setFillingRgbColor,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  StandardFonts,
  stroke,
  fillAndStroke,
  type PDFFont,
  type PDFOperator,
} from 'pdf-lib'
import {
  PT_PER_MM,
  type ExportDocument,
  type ExportPage,
  type Group,
  type PathCmd,
  type Prim,
} from './types'

export type Rgb = readonly [number, number, number]

const hexRgb = (hex: string): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** A drawing operation in PDF user space (pt, y up). */
export type PdfOp =
  | {
      readonly op: 'path'
      /** Flat command list: ['m', x, y], ['l', x, y], ['c', x1, y1, x2, y2, x, y], ['h']. */
      readonly cmds: readonly (readonly [string, ...number[]])[]
      readonly stroke?: {
        readonly rgb: Rgb
        readonly width: number
        readonly dash: readonly number[]
      }
      readonly fill?: Rgb
    }
  | {
      readonly op: 'rect'
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
      readonly stroke?: {
        readonly rgb: Rgb
        readonly width: number
        readonly dash: readonly number[]
      }
      readonly fill?: Rgb
      readonly tag?: string
    }
  | {
      readonly op: 'text'
      /** Anchor point (pt). */
      readonly x: number
      readonly y: number
      readonly text: string
      readonly size: number
      readonly rgb: Rgb
      readonly anchor: 'start' | 'middle' | 'end'
      /** Degrees, counter-clockwise (PDF). */
      readonly rotate: number
      readonly bold: boolean
    }

export interface CompiledPage {
  readonly widthPt: number
  readonly heightPt: number
  readonly ops: readonly PdfOp[]
}

const flatGroups = (gs: readonly Group[]): Prim[] =>
  gs.flatMap((g) => [...g.prims, ...flatGroups(g.children ?? [])])

/** Page → PDF operations (pt, y flipped). Exposed for tests. */
export function compilePage(page: ExportPage): CompiledPage {
  const K = PT_PER_MM
  const H = page.heightMm
  const X = (x: number) => x * K
  const Y = (y: number) => (H - y) * K
  const strokeOf = (s: Extract<Prim, { kind: 'path' }>['stroke']) =>
    s && { rgb: hexRgb(s.color), width: s.widthMm * K, dash: (s.dash ?? []).map((d) => d * K) }
  const cmd = (k: PathCmd): readonly [string, ...number[]] => {
    switch (k.c) {
      case 'M':
        return ['m', X(k.p.x), Y(k.p.y)]
      case 'L':
        return ['l', X(k.p.x), Y(k.p.y)]
      case 'C':
        return ['c', X(k.p1.x), Y(k.p1.y), X(k.p2.x), Y(k.p2.y), X(k.p.x), Y(k.p.y)]
      default:
        return ['h']
    }
  }
  const ops: PdfOp[] = flatGroups(page.groups).map((p): PdfOp => {
    if (p.kind === 'path')
      return {
        op: 'path',
        cmds: p.cmds.map(cmd),
        ...(p.stroke && { stroke: strokeOf(p.stroke) }),
        ...(p.fill && { fill: hexRgb(p.fill) }),
      }
    if (p.kind === 'rect')
      return {
        op: 'rect',
        x: X(p.x),
        y: Y(p.y + p.h),
        w: p.w * K,
        h: p.h * K,
        ...(p.stroke && { stroke: strokeOf(p.stroke) }),
        ...(p.fill && { fill: hexRgb(p.fill) }),
        ...(p.tag && { tag: p.tag }),
      }
    return {
      op: 'text',
      x: X(p.at.x),
      y: Y(p.at.y),
      text: p.text,
      size: p.sizeMm * K,
      rgb: hexRgb(p.color),
      anchor: p.anchor,
      rotate: -(p.angleDeg ?? 0),
      bold: p.bold === true,
    }
  })
  return { widthPt: page.widthMm * K, heightPt: page.heightMm * K, ops }
}

/** Replace characters the standard (WinAnsi) font cannot encode. */
function encodable(font: PDFFont, text: string): string {
  try {
    font.encodeText(text)
    return text
  } catch {
    return [...text]
      .map((ch) => {
        try {
          font.encodeText(ch)
          return ch
        } catch {
          return '?'
        }
      })
      .join('')
  }
}

function strokeOps(s: NonNullable<Extract<PdfOp, { op: 'path' }>['stroke']>): PDFOperator[] {
  return [
    setStrokingRgbColor(...s.rgb),
    setLineWidth(s.width),
    setDashPattern([...s.dash], 0),
    setLineCap(LineCapStyle.Round),
    setLineJoin(LineJoinStyle.Round),
  ]
}

export interface PdfMeta {
  readonly title: string
  readonly author?: string
  readonly subject?: string
}

/** The export document as a PDF file. */
export async function writePdf(
  doc: ExportDocument,
  meta: PdfMeta = { title: doc.title },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(meta.title || 'Patrón')
  pdf.setCreator('Sewing Pattern Creator')
  pdf.setProducer('Sewing Pattern Creator (pdf-lib)')
  if (meta.subject) pdf.setSubject(meta.subject)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  for (const page of doc.pages) {
    const c = compilePage(page)
    const p = pdf.addPage([c.widthPt, c.heightPt])
    for (const op of c.ops) {
      if (op.op === 'text') {
        const font = op.bold ? bold : regular
        const text = encodable(font, op.text)
        const w = font.widthOfTextAtSize(text, op.size)
        const shift = op.anchor === 'middle' ? w / 2 : op.anchor === 'end' ? w : 0
        const a = (op.rotate * Math.PI) / 180
        p.drawText(text, {
          x: op.x - Math.cos(a) * shift,
          y: op.y - Math.sin(a) * shift,
          size: op.size,
          font,
          color: rgb(...op.rgb),
          ...(op.rotate !== 0 && { rotate: degrees(op.rotate) }),
        })
        continue
      }
      const ops: PDFOperator[] = [pushGraphicsState()]
      if (op.op === 'rect' && op.tag) ops.unshift(beginMarkedContent(op.tag))
      if (op.stroke) ops.push(...strokeOps(op.stroke))
      if (op.fill) ops.push(setFillingRgbColor(...op.fill))
      if (op.op === 'rect') ops.push(rectangle(op.x, op.y, op.w, op.h))
      else
        for (const [k, ...n] of op.cmds) {
          if (k === 'm') ops.push(moveTo(n[0], n[1]))
          else if (k === 'l') ops.push(lineTo(n[0], n[1]))
          else if (k === 'c') ops.push(appendBezierCurve(n[0], n[1], n[2], n[3], n[4], n[5]))
          else ops.push(closePath())
        }
      ops.push(op.stroke && op.fill ? fillAndStroke() : op.fill ? fill() : stroke())
      ops.push(popGraphicsState())
      if (op.op === 'rect' && op.tag) ops.push(endMarkedContent())
      p.pushOperators(...ops)
    }
  }
  return pdf.save()
}
