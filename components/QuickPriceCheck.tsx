'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DealerBrandHeader from '@/components/DealerBrandHeader'
import MachineCatalogFields from '@/components/MachineCatalogFields'
import type { PriceCheckMachineOptionEnriched } from '@/lib/priceCheckClient'
import { resolveSheetModel, tableSizeLabelFromSheetModel } from '@/lib/priceCheckClient'
import {
  BEVEL_UI_FALLBACK,
  constrainCatalogSelection,
  initialPriceCheckForm,
  LASER_FALLBACK,
  pickDefaultSize,
  type CatalogSelectionDraft,
} from '@/lib/priceCheckFormHelpers'
import { savePriceCheckPrefill } from '@/lib/priceCheckPrefill'
import {
  getBevelUiOptions,
  type BevelChoice,
} from '@/lib/machineConstraints'

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

function fmtUsd(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function modelFamilyName(model: string): string {
  return model.replace(/\s\d{4,5}$/, '').trim()
}

function ConfigHighlight({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight: boolean
}) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span
        className={
          highlight
            ? 'text-sm font-bold text-[#0A2E52] bg-[#E6F1FB] border border-[#1B6FC8]/35 rounded-md px-2 py-0.5 tabular-nums'
            : 'text-sm text-gray-600 tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  )
}

function NeighborModeToggle({
  value,
  onChange,
}: {
  value: NeighborMode
  onChange: (mode: NeighborMode) => void
}) {
  return (
    <div className="flex flex-wrap gap-3 items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Compare by</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {value === 'format'
            ? 'Pricing cards show the previous and next table size on the sheet (same power & laser).'
            : 'Pricing cards show lower and higher power on the same machine format.'}
        </p>
      </div>
      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 shrink-0">
        <button
          type="button"
          className={`px-3 py-1.5 text-sm rounded-md ${
            value === 'format' ? 'bg-white shadow text-[#0A2E52] font-semibold' : 'text-gray-600'
          }`}
          onClick={() => onChange('format')}
        >
          Table size ±1
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 text-sm rounded-md ${
            value === 'power' ? 'bg-white shadow text-[#0A2E52] font-semibold' : 'text-gray-600'
          }`}
          onClick={() => onChange('power')}
        >
          Power ±step
        </button>
      </div>
    </div>
  )
}

function SlotCard({
  slot,
  emphasis,
  neighborMode,
  targetSlot,
}: {
  slot: PriceCheckSlot | null
  emphasis: 'down' | 'target' | 'up'
  neighborMode: NeighborMode
  targetSlot?: PriceCheckSlot
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

  const priceDelta =
    slot && targetSlot && emphasis !== 'target'
      ? slot.totalPrice - targetSlot.totalPrice
      : null

  if (!slot) {
    return (
      <div className={`rounded-xl border ${border} p-4 opacity-70`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
        <p className="mt-6 text-sm text-gray-400">No neighbor on the sheet for this mode.</p>
      </div>
    )
  }

  const laserShort = slot.laserLabel.replace(/\s+Photonics/i, '').trim() || slot.laserLabel
  const highlightTable = neighborMode === 'format'
  const highlightPower = neighborMode === 'power'

  return (
    <div className={`rounded-xl border ${border} p-4 flex flex-col min-h-[200px]`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-sm font-semibold text-[#0A2E52] leading-snug">{modelFamilyName(slot.model)}</p>

      <div className="mt-3 space-y-2 rounded-lg border border-gray-100 bg-white/70 px-3 py-2.5">
        <ConfigHighlight label="Table size" value={tableSize || '—'} highlight={highlightTable} />
        <ConfigHighlight label="Power" value={slot.power} highlight={highlightPower} />
        <ConfigHighlight label="Laser" value={laserShort} highlight={false} />
      </div>

      <div className="mt-auto pt-4 space-y-1">
        <p className="text-2xl font-bold text-[#0A2E52]">{fmtUsd(slot.totalPrice)}</p>
        {priceDelta !== null && priceDelta !== 0 && (
          <p className={`text-xs font-semibold ${priceDelta > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {priceDelta > 0 ? '+' : '−'}
            {fmtUsd(Math.abs(priceDelta))} vs your configuration
          </p>
        )}
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
  const router = useRouter()
  const [form, setForm] = useState<CatalogSelectionDraft>(() => initialPriceCheckForm(catalog))

  useEffect(() => {
    if (catalog.length > 0) setForm(initialPriceCheckForm(catalog))
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

  const selectedSize = useMemo(
    () => selectedMachine?.sizes.find((s) => s.code === sizeCode),
    [selectedMachine, sizeCode]
  )

  const laserChoices = selectedSize?.allowedLasers.length ? selectedSize.allowedLasers : [...LASER_FALLBACK]
  const bevelUiOptions = getBevelUiOptions(selectedSize?.sheetModel ?? machineModel)
  const bevelUiChoices = BEVEL_UI_FALLBACK.filter(
    (v) => !(v === 'Yes' ? bevelUiOptions.yesDisabled : bevelUiOptions.noDisabled)
  )

  const setFamily = (id: string) => {
    const machine = catalog.find((m) => m.id === id)
    const nextSize = pickDefaultSize(machine)
    setForm((prev) => constrainCatalogSelection(catalog, { ...prev, familyId: id, sizeCode: nextSize }))
  }

  const setSize = (code: string) => {
    setForm((prev) => constrainCatalogSelection(catalog, { ...prev, sizeCode: code }))
  }

  function handleStartQuote() {
    if (!machineModel) return
    savePriceCheckPrefill({
      machineModel,
      machinePower,
      laserSource,
      bevelHead,
    })
    router.push('/dealer/quotes/new?from=price-check')
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

  const laserValue = laserChoices.includes(laserSource) ? laserSource : laserChoices[0] ?? 'IPG'
  const bevelUiValue = bevelHead
  const bevelUiSelectValue = bevelUiChoices.includes(bevelUiValue)
    ? bevelUiValue
    : bevelUiChoices[0] ?? 'No'

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
          <MachineCatalogFields
            catalog={catalog}
            familyId={familyId}
            sizeCode={sizeCode}
            machinePower={machinePower}
            laserSource={laserValue}
            onFamilyChange={setFamily}
            onSizeChange={setSize}
            onPowerChange={(power) =>
              setForm((prev) => constrainCatalogSelection(catalog, { ...prev, machinePower: power }))
            }
            showResolvedModel={false}
          />

          <fieldset disabled={!machineModel} className="grid sm:grid-cols-2 gap-4 min-w-0">
            <label className="block space-y-1 min-w-0">
              <span className="text-xs font-medium text-gray-600">Laser</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-[#0A2E52]"
                value={laserValue}
                onChange={(e) =>
                  setForm((prev) => constrainCatalogSelection(catalog, { ...prev, laserSource: e.target.value }))
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
              <span className="text-xs font-medium text-gray-600">Bevel</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-[#0A2E52]"
                value={bevelUiSelectValue}
                onChange={(e) =>
                  setForm((prev) =>
                    constrainCatalogSelection(catalog, {
                      ...prev,
                      bevelHead: e.target.value as BevelChoice,
                    })
                  )
                }
              >
                {bevelUiChoices.map((b) => (
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

        <section className="space-y-4">
          <NeighborModeToggle value={neighborMode} onChange={setNeighborMode} />

          {result && (
            <>
              <p className="text-xs text-gray-500">{result.disclaimer}</p>
              {result.mode === 'format' && (
                <p className="text-xs text-gray-500">
                  Table-size neighbors follow the catalog model order (numeric size codes), not table area. A
                  &quot;next&quot; size can cost less — e.g. 25.0 × 3.0 m vs 24.0 × 3.5 m.
                </p>
              )}
              <div className="grid md:grid-cols-3 gap-4 items-stretch">
                <SlotCard
                  slot={result.down}
                  emphasis="down"
                  neighborMode={result.mode}
                  targetSlot={result.target}
                />
                <SlotCard slot={result.target} emphasis="target" neighborMode={result.mode} />
                <SlotCard
                  slot={result.up}
                  emphasis="up"
                  neighborMode={result.mode}
                  targetSlot={result.target}
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleStartQuote}
                  className="cla-btn-primary px-6 py-3 text-sm w-full sm:w-auto"
                >
                  Start quote request with this configuration →
                </button>
              </div>
            </>
          )}

          {!result && loading && (
            <p className="text-sm text-gray-500 tabular-nums">Loading price comparison…</p>
          )}
        </section>
      </main>
    </div>
  )
}
