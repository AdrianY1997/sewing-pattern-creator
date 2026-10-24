import { useMemo } from 'react'
import {
  edgePolyline,
  poseAffine,
  rulerGraduations,
  toWorld,
  type CubicBezier,
  type Ruler,
  type RulerPose,
  type TickLevel,
  type Vec,
} from '../../core'

const f = (n: number) => Number(n.toFixed(3))
const polyD = (pts: readonly Vec[], close = false) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('') + (close ? 'Z' : '')

/** Path data of a ruler in its own frame (body, working edges, ticks by level), memoised per ruler. */
const useRulerPaths = (ruler: Ruler) =>
  useMemo(() => {
    const ticks: Record<TickLevel, string[]> = { mm: [], half: [], cm: [] }
    for (const g of rulerGraduations(ruler))
      for (const t of g.ticks)
        ticks[t.level].push(`M${f(t.from.x)} ${f(t.from.y)}L${f(t.to.x)} ${f(t.to.y)}`)
    return {
      body: polyD(ruler.outline, true),
      edges: ruler.edges.map((e) => ({ id: e.id, d: polyD(edgePolyline(e, 0, e.totalLength, 2)) })),
      ticks: { mm: ticks.mm.join(''), half: ticks.half.join(''), cm: ticks.cm.join('') },
    }
  }, [ruler])

/** Centimetre step between numbers so they stay ≥ 22 px apart on screen. */
const labelStep = (scale: number) => [1, 2, 5, 10, 20].find((k) => scale * 10 * k >= 22) ?? 50

const bezierD = (chain: readonly CubicBezier[]) =>
  chain.length
    ? `M${f(chain[0].p0.x)} ${f(chain[0].p0.y)}` +
      chain
        .map(
          (b) => `C${f(b.p1.x)} ${f(b.p1.y)} ${f(b.p2.x)} ${f(b.p2.y)} ${f(b.p3.x)} ${f(b.p3.y)}`,
        )
        .join('')
    : ''

export interface RulerLayerProps {
  readonly ruler: Ruler
  readonly pose: RulerPose
  /** View scale (px per mm). */
  readonly scale: number
  /** Ruler interactive (Reglas tool, place mode): body draggable, rotate handle shown. */
  readonly interactive: boolean
  /** Trace preview (world Béziers), its clicked points and whether it deviates too much. */
  readonly preview: readonly CubicBezier[] | null
  readonly points: readonly Vec[]
  readonly warn: boolean
}

/** A ruler drawn semi-transparent at true size (world mm), with graduations and numbers. */
export function RulerLayer({
  ruler,
  pose,
  scale,
  interactive,
  preview,
  points,
  warn,
}: RulerLayerProps) {
  const paths = useRulerPaths(ruler)
  const m = poseAffine(pose)
  const matrix = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`
  const step = labelStep(scale)
  const fontMm = Math.max(3.2, 10 / scale)
  const px = 1 / scale
  const labels = useMemo(() => {
    const out: { key: string; at: Vec; deg: number; text: string }[] = []
    rulerGraduations(ruler).forEach((g) => {
      for (const l of g.labels) {
        if (Math.round(l.value) % step !== 0) continue
        let deg = pose.angleDeg + ((pose.flipped ? -1 : 1) * l.theta * 180) / Math.PI
        deg = ((deg % 360) + 360) % 360
        if (deg > 90 && deg < 270) deg -= 180
        out.push({
          key: `${g.edgeId}:${l.value}`,
          at: toWorld(pose, l.at),
          deg,
          text: String(Math.round(l.value)),
        })
      }
    })
    return out
  }, [ruler, pose, step])
  const centre = toWorld(pose, ruler.centre)
  const handle = toWorld(pose, ruler.handle)
  return (
    <g className="ruler" data-testid="ruler" data-ruler={ruler.id} aria-label={ruler.name}>
      <g transform={matrix}>
        <path
          className={interactive ? 'ruler-body is-interactive' : 'ruler-body'}
          data-ruler-body=""
          data-testid="ruler-body"
          d={paths.body}
        />
        {scale >= 3 && <path className="ruler-ticks is-mm" d={paths.ticks.mm} />}
        {scale >= 1 && <path className="ruler-ticks is-half" d={paths.ticks.half} />}
        <path className="ruler-ticks is-cm" d={paths.ticks.cm} />
        {paths.edges.map((e) => (
          <path key={e.id} className="ruler-edge" data-ruler-edge={e.id} d={e.d} />
        ))}
      </g>
      <g className="ruler-labels">
        {labels.map((l) => (
          <text
            key={l.key}
            x={l.at.x}
            y={l.at.y}
            fontSize={fontMm}
            transform={`rotate(${f(l.deg)} ${f(l.at.x)} ${f(l.at.y)})`}
          >
            {l.text}
          </text>
        ))}
      </g>
      {interactive && (
        <g className="ruler-handle-group">
          <line x1={centre.x} y1={centre.y} x2={handle.x} y2={handle.y} />
          <circle className="ruler-pivot" cx={centre.x} cy={centre.y} r={3 * px} />
          <circle
            className="ruler-handle"
            data-ruler-handle="rotate"
            data-testid="ruler-rotate"
            cx={handle.x}
            cy={handle.y}
            r={7 * px}
          >
            <title>Girar la regla (Mayús: pasos de 15°)</title>
          </circle>
        </g>
      )}
      {preview && (
        <path
          className={warn ? 'ruler-trace is-warn' : 'ruler-trace'}
          data-testid="ruler-trace"
          d={bezierD(preview)}
        />
      )}
      {points.map((p, i) => (
        <circle key={i} className="ruler-trace-point" cx={p.x} cy={p.y} r={4 * px} />
      ))}
    </g>
  )
}
