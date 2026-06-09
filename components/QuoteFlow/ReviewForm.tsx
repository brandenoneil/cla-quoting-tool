'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import MachineCatalogFields from '@/components/MachineCatalogFields'
import { lookupExactPrice, parseKw } from '@/lib/pricingTable'
import { hasExactSheetRow } from '@/lib/priceCheckNeighbors'
import type { PriceCheckMachineOptionEnriched } from '@/lib/priceCheckClient'
import { resolveSheetModel } from '@/lib/priceCheckClient'
import {
  constrainCatalogSelection,
  inferCatalogSelection,
  matchModelToCatalog,
  pickDefaultSize,
  type CatalogSelectionDraft,
} from '@/lib/priceCheckFormHelpers'
import { getReviewPricingWarnings, type PricingWarning } from '@/lib/sheetPricingWarnings'
import {
  canonicalLaserSource,
  coerceBevelForModel,
  coerceLaserSourceForModel,
  coercePowerForModel,
  LASER_SOURCE_LABELS,
  getBevelUiOptions,
  getAllowedLaserSources,
  getAllowedPowerLabels,
  parseBevelFromIntake,
} from '@/lib/machineConstraints'
import {
  coerceSmartOptionsForModel,
  getAllowedSmartOptions,
  isAutomationAllowed,
} from '@/lib/productRules'
import type { QuoteFormData, MachineOption } from '@/types'

interface Props {
  initialData: Partial<QuoteFormData>
  intakeData?: Record<string, any>
  dealId?: string
  isDealer?: boolean
  onSubmit: (data: QuoteFormData) => void
}

const POWER_OPTIONS = ['3kW', '6kW', '10kW', '12kW', '15kW', '20kW', '25kW', '30kW', '40kW', '50kW', '60kW']
const WARRANTY_OPTIONS = ['None', '+1 Year ($18K)', '+2 Years ($32K)', '+3 Years ($45K)']
const OPTION_LABELS = ['Option A', 'Option B', 'Option C'] as const

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// ─── Build a blank machine option ────────────────────────────────────────────
function blankMachine(label: string, overrides: Partial<MachineOption> = {}): MachineOption {
  return {
    id: `machine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    machineModel: '',
    machinePower: '6kW',
    laserSource: 'IPG',
    bevelHead: 'No',
    smartMix: false,
    smartChanger: false,
    smartGrease: false,
    smartDoor: false,
    smartRaster: false,
    smartSetUp: false,
    automation: 'None',
    pistonLift: false,
    ulCertification: false,
    cadCamSoftware: false,
    sideLoad: false,
    trainingDays: 0,
    extendedWarranty: 'None',
    notes: '',
    ...overrides,
  }
}

// ─── Auto-check options from AI intake notes ──────────────────────────────────
function autoCheckFromIntake(intakeData: Record<string, any>): Partial<MachineOption> {
  const notes = (intakeData.notes || '').toLowerCase()

  const automation: MachineOption['automation'] =
    notes.includes('with tower') ? 'With Tower'
    : notes.includes('no tower') && notes.includes('inline') ? 'Inline No Tower'
    : notes.includes('no tower') ? 'No Tower'
    : notes.includes('automation') || notes.includes('smart flow') ? 'No Tower'
    : 'None'

  const model = intakeData.model || ''

  return {
    machineModel: model,
    machinePower: intakeData.power || '6kW',
    // Do not force back to sheet defaults here; preserve user/AI laser intent.
    laserSource: canonicalLaserSource(intakeData.laser),
    bevelHead: coerceBevelForModel(parseBevelFromIntake(intakeData.bevel, model), model),
    smartMix: notes.includes('smart mix') || notes.includes('gas mix'),
    smartChanger: notes.includes('smart changer') || notes.includes('nozzle change'),
    smartGrease: notes.includes('smart grease') || notes.includes('greasing'),
    smartDoor: notes.includes('smart door') || notes.includes('side door'),
    smartRaster: notes.includes('smart raster') || notes.includes('relief marking'),
    smartSetUp: notes.includes('smart set') || notes.includes('automation predisposition'),
    automation,
    pistonLift: notes.includes('piston lift') || notes.includes('piston'),
    ulCertification: notes.includes('ul cert') || notes.includes(' ul '),
    cadCamSoftware: notes.includes('lantek') || notes.includes('sigmanast') || notes.includes('cad/cam'),
    sideLoad: notes.includes('side load'),
    trainingDays: Number(intakeData.training_days) || 0,
    extendedWarranty: intakeData.warranty || 'None',
  }
}

// ─── Pricing warning component ────────────────────────────────────────────────
function PricePreview({ model, power, laser }: { model: string; power: string; laser: string }) {
  const kw = parseKw(power)
  const exact = model ? lookupExactPrice(model, laser, kw) : null
  const onSheet = model ? hasExactSheetRow(model, laser, kw) : false

  if (!model) return null

  if (!onSheet || !exact) {
    return (
      <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-lg">
        <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">No current pricing for this configuration</p>
          <p className="text-xs text-amber-700 mt-0.5">
            We don&apos;t have current pricing for this configuration. You can continue — machine base pricing will be TBD.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 px-4 py-2.5 bg-[#E6F1FB] rounded-lg border border-blue-200">
      <p className="text-xs text-gray-500">List price (machine base)</p>
      <p className="text-base font-bold text-[#0A2E52]">{fmt(exact.list)}</p>
    </div>
  )
}

function coerceMachineFields(merged: MachineOption): MachineOption {
  merged.laserSource = coerceLaserSourceForModel(merged.laserSource, merged.machineModel)
  merged.machinePower = coercePowerForModel(merged.machinePower, merged.machineModel, merged.laserSource)
  merged.bevelHead = coerceBevelForModel(merged.bevelHead, merged.machineModel)
  return { ...merged, ...coerceSmartOptionsForModel(merged) }
}

function buildMachinesFromIntake(
  intakeData: Record<string, any>,
  initialData: Partial<QuoteFormData>
): MachineOption[] {
  if (initialData.machines?.length) {
    return initialData.machines.map((m) => coerceMachineFields({ ...m }))
  }

  const intakeMachines = intakeData.machines as Record<string, unknown>[] | undefined
  if (Array.isArray(intakeMachines) && intakeMachines.length > 0) {
    return intakeMachines.slice(0, 3).map((raw, i) =>
      coerceMachineFields(blankMachine(OPTION_LABELS[i], autoCheckFromIntake(raw)))
    )
  }

  return [coerceMachineFields(blankMachine('Option A', autoCheckFromIntake(intakeData)))]
}

function PricingWarningsBanner({ warnings }: { warnings: PricingWarning[] }) {
  if (warnings.length === 0) return null

  const uniqueMessages = Array.from(new Set(warnings.map((w) => w.message)))

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-2"
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            No current pricing for this configuration
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Your selections are accepted. Machine base pricing will be TBD until a list price is confirmed.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
            {uniqueMessages.map((message) => (
              <li key={message} className="flex gap-2">
                <span className="text-amber-500 flex-shrink-0">•</span>
                <span>{message}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReviewForm({ initialData, intakeData = {}, dealId, isDealer = false, onSubmit }: Props) {
  // ── Customer state ──────────────────────────────────────────────────────────
  const [company, setCompany] = useState(initialData.company || '')
  const [contactName, setContactName] = useState(initialData.contactName || '')
  const [contactEmail, setContactEmail] = useState(initialData.contactEmail || '')
  const [contactPhone, setContactPhone] = useState(initialData.contactPhone || '')
  const [fetchingContact, setFetchingContact] = useState(false)

  // ── Machine tabs state ──────────────────────────────────────────────────────
  const [machines, setMachines] = useState<MachineOption[]>(() =>
    buildMachinesFromIntake(intakeData, initialData)
  )
  const [activeTab, setActiveTab] = useState(0)
  const [priceCheckCatalog, setPriceCheckCatalog] = useState<PriceCheckMachineOptionEnriched[]>([])
  const [customModelById, setCustomModelById] = useState<Record<string, boolean>>({})

  // Keep machines in sync if intakeData arrives after mount (streaming)
  useEffect(() => {
    if (Object.keys(intakeData).length === 0) return
    setMachines(buildMachinesFromIntake(intakeData, {}))
  }, [JSON.stringify(intakeData)])

  useEffect(() => {
    let cancelled = false
    fetch('/api/price-check/catalog')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.machines) setPriceCheckCatalog(data.machines)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!priceCheckCatalog.length) return
    setCustomModelById((prev) => {
      const next = { ...prev }
      for (const machine of machines) {
        if (next[machine.id] !== undefined) continue
        next[machine.id] =
          !!machine.machineModel.trim() && !matchModelToCatalog(machine.machineModel, priceCheckCatalog)
      }
      return next
    })
  }, [priceCheckCatalog, machines])

  // ── Machine helpers ─────────────────────────────────────────────────────────
  function updateMachine(idx: number, patch: Partial<MachineOption>) {
    setMachines((prev) => {
      const next = [...prev]
      const merged = coerceMachineFields({ ...next[idx], ...patch })
      next[idx] = merged
      return next
    })
  }

  const applyCatalogSelection = useCallback(
    (idx: number, draft: CatalogSelectionDraft) => {
      if (!priceCheckCatalog.length) return
      const constrained = constrainCatalogSelection(priceCheckCatalog, draft)
      const machineModel = resolveSheetModel(
        priceCheckCatalog,
        constrained.familyId,
        constrained.sizeCode
      )
      updateMachine(idx, {
        machineModel,
        machinePower: constrained.machinePower,
        laserSource: constrained.laserSource,
        bevelHead: constrained.bevelHead,
      })
    },
    [priceCheckCatalog]
  )

  function addMachine() {
    if (machines.length >= 3) return
    const label = OPTION_LABELS[machines.length]
    setMachines((prev) => [...prev, blankMachine(label)])
    setActiveTab(machines.length)
  }

  // Duplicate the current machine tab with every available option checked
  function addFullyLoadedOption() {
    if (machines.length >= 3) return
    const source = machines[activeTab]
    const label = OPTION_LABELS[machines.length]
    const fullyLoaded = coerceMachineFields({
      ...source,
      id: `machine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      smartMix: true,
      smartChanger: true,
      smartGrease: true,
      smartDoor: true,
      smartRaster: true,
      smartSetUp: true,
      automation: isAutomationAllowed(source.machineModel) ? 'With Tower' : 'None',
      // All additional equipment on
      pistonLift: true,
      ulCertification: true,
      cadCamSoftware: true,
      sideLoad: true,
      // Upgrade warranty to 3yr if not already higher
      extendedWarranty: (
        source.extendedWarranty.includes('3') ? source.extendedWarranty : '+3 Years ($45K)'
      ),
    })
    setMachines((prev) => [...prev, fullyLoaded])
    setActiveTab(machines.length)
  }

  function removeMachine(idx: number) {
    if (machines.length <= 1) return
    setMachines((prev) => {
      const next = prev.filter((_, i) => i !== idx).map((m, i) => ({ ...m, label: OPTION_LABELS[i] }))
      return next
    })
    setActiveTab((t) => Math.min(t, machines.length - 2))
  }

  // ── Per-tab document extraction ─────────────────────────────────────────────
  const [extractingTab, setExtractingTab] = useState<number | null>(null)
  const [extractErrors, setExtractErrors] = useState<Record<number, string>>({})
  const [extractSuccess, setExtractSuccess] = useState<Record<number, string>>({})
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  async function handleTabFileUpload(idx: number, file: File) {
    setExtractingTab(idx)
    setExtractErrors((e) => ({ ...e, [idx]: '' }))
    setExtractSuccess((s) => ({ ...s, [idx]: '' }))

    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/extract', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Extraction failed')
      }

      const q = data.quoteData as Record<string, any>
      const patch = autoCheckFromIntake(q)
      updateMachine(idx, patch)
      setExtractSuccess((s) => ({ ...s, [idx]: `Extracted: ${q.model || '?'} ${q.power || ''} ${q.laser || ''}`.trim() }))
    } catch (err: any) {
      setExtractErrors((e) => ({ ...e, [idx]: err.message || 'Could not extract data from this file.' }))
    } finally {
      setExtractingTab(null)
    }
  }

  function handleDrop(idx: number, e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleTabFileUpload(idx, file)
  }

  // ── Contact fetch ───────────────────────────────────────────────────────────
  async function fetchContactFromDeal() {
    if (!dealId) return
    setFetchingContact(true)
    try {
      const res = await fetch(`/api/deals/search?q=&dealId=${dealId}`)
      const data = await res.json()
      const deal = data.deals?.find((d: any) => d.id === dealId) ?? data.deals?.[0]
      if (deal?.contact?.properties) {
        const p = deal.contact.properties
        const name = [p.firstname, p.lastname].filter(Boolean).join(' ')
        if (name) setContactName(name)
        if (p.email) setContactEmail(p.email)
        if (p.phone) setContactPhone(p.phone)
      }
    } catch {}
    finally { setFetchingContact(false) }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      company,
      contactName,
      contactEmail,
      contactPhone,
      machines,
      notes: machines.map((m) => m.notes).filter(Boolean).join('\n'),
    })
  }

  // ── Shared styles ───────────────────────────────────────────────────────────
  const inputCls = 'cla-input py-2.5'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionHeadCls = 'text-xs font-bold text-[#0A2E52] uppercase tracking-widest mb-3 pb-1.5 border-b border-gray-200'

  const m = machines[activeTab]

  const contactMissing = !contactName && !contactEmail

  const allowedLasers = getAllowedLaserSources(m.machineModel)
  const bevelUiOptions = getBevelUiOptions(m.machineModel)
  const sheetPowers = getAllowedPowerLabels(m.machineModel, m.laserSource)
  const powerOptions = sheetPowers.length > 0 ? sheetPowers : POWER_OPTIONS
  const powerSelectOptions =
    m.machinePower && !powerOptions.includes(m.machinePower)
      ? [...powerOptions, m.machinePower]
      : powerOptions
  const allowedSmart = getAllowedSmartOptions(m.machineModel)
  const automationAllowed = isAutomationAllowed(m.machineModel)

  const pricingWarnings = useMemo(
    () => getReviewPricingWarnings(m),
    [m.machineModel, m.machinePower, m.laserSource]
  )
  const powerPricingWarning = pricingWarnings.find((w) => w.field === 'power')
  const useCatalogPicker =
    priceCheckCatalog.length > 0 && !customModelById[m.id]
  const catalogDraft = useMemo(
    () =>
      priceCheckCatalog.length
        ? inferCatalogSelection(
            m.machineModel,
            m.machinePower,
            m.laserSource,
            m.bevelHead,
            priceCheckCatalog
          )
        : null,
    [m.machineModel, m.machinePower, m.laserSource, m.bevelHead, priceCheckCatalog]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ══════════════════════════════════════
          CUSTOMER
      ══════════════════════════════════════ */}
      <div>
        <h3 className="text-sm font-semibold text-[#0A2E52] uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">
          Customer
        </h3>

        {contactMissing && dealId && (
          <div className="mb-4 flex items-center justify-between gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <span className="text-amber-700">
              No contact found on this deal —{' '}
              <button type="button" onClick={fetchContactFromDeal} disabled={fetchingContact}
                className="underline font-medium hover:text-amber-900 disabled:opacity-50">
                {fetchingContact ? 'fetching…' : 'try fetching from HubSpot'}
              </button>
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Company Name *</label>
            <input required type="text" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Contact Name *</label>
            <input required type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contact Email *</label>
            <input required type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contact Phone</label>
            <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          MACHINE OPTIONS (TABS)
      ══════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-0">
          <h3 className="text-sm font-semibold text-[#0A2E52] uppercase tracking-wide">
            Machine Options
          </h3>
          <span className="text-xs text-gray-400">Up to 3 machines per proposal</span>
        </div>

        {/* Tab bar */}
        <div className="flex items-end gap-0 border-b border-gray-200 mt-3">
          {machines.map((mach, idx) => (
            <div key={mach.id} className="relative group">
              <button
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors pr-7 ${
                  activeTab === idx
                    ? 'border-[#1B6FC8] text-[#1B6FC8] bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="font-semibold">{mach.label}</span>
                {mach.machineModel && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal hidden sm:inline">
                    — {mach.machineModel}
                  </span>
                )}
              </button>
              {/* Remove button (not for first tab) */}
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => removeMachine(idx)}
                  className="absolute right-1 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-0.5 rounded"
                  title="Remove this option"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {/* Add option / Fully Loaded buttons */}
          {machines.length < 3 && (
            <div className="flex items-end gap-0 ml-1">
              <button
                type="button"
                onClick={addMachine}
                className="px-3 py-2 text-sm text-gray-400 hover:text-[#1B6FC8] border-b-2 border-transparent -mb-px flex items-center gap-1 transition-colors"
                title="Add a blank machine option"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Option
              </button>
              <button
                type="button"
                onClick={addFullyLoadedOption}
                className="px-3 py-2 text-sm text-amber-500 hover:text-amber-600 border-b-2 border-transparent -mb-px flex items-center gap-1 transition-colors"
                title={`Duplicate ${machines[activeTab]?.label || 'this option'} with all SMART options, automation, and extras checked`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Fully Loaded
              </button>
            </div>
          )}
        </div>

        {/* ── Active machine tab content ── */}
        <div className="border border-t-0 border-gray-200 rounded-b-xl p-5 space-y-6">

          <PricingWarningsBanner warnings={pricingWarnings} />

          {/* ── Document upload for this tab ── */}
          <div
            onDrop={(e) => handleDrop(activeTab, e)}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRefs.current[activeTab]?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-[#1B6FC8] transition-colors cursor-pointer select-none"
          >
            <input
              ref={(el) => { fileInputRefs.current[activeTab] = el }}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleTabFileUpload(activeTab, f)
                // reset so same file can be re-uploaded if needed
                e.target.value = ''
              }}
            />
            {extractingTab === activeTab ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
                Extracting from document…
              </div>
            ) : extractSuccess[activeTab] ? (
              <div className="flex items-center justify-center gap-2 text-sm text-green-700 font-medium">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {extractSuccess[activeTab]}
                <span className="text-gray-400 font-normal">— click to re-upload</span>
              </div>
            ) : (
              <div className="text-sm text-gray-400">
                <span className="font-medium text-[#1B6FC8]">Upload quote request</span>
                {' '}or drag &amp; drop
                <span className="ml-1 text-gray-300">·</span>
                <span className="ml-1">PDF, DOCX, TXT</span>
              </div>
            )}
            {extractErrors[activeTab] && (
              <p className="text-xs text-red-500 mt-1.5">{extractErrors[activeTab]}</p>
            )}
          </div>

          {/* ── Machine Basics ── */}
          <div>
            <p className={sectionHeadCls}>Machine Basics</p>
            <div className="grid grid-cols-2 gap-4">
              {useCatalogPicker && catalogDraft ? (
                <div className="col-span-2 space-y-3">
                  <MachineCatalogFields
                    catalog={priceCheckCatalog}
                    familyId={catalogDraft.familyId}
                    sizeCode={catalogDraft.sizeCode}
                    machinePower={m.machinePower}
                    laserSource={m.laserSource}
                    onFamilyChange={(familyId) => {
                      const machine = priceCheckCatalog.find((entry) => entry.id === familyId)
                      applyCatalogSelection(activeTab, {
                        ...catalogDraft,
                        familyId,
                        sizeCode: pickDefaultSize(machine),
                      })
                    }}
                    onSizeChange={(sizeCode) =>
                      applyCatalogSelection(activeTab, { ...catalogDraft, sizeCode })
                    }
                    onPowerChange={(machinePower) =>
                      applyCatalogSelection(activeTab, { ...catalogDraft, machinePower })
                    }
                  />
                  {!isDealer && (
                    <PricePreview model={m.machineModel} power={m.machinePower} laser={m.laserSource} />
                  )}
                  {powerPricingWarning && (
                    <p className="text-xs text-amber-700">{powerPricingWarning.message}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setCustomModelById((prev) => ({ ...prev, [m.id]: true }))}
                    className="text-xs text-gray-500 hover:text-[#1B6FC8] underline"
                  >
                    Enter model manually
                  </button>
                </div>
              ) : (
                <>
                  <div className="col-span-2">
                    <label className={labelCls}>Machine Model *</label>
                    <input
                      required
                      type="text"
                      value={m.machineModel}
                      onChange={(e) => updateMachine(activeTab, { machineModel: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. FIBER Fast 4020, FIBER HD 16030, PLUS Bevel 6525"
                    />
                    {!isDealer && (
                      <PricePreview model={m.machineModel} power={m.machinePower} laser={m.laserSource} />
                    )}
                    {priceCheckCatalog.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCustomModelById((prev) => ({ ...prev, [m.id]: false }))}
                        className="mt-2 text-xs text-gray-500 hover:text-[#1B6FC8] underline"
                      >
                        Use catalog picker
                      </button>
                    )}
                  </div>

                  <div>
                    <label className={labelCls}>Power Rating</label>
                    <select
                      value={m.machinePower}
                      onChange={(e) => updateMachine(activeTab, { machinePower: e.target.value })}
                      className={`${inputCls}${powerPricingWarning ? ' border-amber-400 ring-1 ring-amber-200' : ''}`}
                    >
                      {powerSelectOptions.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    {powerPricingWarning && (
                      <p className="text-xs text-amber-700 mt-1.5">{powerPricingWarning.message}</p>
                    )}
                  </div>
                </>
              )}

              <div className={useCatalogPicker ? 'col-span-2' : ''}>
                <label className={labelCls}>Laser Source</label>
                <div className="flex gap-2 flex-wrap pt-1">
                  {LASER_SOURCE_LABELS.map((laser) => {
                    const laserDisabled = !allowedLasers.includes(laser)
                    return (
                      <label
                        key={laser}
                        className={`flex items-center gap-1.5 ${
                          laserDisabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`laser-${m.id}`}
                          value={laser}
                          disabled={laserDisabled}
                          checked={m.laserSource === laser}
                          onChange={() => {
                            if (useCatalogPicker && catalogDraft) {
                              applyCatalogSelection(activeTab, { ...catalogDraft, laserSource: laser })
                            } else {
                              updateMachine(activeTab, { laserSource: laser })
                            }
                          }}
                          className="accent-[#1B6FC8] disabled:cursor-not-allowed"
                        />
                        <span className={`text-sm ${laserDisabled ? 'text-gray-400' : 'text-gray-700'}`}>
                          {laser}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {!allowedLasers.includes(canonicalLaserSource(m.laserSource)) && (
                  <p className="text-xs text-amber-700 mt-2">
                    Selected laser source is not priced for this exact model. You can continue,
                    but pricing may require manual confirmation.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Bevel ── */}
          <div>
            <p className={sectionHeadCls}>Bevel</p>
            <div className="flex flex-wrap gap-4">
              {([
                { value: 'No' as const, sub: 'Standard flat cutting' },
                { value: 'Yes' as const, sub: 'Bevel cutting head' },
              ]).map(({ value, sub }) => {
                const disabled = value === 'Yes' ? bevelUiOptions.yesDisabled : bevelUiOptions.noDisabled
                return (
                  <label
                    key={value}
                    className={`flex items-start gap-2.5 border rounded-lg px-4 py-3 flex-1 min-w-[160px] transition-colors ${
                      disabled
                        ? 'cursor-not-allowed opacity-45 border-gray-100 bg-gray-50'
                        : `cursor-pointer ${
                            m.bevelHead === value ? 'border-[#1B6FC8] bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                          }`
                    }`}
                  >
                    <input
                      type="radio"
                      name={`bevel-${m.id}`}
                      value={value}
                      disabled={disabled}
                      checked={m.bevelHead === value}
                      onChange={() => updateMachine(activeTab, { bevelHead: value })}
                      className="accent-[#1B6FC8] mt-0.5 disabled:cursor-not-allowed"
                    />
                    <div>
                      <div className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>
                        {value}
                      </div>
                      <div className={`text-xs ${disabled ? 'text-gray-300' : 'text-gray-500'}`}>{sub}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── SMART Options ── */}
          <div>
            <p className={sectionHeadCls}>SMART Options</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { key: 'smartMix',     label: 'SMART Mix',     sub: 'Automatic Gas Mix System' },
                { key: 'smartChanger', label: 'SMART Changer', sub: 'Automatic Nozzle Change' },
                { key: 'smartGrease',  label: 'SMART Grease',  sub: 'Automatic Greasing Point' },
                { key: 'smartDoor',    label: 'SMART Door',    sub: 'Additional Side Door (3015–6025)' },
                { key: 'smartRaster',  label: 'SMART Raster',  sub: '3D Relief Marking' },
                { key: 'smartSetUp',   label: 'SMART Set Up',  sub: 'Predisposition for Automation' },
              ].map(({ key, label, sub }) => (
                <CheckOption
                  key={key}
                  checked={m[key as keyof MachineOption] as boolean}
                  label={label}
                  sub={sub}
                  disabled={!allowedSmart[key as keyof typeof allowedSmart]}
                  onChange={(v) => updateMachine(activeTab, { [key]: v })}
                />
              ))}
            </div>
          </div>

          {/* ── Automation ── */}
          <div>
            <p className={sectionHeadCls}>Automation</p>
            {!automationAllowed && (
              <p className="text-xs text-amber-700 mb-2">Load/unload automation is not available for this machine family.</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: 'None',            label: 'None',                 sub: 'No automation' },
                { value: 'Inline No Tower', label: 'Inline',               sub: 'Inline, no tower' },
                { value: 'No Tower',        label: 'Load/Unload',          sub: 'SMART Flow, no tower' },
                { value: 'With Tower',      label: 'Load/Unload + Tower',  sub: 'SMART Flow 90° tower' },
              ].map(({ value, label, sub }) => {
                const disabled = value !== 'None' && !automationAllowed
                return (
                <label key={value} className={`flex flex-col gap-0.5 border rounded-lg px-3 py-2.5 transition-colors ${
                  disabled ? 'cursor-not-allowed opacity-45 border-gray-100 bg-gray-50' :
                  m.automation === value ? 'border-[#1B6FC8] bg-blue-50 cursor-pointer' : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`automation-${m.id}`}
                      value={value}
                      disabled={disabled}
                      checked={m.automation === value}
                      onChange={() => updateMachine(activeTab, { automation: value as MachineOption['automation'] })}
                      className="accent-[#1B6FC8] disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-medium text-gray-800">{label}</span>
                  </div>
                  <span className="text-xs text-gray-500 pl-5">{sub}</span>
                </label>
              )})}
            </div>
          </div>

          {/* ── Additional Equipment ── */}
          <div>
            <p className={sectionHeadCls}>Additional Equipment</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { key: 'pistonLift',      label: 'Piston Lift',                sub: 'Hydraulic sheet lifter' },
                { key: 'ulCertification', label: 'UL Certification',           sub: 'US electrical safety cert' },
                { key: 'cadCamSoftware',  label: 'CAD/CAM Software',           sub: 'Lantek or SigmaNAST 2D/3D' },
                { key: 'sideLoad',        label: 'Side Load Configuration',    sub: 'Side-access sheet loading' },
              ].map(({ key, label, sub }) => (
                <CheckOption
                  key={key}
                  checked={m[key as keyof MachineOption] as boolean}
                  label={label}
                  sub={sub}
                  onChange={(v) => updateMachine(activeTab, { [key]: v })}
                />
              ))}
            </div>
          </div>

          {/* ── Commercial Terms ── */}
          <div>
            <p className={sectionHeadCls}>Commercial Terms</p>
            <p className="text-xs text-gray-400 mb-3">
              Installation and delivery are standard on every machine.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Additional Training Days</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={20}
                    value={m.trainingDays}
                    onChange={(e) => updateMachine(activeTab, { trainingDays: parseInt(e.target.value) || 0 })}
                    className={inputCls + ' w-24'}
                  />
                  <span className="text-sm text-gray-500">× $2,500/day</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Extended Warranty</label>
                <select
                  value={m.extendedWarranty}
                  onChange={(e) => updateMachine(activeTab, { extendedWarranty: e.target.value })}
                  className={inputCls}
                >
                  {WARRANTY_OPTIONS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Notes / Special Requirements</label>
                <textarea
                  value={m.notes}
                  onChange={(e) => updateMachine(activeTab, { notes: e.target.value })}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  placeholder="Financing, custom configurations, special requests…"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Machine count indicator */}
        {machines.length > 1 && (
          <p className="mt-2 text-xs text-gray-400 text-center">
            {machines.length} machine options — all will appear in the proposal
          </p>
        )}
      </div>

      <button
        type="submit"
        className="cla-btn-primary w-full py-4 text-base"
      >
        Generate Proposal →
      </button>
    </form>
  )
}

// ─── Reusable checkbox option ─────────────────────────────────────────────────
function CheckOption({
  checked,
  label,
  sub,
  disabled = false,
  onChange,
}: {
  checked: boolean
  label: string
  sub: string
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-45 border-gray-100 bg-gray-50'
          : `cursor-pointer ${
              checked ? 'border-[#1B6FC8] bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[#1B6FC8] mt-0.5 w-4 h-4 flex-shrink-0 disabled:cursor-not-allowed"
      />
      <div>
        <div className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>{label}</div>
        <div className={`text-xs ${disabled ? 'text-gray-300' : 'text-gray-500'}`}>{sub}</div>
      </div>
    </label>
  )
}
