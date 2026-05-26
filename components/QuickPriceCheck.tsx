'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import DealerBrandHeader from '@/components/DealerBrandHeader'
import type {
  PriceCheckMachineOptionEnriched,
  PriceCheckSizeOptionEnriched,
} from '@/lib/priceCheckClient'
import {
  defaultMachineSelection,
  resolveSheetModel,
  tableSizeLabelFromSheetModel,
} from '@/lib/priceCheckClient'
import type { MachineOption } from '@/types'

type NeighborMode = 'format' | 'power'

interface PriceCheckSlot {
  role: 'down' | 'target' | 'up'
  label: string
  model: string
  power: string
  laserLabel: string
  totalPrice: number
  subtotal: number
  freight: number
  sheetMatched: boolean
}

interface ApiResponse {
  mode: NeighborMode
  disclaimer: string
  down: PriceCheckSlot | null
  target: PriceCheckSlot
  up: PriceCheckSlot | null
}

const LASER_FALLBACK = ['IPG', 'Raycus'] as const
const BEVEL_FALLBACK: MachineOption['bevelHead'][] = ['None', 'Basic Bevel', 'Plus Bevel']
const POWER_FALLBACK = ['3kW', '6kW', '10kW', '12kW', '15kW', '20kW', '25kW', '30kW', '40kW', '50kW', '60kW']

function parseKwLabel(power: string): number {
  const m = power.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 6
}

function pickDefaultSize(machine: PriceCheckMachineOptionEnriched | undefined): string {
  if (!machine?.sizes.length) return ''
  const prefer4020 = machine.sizes.find((s) => s.code === '4020')
  return prefer4020?.code ?? machine.sizes[0].code
}

function snapPower(kws: number[], current: string): string {
  if (!kws.length) return current
  const cur = parseKwLabel(current)
  if (kws.includes(cur)) return `${cur}kW`
  let pick = kws[0]!
  let best = Infinity
  for (const k of kws) {
    const d = Math.abs(k - cur)
    if (d < best) {
      best = d
      pick = k
    }
  }
  return `${pick}kW`
}

function constrain(
  catalog: PriceCheckMachineOptionEnriched[],
  draft: {
    familyId: string
    sizeCode: string
    laserSource: string
    bevelHead: MachineOption['bevelHead']
    machinePower: string
  }
) {
  const machine = catalog.find((m) => m.id === draft.familyId)
  const size = machine?.sizes.find((s) => s.code === draft.sizeCode)
  if (!size) return draft

  const laser = size.allowedLasers.includes(draft.laserSource)
    ? draft.laserSource
    : size.allowedLasers[0] ?? 'IPG'
  const bevel = size.allowedBevels.includes(draft.bevelHead)
    ? draft.bevelHead
    : (size.allowedBevels[0] as MachineOption['bevelHead']) ?? 'None'
  const kws = size.kwByLaser[laser] ?? []
  const machinePower = kws.length ? snapPower(kws, draft.machinePower) : draft.machinePower

  return { ...draft, laserSource: laser, bevelHead: bevel, machinePower }
}

function initialForm(catalog: PriceCheckMachineOptionEnriched[]) {
  const d = defaultMachineSelection(catalog)
  return constrain(catalog, {
    familyId: d.familyId,
    sizeCode: d.sizeCode,
    laserSource: 'IPG',
    bevelHead: 'None',
    machinePower: '20kW',
  })
}

function fmtUsd(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

/** Snap-to-step slider across sheet table sizes for the selected machine line. */
function TableSizeSlider({
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
function PowerSlider({
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

function SlotCard({
  slot,
  emphasis,
  neighborMode,
}: {
  slot: PriceCheckSlot | null
  emphasis: 'down' | 'target' | 'up'
  neighborMode: NeighborMode
}) {
  const border =
    emphasis === 'target'
      ? 'border-[#1B6FC8] bg-blue-50 ring-2 ring-[#1B6FC8]/25'
      : 'border-gray-200 bg-white'
  const tableSize = slot ? tableSizeLabelFromSheetModel(slot.model) : ''
  const title =
    emphasis === 'target'
      ? 'Your configuration'
      : neighborMode === 'format'
        ? emphasis === 'down'
          ? 'Previous size on sheet'
          : 'Next size on sheet'
        : emphasis === 'down'
          ? 'Lower power'
          : 'Higher power'

  if (!slot) {
    return (
      <div className={`rounded-xl border ${border} p-4 opacity-70`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
        <p className="mt-6 text-sm text-gray-400">No neighbor on the sheet for this mode.</p>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border ${border} p-4 flex flex-col min-h-[180px]`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-sm font-semibold text-[#0A2E52] leading-snug">{slot.label}</p>
      {tableSize ? <p className="text-xs text-gray-500 mt-0.5">Table {tableSize}</p> : null}
      <div className="mt-auto pt-4 space-y-1">
        <p className="text-2xl font-bold text-[#0A2E52]">{fmtUsd(slot.totalPrice)}</p>
        <p className="text-xs text-gray-500">
          Subtotal {fmtUsd(slot.subtotal)} · Freight {fmtUsd(slot.freight)}
        </p>
        {!slot.sheetMatched && (
          <p className="text-[11px] text-amber-700 font-medium">Approx. — no exact sheet row</p>
        )}
      </div>
    </div>
  )
}

interface Props {
  catalog: PriceCheckMachineOptionEnriched[]
  embed?: boolean
  user?: { name?: string | null; email?: string | null }
}

export default function QuickPriceCheck({ catalog, embed = false, user }: Props) {
  const [form, setForm] = useState(() => initialForm(catalog))

  useEffect(() => {
    if (catalog.length > 0) setForm(initialForm(catalog))
  }, [catalog])
  const [neighborMode, setNeighborMode] = useState<NeighborMode>('format')
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { familyId, sizeCode, laserSource, bevelHead, machinePower } = form

  const machineModel = useMemo(
    () => resolveSheetModel(catalog, familyId, sizeCode),
    [catalog, familyId, sizeCode]
  )

  const selectedMachine = useMemo(() => catalog.find((m) => m.id === familyId), [catalog, familyId])

  const selectedSize: PriceCheckSizeOptionEnriched | undefined = useMemo(
    () => selectedMachine?.sizes.find((s) => s.code === sizeCode),
    [selectedMachine, sizeCode]
  )

  const laserChoices = selectedSize?.allowedLasers.length ? selectedSize.allowedLasers : [...LASER_FALLBACK]
  const bevelChoices = selectedSize?.allowedBevels.length
    ? selectedSize.allowedBevels
    : [...BEVEL_FALLBACK]
  const powerChoices = useMemo(() => {
    const kws = selectedSize?.kwByLaser[laserSource] ?? []
    if (kws.length) return kws.map((k) => `${k}kW`)
    return [...POWER_FALLBACK]
  }, [selectedSize, laserSource])

  const setFamily = (id: string) => {
    const machine = catalog.find((m) => m.id === id)
    const nextSize = pickDefaultSize(machine)
    setForm((prev) => constrain(catalog, { ...prev, familyId: id, sizeCode: nextSize }))
  }

  const setSize = (code: string) => {
    setForm((prev) => constrain(catalog, { ...prev, sizeCode: code }))
  }

  const runCheck = useCallback(async () => {
    if (!machineModel) {
      setResult(null)
      setError('Select a machine and table size.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dealer/price-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineModel,
          machinePower,
          laserSource,
          bevelHead,
          neighborMode,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as ApiResponse & { error?: string }
      if (!res.ok) {
        setResult(null)
        setError(data.error || `Request failed (${res.status})`)
        return
      }
      setResult(data as ApiResponse)
    } catch {
      setResult(null)
      setError('Network error — try again.')
    } finally {
      setLoading(false)
    }
  }, [machineModel, machinePower, laserSource, bevelHead, neighborMode])

  useEffect(() => {
    if (!machineModel) return
    void runCheck()
  }, [machineModel, machinePower, laserSource, bevelHead, neighborMode, runCheck])

  if (!catalog.length) {
    return (
      <div className="cla-page-canvas min-h-screen">
        <DealerBrandHeader user={user} eyebrow={embed ? 'Embedded price check' : undefined} />
        <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
            Price check is unavailable — the dealer price sheet catalog is empty.
          </div>
        </main>
      </div>
    )
  }

  const familyValue = catalog.some((m) => m.id === familyId) ? familyId : catalog[0]!.id
  const sizes = selectedMachine?.sizes ?? []
  const sizeValue = sizes.some((s) => s.code === sizeCode) ? sizeCode : sizes[0]?.code ?? ''
  const laserValue = laserChoices.includes(laserSource) ? laserSource : laserChoices[0] ?? 'IPG'
  const bevelValue = bevelChoices.includes(bevelHead) ? bevelHead : bevelChoices[0] ?? 'None'
  const powerValue = powerChoices.includes(machinePower) ? machinePower : powerChoices[0] ?? '20kW'

  return (
    <div className="cla-page-canvas min-h-screen">
      <DealerBrandHeader user={user} eyebrow={embed ? 'Embedded price check' : undefined} />

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8 space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-[#0A2E52]">Quick price check</h1>
          <p className="mt-1 text-sm text-gray-600">
            Compare the previous/next table size on the dealer sheet (same kW and laser), or step power on the same
            format — totals update when configuration changes.
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Neighbor mode</span>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              <button
                type="button"
                className={`px-3 py-1.5 text-sm rounded-md ${
                  neighborMode === 'format' ? 'bg-white shadow text-[#0A2E52] font-semibold' : 'text-gray-600'
                }`}
                onClick={() => setNeighborMode('format')}
              >
                Table size ±1
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-sm rounded-md ${
                  neighborMode === 'power' ? 'bg-white shadow text-[#0A2E52] font-semibold' : 'text-gray-600'
                }`}
                onClick={() => setNeighborMode('power')}
              >
                Power ±step
              </button>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">Machine line</span>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-[#0A2E52]"
              value={familyValue}
              onChange={(e) => setFamily(e.target.value)}
            >
              {catalog.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Table size</span>
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 min-h-[88px]">
                <TableSizeSlider
                  sizes={sizes}
                  valueCode={sizeValue}
                  disabled={!sizes.length}
                  onChange={setSize}
                />
              </div>
            </div>

            <div className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Power</span>
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 min-h-[88px]">
                <PowerSlider
                  options={powerChoices}
                  value={powerValue}
                  disabled={!machineModel || !powerChoices.length}
                  onChange={(power) => setForm((prev) => constrain(catalog, { ...prev, machinePower: power }))}
                />
              </div>
            </div>
          </div>

          <fieldset disabled={!machineModel} className="grid sm:grid-cols-2 gap-4 min-w-0">
            <label className="block space-y-1 min-w-0">
              <span className="text-xs font-medium text-gray-600">Laser</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-[#0A2E52]"
                value={laserValue}
                onChange={(e) =>
                  setForm((prev) => constrain(catalog, { ...prev, laserSource: e.target.value }))
                }
              >
                {laserChoices.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 min-w-0">
              <span className="text-xs font-medium text-gray-600">Cutting head</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-[#0A2E52]"
                value={bevelValue}
                onChange={(e) =>
                  setForm((prev) =>
                    constrain(catalog, {
                      ...prev,
                      bevelHead: e.target.value as MachineOption['bevelHead'],
                    })
                  )
                }
              >
                {bevelChoices.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 space-y-2">
            <p className="text-sm text-gray-700 leading-relaxed">
              <span className="font-medium text-[#0A2E52]">Sheet configuration</span>
              {machineModel ? (
                <>
                  {' '}
                  — <span>{machineModel}</span>
                  <span className="text-gray-500"> · </span>
                  <span>{machinePower}</span>
                  <span className="text-gray-500"> · </span>
                  <span>{laserSource}</span>
                  <span className="text-gray-500"> · </span>
                  <span>{bevelHead}</span>
                </>
              ) : (
                <span className="text-gray-500"> — Pick a machine and size</span>
              )}
            </p>
            {(loading || error) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {loading && <span className="text-gray-500 tabular-nums">Updating…</span>}
                {error && <span className="text-red-600">{error}</span>}
              </div>
            )}
          </div>
        </section>

        {result && (
          <section className="space-y-3">
            <p className="text-xs text-gray-500">{result.disclaimer}</p>
            {result.mode === 'format' && (
              <p className="text-xs text-gray-500">
                Table-size neighbors follow the Feb 2026 sheet model order (numeric size codes), not table area. A
                &quot;next&quot; size can cost less — e.g. 25.0 × 3.0 m vs 24.0 × 3.5 m.
              </p>
            )}
            <div className="grid md:grid-cols-3 gap-4 items-stretch">
              <SlotCard slot={result.down} emphasis="down" neighborMode={result.mode} />
              <SlotCard slot={result.target} emphasis="target" neighborMode={result.mode} />
              <SlotCard slot={result.up} emphasis="up" neighborMode={result.mode} />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
