'use client'

import type { PriceCheckSizeOptionEnriched } from '@/lib/priceCheckClient'

/** Snap-to-step slider across sheet table sizes for the selected machine line. */
export function TableSizeSlider({
  sizes,
  valueCode,
  disabled,
  onChange,
}: {
  sizes: PriceCheckSizeOptionEnriched[]
  valueCode: string
  disabled?: boolean
  onChange: (code: string) => void
}) {
  const index = Math.max(
    0,
    sizes.findIndex((s) => s.code === valueCode)
  )
  const current = sizes[index] ?? sizes[0]

  if (!sizes.length) {
    return <p className="text-sm text-gray-400 py-2">No table sizes on the sheet for this line.</p>
  }

  if (sizes.length === 1 && current) {
    return (
      <p className="text-sm font-semibold text-[#0A2E52] py-1">
        {current.feetLabel ? `${current.label} (${current.feetLabel})` : current.label}
      </p>
    )
  }

  return (
    <div className="space-y-3 pt-0.5">
      <div className="flex justify-between items-baseline gap-3">
        <p className="text-sm font-semibold text-[#0A2E52] leading-snug">
          {current?.feetLabel ? `${current.label} (${current.feetLabel})` : current?.label}
        </p>
        <span className="text-xs text-gray-500 tabular-nums shrink-0">
          {index + 1} / {sizes.length}
        </span>
      </div>

      <input
        type="range"
        className="table-size-slider w-full h-2 rounded-full appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-gray-200 accent-[#1B6FC8]"
        min={0}
        max={sizes.length - 1}
        step={1}
        value={index}
        disabled={disabled}
        aria-valuemin={0}
        aria-valuemax={sizes.length - 1}
        aria-valuenow={index}
        aria-valuetext={current?.label ?? ''}
        onChange={(e) => {
          const i = parseInt(e.target.value, 10)
          const next = sizes[i]
          if (next) onChange(next.code)
        }}
      />

      <div className="flex justify-between gap-2 text-[10px] text-gray-400 leading-tight">
        <span className="max-w-[45%] truncate" title={sizes[0]?.label}>
          {sizes[0]?.feetLabel ? `${sizes[0].label}` : sizes[0]?.label}
        </span>
        <span className="max-w-[45%] truncate text-right" title={sizes[sizes.length - 1]?.label}>
          {sizes[sizes.length - 1]?.feetLabel
            ? `${sizes[sizes.length - 1]!.label}`
            : sizes[sizes.length - 1]?.label}
        </span>
      </div>
    </div>
  )
}

/** Snap-to-step slider across sheet kW options for the selected model + laser. */
export function PowerSlider({
  options,
  value,
  disabled,
  onChange,
}: {
  options: string[]
  value: string
  disabled?: boolean
  onChange: (power: string) => void
}) {
  const index = Math.max(0, options.findIndex((p) => p === value))
  const current = options[index] ?? options[0]

  if (!options.length) {
    return <p className="text-sm text-gray-400 py-2">No power options on the sheet for this configuration.</p>
  }

  if (options.length === 1 && current) {
    return <p className="text-sm font-semibold text-[#0A2E52] py-1">{current}</p>
  }

  return (
    <div className="space-y-3 pt-0.5">
      <div className="flex justify-between items-baseline gap-3">
        <p className="text-sm font-semibold text-[#0A2E52] leading-snug">{current}</p>
        <span className="text-xs text-gray-500 tabular-nums shrink-0">
          {index + 1} / {options.length}
        </span>
      </div>

      <input
        type="range"
        className="table-size-slider w-full h-2 rounded-full appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-gray-200 accent-[#1B6FC8]"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        disabled={disabled}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuenow={index}
        aria-valuetext={current ?? ''}
        onChange={(e) => {
          const i = parseInt(e.target.value, 10)
          const next = options[i]
          if (next) onChange(next)
        }}
      />

      <div className="flex justify-between gap-2 text-[10px] text-gray-400 leading-tight">
        <span>{options[0]}</span>
        <span>{options[options.length - 1]}</span>
      </div>
    </div>
  )
}
