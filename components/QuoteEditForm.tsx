'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { lookupExactPrice, parseKw } from '@/lib/pricingTable'
import { hasExactSheetRow } from '@/lib/priceCheckNeighbors'
import {
  canonicalLaserSource,
  coerceBevelForModel,
  coerceLaserSourceForModel,
  coercePowerForModel,
  getAllowedPowerLabels,
  LASER_SOURCE_LABELS,
  getBevelUiOptions,
  getAllowedLaserSources,
  parseBevelFromIntake,
} from '@/lib/machineConstraints'
import {
  coerceSmartOptionsForModel,
  getAllowedSmartOptions,
  isAutomationAllowed,
} from '@/lib/productRules'
import type { LineItem, MachineOption } from '@/types'

interface QuoteData {
  id: string
  quoteNumber: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  machineModel: string
  machinePower: string
  laserSource: string
  bevelHead: string
  deliveryWeeks: number
  lineItemsJson: string
  subtotal: number
  discountAmount: number
  freight: number
  totalAmount: number
  notes: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const POWER_OPTIONS = ['3kW', '6kW', '10kW', '12kW', '15kW', '20kW', '25kW', '30kW', '40kW', '50kW', '60kW']
const WARRANTY_OPTIONS = ['None', '+1 Year ($18K)', '+2 Years ($32K)', '+3 Years ($45K)']
const OPTION_LABELS = ['Option A', 'Option B', 'Option C'] as const

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('en-US') }

// ─── Blank machine factory ────────────────────────────────────────────────────
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

// ─── Parse existing line items back into machine option flags ─────────────────
function lineItemsToMachine(items: LineItem[], quote: QuoteData): MachineOption {
  const descs = items.map(i => i.description.toLowerCase())
  const has = (kw: string) => descs.some(d => d.includes(kw.toLowerCase()))

  let automation: MachineOption['automation'] = 'None'
  if (has('with tower')) automation = 'With Tower'
  else if (has('inline')) automation = 'Inline No Tower'
  else if (has('no tower')) automation = 'No Tower'

  let bevelHead: MachineOption['bevelHead'] =
    (quote.bevelHead as MachineOption['bevelHead']) || 'No'
  if (has('bevel head') || has('plus bevel head') || has('basic bevel head')) bevelHead = 'Yes'

  let trainingDays = 0
  for (const item of items) {
    const m = item.description.match(/training.*?(\d+)/i)
    if (m) { trainingDays = parseInt(m[1]); break }
  }

  let extendedWarranty = 'None'
  if (has('3-year extended warranty')) extendedWarranty = '+3 Years ($45K)'
  else if (has('2-year extended warranty')) extendedWarranty = '+2 Years ($32K)'
  else if (has('1-year extended warranty')) extendedWarranty = '+1 Year ($18K)'

  return {
    id: 'edit-0',
    label: 'Option A',
    machineModel: quote.machineModel,
    machinePower: quote.machinePower,
    laserSource: coerceLaserSourceForModel(quote.laserSource, quote.machineModel),
    bevelHead: coerceBevelForModel(bevelHead, quote.machineModel),
    smartMix:        has('smart mix'),
    smartChanger:    has('smart changer'),
    smartGrease:     has('smart grease'),
    smartDoor:       has('smart door'),
    smartRaster:     has('smart raster'),
    smartSetUp:      has('smart set up'),
    automation,
    pistonLift:      has('piston lift'),
    ulCertification: has('ul certification'),
    cadCamSoftware:  has('cad/cam software'),
    sideLoad:        has('side load'),
    trainingDays,
    extendedWarranty,
    notes: quote.notes ?? '',
  }
}

// ─── Auto-fill from extracted document ───────────────────────────────────────
function autoCheckFromIntake(d: Record<string, any>): Partial<MachineOption> {
  const notes = (d.notes || '').toLowerCase()
  const automation: MachineOption['automation'] =
    notes.includes('with tower') ? 'With Tower'
    : notes.includes('no tower') && notes.includes('inline') ? 'Inline No Tower'
    : notes.includes('no tower') ? 'No Tower'
    : notes.includes('automation') || notes.includes('smart flow') ? 'No Tower'
    : 'None'
  const model = d.model || ''
  return {
    machineModel: model,
    machinePower: d.power || '6kW',
    laserSource: coerceLaserSourceForModel(canonicalLaserSource(d.laser), model),
    bevelHead: coerceBevelForModel(parseBevelFromIntake(d.bevel, model), model),
    smartMix:     notes.includes('smart mix')     || notes.includes('gas mix'),
    smartChanger: notes.includes('smart changer') || notes.includes('nozzle change'),
    smartGrease:  notes.includes('smart grease')  || notes.includes('greasing'),
    smartDoor:    notes.includes('smart door')    || notes.includes('side door'),
    smartRaster:  notes.includes('smart raster')  || notes.includes('relief marking'),
    smartSetUp:   notes.includes('smart set')     || notes.includes('automation predisposition'),
    automation,
    pistonLift:      notes.includes('piston lift') || notes.includes('piston'),
    ulCertification: notes.includes('ul cert')     || notes.includes(' ul '),
    cadCamSoftware:  notes.includes('lantek')      || notes.includes('sigmanast') || notes.includes('cad/cam'),
    sideLoad:        notes.includes('side load'),
    trainingDays:    Number(d.training_days) || 0,
    extendedWarranty: d.warranty || 'None',
  }
}

// ─── Price sheet preview ──────────────────────────────────────────────────────
function PricePreview({ model, power, laser }: { model: string; power: string; laser: string }) {
  const kw = parseKw(power)
  const price = model ? lookupExactPrice(model, laser, kw) : null
  const onSheet = model ? hasExactSheetRow(model, laser, kw) : false
  if (!model) return null
  if (!onSheet || !price) {
    return (
      <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-lg">
        <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">No current pricing on the Feb 2026 sheet</p>
          <p className="text-xs text-amber-700 mt-0.5">We don&apos;t have current pricing for this configuration. Machine base pricing will be TBD.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-3 px-4 py-2.5 bg-[#E6F1FB] rounded-lg border border-blue-200">
      <p className="text-xs text-gray-500">Feb 2026 list price (machine base)</p>
      <p className="text-base font-bold text-[#0A2E52]">{fmt(price.list)}</p>
    </div>
  )
}

function coerceMachineFields(merged: MachineOption): MachineOption {
  merged.laserSource = coerceLaserSourceForModel(merged.laserSource, merged.machineModel)
  merged.machinePower = coercePowerForModel(merged.machinePower, merged.machineModel, merged.laserSource)
  merged.bevelHead = coerceBevelForModel(merged.bevelHead, merged.machineModel)
  return { ...merged, ...coerceSmartOptionsForModel(merged) }
}

// ─── Checkbox option card ─────────────────────────────────────────────────────
function CheckOption({ checked, label, sub, disabled = false, onChange }: {
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
          : `cursor-pointer ${checked ? 'border-[#1B6FC8] bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`
      }`}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="accent-[#1B6FC8] mt-0.5 w-4 h-4 flex-shrink-0 disabled:cursor-not-allowed" />
      <div>
        <div className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>{label}</div>
        <div className={`text-xs ${disabled ? 'text-gray-300' : 'text-gray-500'}`}>{sub}</div>
      </div>
    </label>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function QuoteEditForm({ quote }: { quote: QuoteData }) {
  const router = useRouter()

  // ── Customer ─────────────────────────────────────────────────────────────────
  const [company, setCompany]           = useState(quote.company)
  const [contactName, setContactName]   = useState(quote.contactName)
  const [contactEmail, setContactEmail] = useState(quote.contactEmail)
  const [contactPhone, setContactPhone] = useState(quote.contactPhone ?? '')

  // ── Machine options (tabs) ────────────────────────────────────────────────────
  const [machines, setMachines] = useState<MachineOption[]>(() => {
    const parsedItems = JSON.parse(quote.lineItemsJson) as LineItem[]
    return [lineItemsToMachine(parsedItems, quote)]
  })
  const [activeTab, setActiveTab] = useState(0)

  // ── Line items ────────────────────────────────────────────────────────────────
  const [lineItems, setLineItems]         = useState<LineItem[]>(() => JSON.parse(quote.lineItemsJson))
  const [discountAmount, setDiscountAmount] = useState(quote.discountAmount)
  const [deliveryWeeks, setDeliveryWeeks]   = useState(quote.deliveryWeeks)

  // ── Document upload per tab ───────────────────────────────────────────────────
  const [extractingTab, setExtractingTab]   = useState<number | null>(null)
  const [extractErrors, setExtractErrors]   = useState<Record<number, string>>({})
  const [extractSuccess, setExtractSuccess] = useState<Record<number, string>>({})
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Regenerate state ──────────────────────────────────────────────────────────
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError]     = useState('')
  const [regenSuccess, setRegenSuccess] = useState(false)

  // ── Save state ────────────────────────────────────────────────────────────────
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Machine helpers ───────────────────────────────────────────────────────────
  function updateMachine(idx: number, patch: Partial<MachineOption>) {
    setMachines(prev => {
      const next = [...prev]
      const merged = { ...next[idx], ...patch }
      if (
        patch.machineModel !== undefined ||
        patch.laserSource !== undefined ||
        patch.bevelHead !== undefined ||
        patch.machinePower !== undefined
      ) {
        next[idx] = coerceMachineFields(merged)
      } else {
        next[idx] = merged
      }
      return next
    })
  }

  function addMachine() {
    if (machines.length >= 3) return
    const label = OPTION_LABELS[machines.length]
    setMachines(prev => [...prev, blankMachine(label)])
    setActiveTab(machines.length)
  }

  function addFullyLoadedOption() {
    if (machines.length >= 3) return
    const source = machines[activeTab]
    const label = OPTION_LABELS[machines.length]
    const fullyLoaded = coerceMachineFields({
      ...source,
      id: `machine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      smartMix: true, smartChanger: true, smartGrease: true,
      smartDoor: true, smartRaster: true, smartSetUp: true,
      automation: isAutomationAllowed(source.machineModel) ? 'With Tower' : 'None',
      pistonLift: true, ulCertification: true, cadCamSoftware: true, sideLoad: true,
      extendedWarranty: source.extendedWarranty.includes('3') ? source.extendedWarranty : '+3 Years ($45K)',
    })
    setMachines(prev => [...prev, fullyLoaded])
    setActiveTab(machines.length)
  }

  function removeMachine(idx: number) {
    if (machines.length <= 1) return
    setMachines(prev =>
      prev.filter((_, i) => i !== idx).map((m, i) => ({ ...m, label: OPTION_LABELS[i] }))
    )
    setActiveTab(t => Math.min(t, machines.length - 2))
  }

  // ── Document extraction ───────────────────────────────────────────────────────
  async function handleTabFileUpload(idx: number, file: File) {
    setExtractingTab(idx)
    setExtractErrors(e => ({ ...e, [idx]: '' }))
    setExtractSuccess(s => ({ ...s, [idx]: '' }))
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/extract', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed')
      const q = data.quoteData as Record<string, any>
      updateMachine(idx, autoCheckFromIntake(q))
      setExtractSuccess(s => ({ ...s, [idx]: `Extracted: ${q.model || '?'} ${q.power || ''} ${q.laser || ''}`.trim() }))
    } catch (err: any) {
      setExtractErrors(e => ({ ...e, [idx]: err.message || 'Could not extract data from this file.' }))
    } finally {
      setExtractingTab(null)
    }
  }

  function handleDrop(idx: number, e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleTabFileUpload(idx, file)
  }

  // ── Regenerate line items from machine options ────────────────────────────────
  async function handleRegenerate() {
    setRegenerating(true)
    setRegenError('')
    setRegenSuccess(false)
    try {
      const res = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: { company, contactName, contactEmail, contactPhone, machines },
          dealContext: { dealName: quote.quoteNumber },
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const option = json.options?.[0]
      if (!option) throw new Error('No options returned')
      setLineItems(option.lineItems)
      setDeliveryWeeks(option.deliveryWeeks ?? deliveryWeeks)
      setRegenSuccess(true)
    } catch (e: any) {
      setRegenError(e.message)
    } finally {
      setRegenerating(false)
    }
  }

  // ── Line item helpers ─────────────────────────────────────────────────────────
  function updateItem(index: number, patch: Partial<LineItem>) {
    setLineItems(prev => {
      const next = [...prev]
      const item = { ...next[index], ...patch }
      if ('qty' in patch || 'unitPrice' in patch) {
        item.amount = Math.round(item.qty * item.unitPrice * 100) / 100
      }
      next[index] = item
      return next
    })
  }
  function removeItem(index: number) { setLineItems(prev => prev.filter((_, i) => i !== index)) }
  function addItem() {
    setLineItems(prev => [...prev, { description: '', detail: '', qty: 1, unitPrice: 0, amount: 0, included: false }])
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const m = machines[activeTab]
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company, contactName, contactEmail, contactPhone,
          machineModel:  m.machineModel,
          machinePower:  m.machinePower,
          laserSource:   m.laserSource,
          bevelHead:     m.bevelHead,
          deliveryWeeks,
          lineItems,
          discountAmount,
          notes: machines.map(mc => mc.notes).filter(Boolean).join('\n'),
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      router.push(`/quotes/${quote.id}`)
      router.refresh()
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived totals ────────────────────────────────────────────────────────────
  const subtotal = lineItems.filter(i => !i.included).reduce((s, i) => s + i.amount, 0)
  const freight  = subtotal > 0 ? Math.round(subtotal * 0.025 * 100) / 100 : 0
  const total    = subtotal - discountAmount + freight

  const inputCls     = 'cla-input py-2.5'
  const labelCls     = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionHead  = 'text-xs font-bold text-[#0A2E52] uppercase tracking-widest mb-3 pb-1.5 border-b border-gray-200'

  const m = machines[activeTab]
  const allowedLasers = getAllowedLaserSources(m.machineModel)
  const bevelUiOptions = getBevelUiOptions(m.machineModel)
  const sheetPowers = getAllowedPowerLabels(m.machineModel, m.laserSource)
  const powerOptions = sheetPowers.length > 0 ? sheetPowers : POWER_OPTIONS
  const allowedSmart = getAllowedSmartOptions(m.machineModel)
  const automationAllowed = isAutomationAllowed(m.machineModel)

  return (
    <div className="space-y-8">

      {/* ══════════════════════════════════════
          CUSTOMER
      ══════════════════════════════════════ */}
      <div>
        <h3 className="text-sm font-semibold text-[#0A2E52] uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">
          Customer
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Company Name *</label>
            <input type="text" value={company} onChange={e => setCompany(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Contact Name *</label>
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contact Email *</label>
            <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contact Phone</label>
            <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputCls} />
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

        {/* Active tab content */}
        <div className="border border-t-0 border-gray-200 rounded-b-xl p-5 space-y-6">

          {/* Document upload */}
          <div
            onDrop={e => handleDrop(activeTab, e)}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRefs.current[activeTab]?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-[#1B6FC8] transition-colors cursor-pointer select-none"
          >
            <input
              ref={el => { fileInputRefs.current[activeTab] = el }}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleTabFileUpload(activeTab, f)
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
                <span className="font-medium text-[#1B6FC8]">Upload revised quote request</span>
                {' '}or drag &amp; drop
                <span className="ml-1 text-gray-300">·</span>
                <span className="ml-1">PDF, DOCX, TXT</span>
              </div>
            )}
            {extractErrors[activeTab] && (
              <p className="text-xs text-red-500 mt-1.5">{extractErrors[activeTab]}</p>
            )}
          </div>

          {/* Machine Basics */}
          <div>
            <p className={sectionHead}>Machine Basics</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Machine Model *</label>
                <input
                  type="text"
                  value={m.machineModel}
                  onChange={e => updateMachine(activeTab, { machineModel: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. FIBER Fast 4020, FIBER HD 16030, PLUS Bevel 6525"
                />
                <PricePreview model={m.machineModel} power={m.machinePower} laser={m.laserSource} />
              </div>

              <div>
                <label className={labelCls}>Power Rating</label>
                <select
                  value={m.machinePower}
                  onChange={e => updateMachine(activeTab, { machinePower: e.target.value })}
                  className={inputCls}
                >
                  {powerOptions.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Laser Source</label>
                <div className="flex gap-2 flex-wrap pt-1">
                  {LASER_SOURCE_LABELS.map(laser => {
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
                          onChange={() => updateMachine(activeTab, { laserSource: laser })}
                          className="accent-[#1B6FC8] disabled:cursor-not-allowed"
                        />
                        <span className={`text-sm ${laserDisabled ? 'text-gray-400' : 'text-gray-700'}`}>{laser}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Bevel */}
          <div>
            <p className={sectionHead}>Bevel</p>
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

          {/* SMART Options */}
          <div>
            <p className={sectionHead}>SMART Options</p>
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
                  onChange={v => updateMachine(activeTab, { [key]: v })}
                />
              ))}
            </div>
          </div>

          {/* Automation */}
          <div>
            <p className={sectionHead}>Automation</p>
            {!automationAllowed && (
              <p className="text-xs text-amber-700 mb-2">Load/unload automation is not available for this machine family.</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: 'None',            label: 'None',                sub: 'No automation' },
                { value: 'Inline No Tower', label: 'Inline',              sub: 'Inline, no tower' },
                { value: 'No Tower',        label: 'Load/Unload',         sub: 'SMART Flow, no tower' },
                { value: 'With Tower',      label: 'Load/Unload + Tower', sub: 'SMART Flow 90° tower' },
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
                    <span className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>{label}</span>
                  </div>
                  <span className={`text-xs pl-5 ${disabled ? 'text-gray-300' : 'text-gray-500'}`}>{sub}</span>
                </label>
                )
              })}
            </div>
          </div>

          {/* Additional Equipment */}
          <div>
            <p className={sectionHead}>Additional Equipment</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { key: 'pistonLift',      label: 'Piston Lift',              sub: 'Hydraulic sheet lifter' },
                { key: 'ulCertification', label: 'UL Certification',         sub: 'US electrical safety cert' },
                { key: 'cadCamSoftware',  label: 'CAD/CAM Software',         sub: 'Lantek or SigmaNAST 2D/3D' },
                { key: 'sideLoad',        label: 'Side Load Configuration',  sub: 'Side-access sheet loading' },
              ].map(({ key, label, sub }) => (
                <CheckOption
                  key={key}
                  checked={m[key as keyof MachineOption] as boolean}
                  label={label}
                  sub={sub}
                  onChange={v => updateMachine(activeTab, { [key]: v })}
                />
              ))}
            </div>
          </div>

          {/* Commercial Terms */}
          <div>
            <p className={sectionHead}>Commercial Terms</p>
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
                    onChange={e => updateMachine(activeTab, { trainingDays: parseInt(e.target.value) || 0 })}
                    className={inputCls + ' w-24'}
                  />
                  <span className="text-sm text-gray-500">× $2,500/day</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Extended Warranty</label>
                <select
                  value={m.extendedWarranty}
                  onChange={e => updateMachine(activeTab, { extendedWarranty: e.target.value })}
                  className={inputCls}
                >
                  {WARRANTY_OPTIONS.map(w => <option key={w}>{w}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Notes / Special Requirements</label>
                <textarea
                  value={m.notes}
                  onChange={e => updateMachine(activeTab, { notes: e.target.value })}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  placeholder="Financing, custom configurations, special requests…"
                />
              </div>
            </div>
          </div>

        </div>

        {machines.length > 1 && (
          <p className="mt-2 text-xs text-gray-400 text-center">
            {machines.length} machine options — line items will regenerate from the active tab ({m.label})
          </p>
        )}
      </div>

      {/* ── Regenerate button ── */}
      <div>
        {regenError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{regenError}</p>}
        {regenSuccess && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">✓ Line items regenerated from current options</p>}
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="w-full py-3 border-2 border-[#1B6FC8] text-[#1B6FC8] rounded-xl font-semibold hover:bg-[#E6F1FB] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {regenerating
            ? <><span className="w-4 h-4 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />Regenerating…</>
            : '↻ Regenerate Line Items from Options'}
        </button>
      </div>

      {/* ══════════════════════════════════════
          LINE ITEMS
      ══════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#0A2E52] uppercase tracking-wide">Line Items</h3>
          <button
            type="button"
            onClick={addItem}
            className="text-xs font-medium text-[#1B6FC8] border border-[#1B6FC8] rounded-lg px-3 py-1.5 hover:bg-[#E6F1FB] transition-colors"
          >
            + Add Line Item
          </button>
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_5rem_7rem_7rem_2.5rem_2.5rem] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Amount</span>
            <span className="text-center">INC</span>
            <span />
          </div>
          <div className="divide-y divide-gray-100">
            {lineItems.map((item, idx) => (
              <div key={idx} className={`grid grid-cols-[1fr_5rem_7rem_7rem_2.5rem_2.5rem] gap-2 px-4 py-2.5 items-center ${item.included ? 'bg-green-50/50' : ''}`}>
                <div className="space-y-1">
                  <input
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1B6FC8]"
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateItem(idx, { description: e.target.value })}
                  />
                  <input
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#1B6FC8]"
                    placeholder="Detail (optional)"
                    value={item.detail}
                    onChange={e => updateItem(idx, { detail: e.target.value })}
                  />
                </div>
                <input
                  type="number" min={1}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#1B6FC8]"
                  value={item.qty}
                  onChange={e => updateItem(idx, { qty: Number(e.target.value) })}
                  disabled={item.included}
                />
                <input
                  type="number" min={0} step={100}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#1B6FC8]"
                  value={item.unitPrice}
                  onChange={e => updateItem(idx, { unitPrice: Number(e.target.value) })}
                  disabled={item.included}
                />
                <span className={`text-sm text-right font-medium ${item.included ? 'text-green-600' : 'text-gray-700'}`}>
                  {item.included ? 'INC' : fmt(item.amount)}
                </span>
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={item.included}
                    onChange={e => updateItem(idx, {
                      included: e.target.checked,
                      unitPrice: e.target.checked ? 0 : item.unitPrice,
                      amount: e.target.checked ? 0 : item.amount,
                    })}
                    className="w-4 h-4 accent-green-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="flex justify-center text-gray-300 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          PRICING SUMMARY
      ══════════════════════════════════════ */}
      <div>
        <h3 className="text-sm font-semibold text-[#0A2E52] uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">Pricing</h3>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium">{fmt(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Discount</span>
            <div className="flex items-center gap-1">
              <span className="text-gray-400">$</span>
              <input
                type="number" min={0} step={100}
                className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#1B6FC8]"
                value={discountAmount}
                onChange={e => setDiscountAmount(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Delivery (weeks)</span>
            <input
              type="number" min={1} max={52}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#1B6FC8]"
              value={deliveryWeeks}
              onChange={e => setDeliveryWeeks(Number(e.target.value))}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Freight (2.5%)</span>
            <span className="font-medium">{fmt(freight)}</span>
          </div>
          <div className="flex justify-between pt-3 border-t border-gray-300">
            <span className="font-bold text-[#0A2E52]">Total</span>
            <span className="font-black text-[#0A2E52] text-lg">{fmt(total)}</span>
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{saveError}</div>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 cla-btn-secondary py-3"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 cla-btn-primary py-3 disabled:active:scale-100 flex items-center justify-center gap-2"
        >
          {saving
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
            : 'Save Changes'}
        </button>
      </div>

    </div>
  )
}
