/**
 * Exportar (SPEC §9): format, sizes, layers, nested or one page per size, cut line style, file
 * name and a preview of the pages; Descargar, or "Enviar a a0-to-domestic" (single-sheet PDF sent
 * with the postMessage protocol of docs/integrations/a0-to-domestic.md).
 */
import { CircleCheck, Download, ExternalLink, Send, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getBlock } from '../../blocks'
import { getTable } from '../../data'
import { cmdsToD } from '../../export/svg'
import {
  DEFAULT_EXPORT_LAYERS,
  EXPORT_LAYERS,
  buildExportDocument,
  exportBaseName,
  exportPdf,
  exportPieces,
  exportSvgs,
  type A0tdStatus,
  type ExportDocument,
  type ExportLayer,
  type ExportOptions,
  type Group,
  type LayerSet,
} from '../../export'
import { useEditorStore } from '../store/editorStore'
import { downloadFile, exportSource, orderedSizes } from './exportSource'
import { clearFinishedTransfer, startA0tdTransfer, useA0tdTransfer } from './a0tdTransfer'
import './exportDialog.css'

export type ExportFormat = 'pdf-a0' | 'pdf-single' | 'svg'

const FORMATS: readonly { id: ExportFormat; label: string }[] = [
  { id: 'pdf-a0', label: 'PDF A0' },
  { id: 'pdf-single', label: 'PDF hoja única' },
  { id: 'svg', label: 'SVG' },
]

const PREVIEW_GAP = 80

/** Thumbnail of the pages side by side: page outlines and the pieces' lines (no text). */
function PagesPreview({ doc }: { doc: ExportDocument }) {
  const pages = doc.pages
  const width =
    pages.reduce((s, p) => s + p.widthMm, 0) + PREVIEW_GAP * Math.max(0, pages.length - 1)
  const height = Math.max(1, ...pages.map((p) => p.heightMm))
  const offsets = pages.map((_, i) =>
    pages.slice(0, i).reduce((acc, q) => acc + q.widthMm + PREVIEW_GAP, 0),
  )
  const draw = (g: Group): ReactNode[] => [
    ...g.prims.map((p, i) =>
      p.kind === 'path' ? (
        <path
          key={`${g.id}-${i}`}
          d={cmdsToD(p.cmds)}
          stroke={p.stroke?.color ?? 'none'}
          fill={p.fill ?? 'none'}
          vectorEffect="non-scaling-stroke"
        />
      ) : p.kind === 'rect' ? (
        <rect
          key={`${g.id}-${i}`}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          stroke={p.stroke?.color ?? 'none'}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ) : null,
    ),
    ...(g.children ?? []).flatMap(draw),
  ]
  return (
    <svg
      className="export-preview-svg"
      data-testid="export-preview"
      viewBox={`${-PREVIEW_GAP / 4} ${-PREVIEW_GAP / 4} ${width + PREVIEW_GAP / 2} ${height + PREVIEW_GAP / 2}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Vista previa: ${pages.length} página(s)`}
    >
      {pages.map((p, i) => {
        return (
          <g key={i} transform={`translate(${offsets[i]} 0)`}>
            <rect
              className="preview-page"
              data-testid="preview-page"
              data-width-mm={p.widthMm.toFixed(2)}
              data-height-mm={p.heightMm.toFixed(2)}
              width={p.widthMm}
              height={p.heightMm}
              vectorEffect="non-scaling-stroke"
            />
            <g strokeWidth={0.6}>{p.groups.flatMap(draw)}</g>
            <text
              x={p.widthMm / 2}
              y={p.heightMm + PREVIEW_GAP / 2.5}
              textAnchor="middle"
              fontSize={height / 22}
            >
              {i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const pageSummary = (doc: ExportDocument): string => {
  const n = doc.pages.length
  const sizes = [
    ...new Set(doc.pages.map((p) => `${p.widthMm.toFixed(0)} × ${p.heightMm.toFixed(0)} mm`)),
  ]
  return `${n} ${n === 1 ? 'página' : 'páginas'} · ${sizes.join(', ')}`
}

function StatusLine({ status }: { status: A0tdStatus | null }) {
  if (!status) return null
  switch (status.state) {
    case 'waiting':
      return <p className="export-status">Abriendo a0-to-domestic y esperando respuesta…</p>
    case 'sent':
      return <p className="export-status">PDF enviado; esperando confirmación de a0-to-domestic…</p>
    case 'ok':
      return (
        <p className="export-status is-ok">
          <CircleCheck size={16} aria-hidden /> a0-to-domestic recibió el patrón. Continúa en su
          pestaña.
        </p>
      )
    case 'error':
      return (
        <p className="export-status is-error" data-code={status.code}>
          <TriangleAlert size={16} aria-hidden /> {status.message}
        </p>
      )
    case 'fallback':
      return (
        <p className="export-status is-warn" data-reason={status.reason}>
          <TriangleAlert size={16} aria-hidden />
          {status.reason === 'blocked'
            ? 'El navegador bloqueó la ventana emergente. '
            : 'a0-to-domestic no respondió a tiempo. '}
          Abre a0-to-domestic y carga el archivo descargado:{' '}
          <a href={status.url} target="_blank" rel="noopener noreferrer">
            {status.url} <ExternalLink size={12} aria-hidden />
          </a>
        </p>
      )
  }
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const blockId = useEditorStore((s) => s.blockId)
  const blockOptions = useEditorStore((s) => s.blockOptions)
  const operations = useEditorStore((s) => s.operations)
  const advanced = useEditorStore((s) => s.advanced)
  const title = useEditorStore((s) => s.title)
  const size = useEditorStore((s) => s.size)
  const block = getBlock(blockId)
  const table = getTable(block.system)
  const [format, setFormat] = useState<ExportFormat>('pdf-single')
  const [svgSheets, setSvgSheets] = useState<'single' | 'a0'>('single')
  const [sizes, setSizes] = useState<string[]>([size])
  const [layers, setLayers] = useState<LayerSet>(DEFAULT_EXPORT_LAYERS)
  const [pagePerSize, setPagePerSize] = useState(false)
  const [cutLine, setCutLine] = useState<'solid' | 'dashed'>('solid')
  const [includeConstruction, setIncludeConstruction] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const status = useA0tdTransfer((s) => s.status)
  const [excluded, setExcluded] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    clearFinishedTransfer()
    dialogRef.current?.focus()
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // The a0-to-domestic transfer keeps running (a0tdTransfer.ts) and reports with a toast.
    }
  }, [onClose])

  const sizesKey = orderedSizes(blockId, sizes).join(',')
  const chosen = useMemo(() => (sizesKey ? sizesKey.split(',') : []), [sizesKey])
  const multi = chosen.length > 1
  const options: ExportOptions = useMemo(
    () => ({
      mode: format === 'pdf-a0' || (format === 'svg' && svgSheets === 'a0') ? 'a0' : 'single',
      layers,
      cutLine,
      pagePerSize: multi && pagePerSize,
      includeConstruction,
      ...(excluded.length > 0 && { excludedPieces: excluded }),
    }),
    [format, svgSheets, layers, cutLine, multi, pagePerSize, includeConstruction, excluded],
  )
  const baseName = fileName ?? exportBaseName(title, chosen)
  const source = useMemo(
    () =>
      chosen.length
        ? exportSource({ blockId, blockOptions, operations, advanced, title, size }, chosen)
        : null,
    [blockId, blockOptions, operations, advanced, title, size, chosen],
  )
  const pieces = useMemo(() => (source ? exportPieces(source) : []), [source])
  const noPieces = pieces.length > 0 && pieces.every((p) => excluded.includes(p.id))
  const doc = useMemo(
    () => (source ? buildExportDocument(source, options) : null),
    [source, options],
  )

  const toggleSize = (id: string) =>
    setSizes((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]))
  const togglePiece = (id: string) =>
    setExcluded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const toggleLayer = (id: ExportLayer) => setLayers((cur) => ({ ...cur, [id]: !cur[id] }))

  const download = async () => {
    if (!source || noPieces) return
    setBusy(true)
    setError(null)
    try {
      if (format === 'svg') {
        for (const f of exportSvgs(source, options))
          downloadFile(f.svg, `${baseName}${f.suffix}.svg`, 'image/svg+xml')
      } else {
        const { bytes } = await exportPdf(source, options)
        downloadFile(bytes, `${baseName}.pdf`, 'application/pdf')
      }
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** Must stay synchronous up to sendToA0td: window.open needs the click gesture. */
  const send = () => {
    if (!source || noPieces) return
    setError(null)
    const name = `${exportBaseName(title, chosen)}.pdf`
    // The single-sheet PDF, one page per size (integration contract).
    const singleOptions: ExportOptions = { ...options, mode: 'single', pagePerSize: multi }
    const file = Promise.resolve().then(async () => ({
      name,
      bytes: (await exportPdf(source, singleOptions)).bytes,
    }))
    startA0tdTransfer({
      file,
      download: (f) => downloadFile(f.bytes, f.name, 'application/pdf'),
    })
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="modal export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
        data-testid="export-dialog"
      >
        <header className="modal-head">
          <h2 id="export-title">Exportar a escala 1:1</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="export-body">
          <div className="export-form">
            <fieldset>
              <legend>Formato</legend>
              <div className="segmented-light" role="radiogroup" aria-label="Formato">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={format === f.id}
                    aria-selected={format === f.id}
                    data-format={f.id}
                    onClick={() => setFormat(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {format === 'svg' && (
                <div className="export-radios" role="radiogroup" aria-label="Hojas del SVG">
                  <label>
                    <input
                      type="radio"
                      name="svg-sheets"
                      checked={svgSheets === 'single'}
                      onChange={() => setSvgSheets('single')}
                    />
                    Hoja única
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="svg-sheets"
                      checked={svgSheets === 'a0'}
                      onChange={() => setSvgSheets('a0')}
                    />
                    Hojas A0
                  </label>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend>
                Tallas{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setSizes(table.sizes.map((z) => z.id))}
                >
                  Todas
                </button>
              </legend>
              <div className="export-sizes" role="group" aria-label="Tallas a exportar">
                {table.sizes.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    className="chip"
                    aria-pressed={chosen.includes(z.id)}
                    data-size={z.id}
                    onClick={() => toggleSize(z.id)}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <div className="export-radios" role="radiogroup" aria-label="Varias tallas">
                <label className={multi ? '' : 'is-disabled'}>
                  <input
                    type="radio"
                    name="sizes-mode"
                    disabled={!multi}
                    checked={!pagePerSize}
                    onChange={() => setPagePerSize(false)}
                  />
                  Tallas anidadas
                </label>
                <label className={multi ? '' : 'is-disabled'}>
                  <input
                    type="radio"
                    name="sizes-mode"
                    disabled={!multi}
                    checked={pagePerSize}
                    onChange={() => setPagePerSize(true)}
                  />
                  Una página por talla
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Piezas</legend>
              <div className="export-layers" role="group" aria-label="Piezas a exportar">
                {pieces.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={!excluded.includes(p.id)}
                      data-piece={p.id}
                      onChange={() => togglePiece(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <p className="muted small">
                La disposición es la de la vista Piezas; si las piezas no caben o se solapan, se
                recolocan automáticamente.
              </p>
            </fieldset>

            <fieldset>
              <legend>Capas</legend>
              <div className="export-layers">
                {EXPORT_LAYERS.map((l) => (
                  <label key={l.id}>
                    <input
                      type="checkbox"
                      checked={layers[l.id]}
                      data-layer={l.id}
                      onChange={() => toggleLayer(l.id)}
                    />
                    {l.label}
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={includeConstruction}
                    data-testid="include-construction"
                    onChange={() => setIncludeConstruction(!includeConstruction)}
                  />
                  Incluir trazo de construcción
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Línea de corte</legend>
              <div className="export-radios" role="radiogroup" aria-label="Línea de corte">
                <label>
                  <input
                    type="radio"
                    name="cut-line"
                    checked={cutLine === 'solid'}
                    onChange={() => setCutLine('solid')}
                  />
                  Continua
                </label>
                <label>
                  <input
                    type="radio"
                    name="cut-line"
                    checked={cutLine === 'dashed'}
                    onChange={() => setCutLine('dashed')}
                  />
                  Discontinua
                </label>
              </div>
            </fieldset>

            <label className="export-filename">
              <span>Nombre del archivo</span>
              <span className="export-filename-row">
                <input
                  type="text"
                  value={baseName}
                  aria-label="Nombre del archivo"
                  onChange={(ev) => setFileName(ev.target.value)}
                />
                <span className="muted">.{format === 'svg' ? 'svg' : 'pdf'}</span>
              </span>
            </label>
          </div>

          <div className="export-side">
            <div className="export-preview">
              {doc && doc.pages.length > 0 && !noPieces ? (
                <PagesPreview doc={doc} />
              ) : (
                <p className="muted small">
                  {noPieces ? 'Elige al menos una pieza.' : 'Elige al menos una talla.'}
                </p>
              )}
            </div>
            {doc && (
              <p className="small" data-testid="export-summary">
                {pageSummary(doc)}
              </p>
            )}
            {doc?.warnings.map((w) => (
              <p key={w} className="export-warning small" data-testid="export-warning">
                <TriangleAlert size={14} aria-hidden /> {w}
              </p>
            ))}
          </div>
        </div>

        <div role="status" data-testid="export-status">
          <StatusLine status={status} />
          {error && <p className="export-status is-error">{error}</p>}
        </div>

        <footer className="modal-actions">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Cerrar
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-outline"
            disabled={!source || noPieces}
            onClick={send}
            title="Envía el PDF de hoja única a a0-to-domestic para imprimirlo en A4/Carta"
          >
            <Send size={16} /> Enviar a a0-to-domestic
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!source || noPieces || busy}
            onClick={download}
          >
            <Download size={16} /> Descargar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
