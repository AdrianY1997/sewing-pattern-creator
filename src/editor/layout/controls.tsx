/** Small shared controls of the editor UI. */
import type { ReactNode } from 'react'

/** Tooltip of disabled placeholders (docs/UI.md §4). */
export const OUT_OF_V1 = 'Fuera de v1'
/** Tooltip of features planned for a later phase. */
export const COMING_SOON = 'Próximamente'

export interface SwitchProps {
  readonly label: string
  readonly checked: boolean
  readonly onChange?: (checked: boolean) => void
  readonly disabled?: boolean
  readonly title?: string
}

export function Switch({ label, checked, onChange, disabled, title }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    />
  )
}

export interface SelectProps<T extends string> {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onChange?: (value: T) => void
  readonly icon?: ReactNode
  readonly small?: boolean
  readonly disabled?: boolean
  readonly testId?: string
}

/** A native select inside a bordered box, optionally with a leading icon. */
export function Select<T extends string>(props: SelectProps<T>) {
  const { label, value, options, onChange, icon, small, disabled, testId } = props
  return (
    <span className={small ? 'select-wrap select-sm' : 'select-wrap'}>
      {icon}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(ev) => onChange?.(ev.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Labelled form row of the side panels. */
export function Field({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  )
}
