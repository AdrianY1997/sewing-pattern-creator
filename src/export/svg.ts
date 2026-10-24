/**
 * SVG of an export page: width/height in mm and a viewBox in mm (1 user unit = 1 mm), groups by
 * piece and layer (`<g id>`), inline styles. Béziers stay curves (`C`).
 */
import type { ExportPage, Group, PathCmd, Prim, Stroke } from './types'

const n = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4
  return Object.is(r, -0) ? '0' : String(r)
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const cmdsToD = (cmds: readonly PathCmd[]): string =>
  cmds
    .map((k) =>
      k.c === 'Z'
        ? 'Z'
        : k.c === 'C'
          ? `C${n(k.p1.x)} ${n(k.p1.y)} ${n(k.p2.x)} ${n(k.p2.y)} ${n(k.p.x)} ${n(k.p.y)}`
          : `${k.c}${n(k.p.x)} ${n(k.p.y)}`,
    )
    .join('')

const strokeStyle = (s: Stroke | undefined, fill: string | undefined) => {
  const parts = [`fill:${fill ?? 'none'}`]
  if (s) {
    parts.push(
      `stroke:${s.color}`,
      `stroke-width:${n(s.widthMm)}`,
      'stroke-linecap:round',
      'stroke-linejoin:round',
    )
    if (s.dash?.length) parts.push(`stroke-dasharray:${s.dash.map(n).join(' ')}`)
  } else parts.push('stroke:none')
  return parts.join(';')
}

function primSvg(p: Prim): string {
  if (p.kind === 'path')
    return `<path d="${cmdsToD(p.cmds)}" style="${strokeStyle(p.stroke, p.fill)}"/>`
  if (p.kind === 'rect')
    return `<rect${p.tag ? ` id="${p.tag === 'TestSquare' ? 'test-square-rect' : esc(p.tag)}"` : ''} x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" style="${strokeStyle(p.stroke, p.fill)}"/>`
  const anchor = p.anchor === 'start' ? '' : ` text-anchor="${p.anchor}"`
  const rot = p.angleDeg ? ` transform="rotate(${n(p.angleDeg)} ${n(p.at.x)} ${n(p.at.y)})"` : ''
  const weight = p.bold ? ';font-weight:bold' : ''
  return `<text x="${n(p.at.x)}" y="${n(p.at.y)}"${anchor}${rot} style="font-family:Helvetica,Arial,sans-serif;font-size:${n(p.sizeMm)}px;fill:${p.color}${weight}">${esc(p.text)}</text>`
}

function groupSvg(g: Group, indent: string): string {
  const inner = [
    ...g.prims.map((p) => `${indent}  ${primSvg(p)}`),
    ...(g.children ?? []).map((c) => groupSvg(c, `${indent}  `)),
  ]
  return `${indent}<g id="${esc(g.id)}">\n${inner.join('\n')}\n${indent}</g>`
}

/** One page as a standalone SVG document. */
export function pageToSvg(page: ExportPage, title = ''): string {
  const w = n(page.widthMm)
  const h = n(page.heightMm)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    title ? `  <title>${esc(title)}</title>` : '',
    `  <rect id="page" x="0" y="0" width="${w}" height="${h}" style="fill:#ffffff;stroke:none"/>`,
    ...page.groups.map((g) => groupSvg(g, '  ')),
    '</svg>',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n')
}
