/** Exact 1:1 export (SPEC §9): PDF (A0 sheets or one sheet) and SVG. Pure TS, no React. */
import { layoutDocument } from './layout'
import { writePdf } from './pdf'
import { pageToSvg } from './svg'
import type { ExportDocument, ExportOptions, ExportSource } from './types'

export * from './types'
export * from './geometry'
export * from './render'
export * from './layout'
export * from './pdf'
export * from './svg'
export * from './a0td'

export const buildExportDocument = (src: ExportSource, options: ExportOptions): ExportDocument =>
  layoutDocument(src, options)

/** PDF bytes of the export. */
export async function exportPdf(
  src: ExportSource,
  options: ExportOptions,
): Promise<{ bytes: Uint8Array; doc: ExportDocument }> {
  const doc = layoutDocument(src, options)
  const sizes = src.sizes.map((s) => s.label).join(', ')
  return { bytes: await writePdf(doc, { title: src.title, subject: `Tallas ${sizes}` }), doc }
}

/** One SVG per page (`suffix` tells pages apart in file names: '' for a single page). */
export function exportSvgs(
  src: ExportSource,
  options: ExportOptions,
): { suffix: string; svg: string }[] {
  const doc = layoutDocument(src, options)
  return doc.pages.map((p, i) => ({
    suffix:
      doc.pages.length === 1
        ? ''
        : options.pagePerSize &&
            p.sizes.length === 1 &&
            doc.pages.filter((q) => q.sizes[0] === p.sizes[0]).length === 1
          ? `-t${p.sizes[0]}`
          : `-p${i + 1}`,
    svg: pageToSvg(p, src.title),
  }))
}

/** File-name slug: lowercase ASCII, words joined by '-'. */
export const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'patron'

/** `<titulo>-talla-<x>` (several sizes joined by '-'), without extension. */
export const exportBaseName = (title: string, sizeLabels: readonly string[]): string =>
  `${slug(title)}-talla-${sizeLabels.map(slug).join('-')}`

/** dd/mm/aaaa. */
export const formatExportDate = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
