'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepIndicator from '@/components/StepIndicator'
import BrandHeader from '@/components/BrandHeader'
import DealSelect from '@/components/QuoteFlow/DealSelect'
import IntakeChat from '@/components/QuoteFlow/IntakeChat'
import IntakeUpload from '@/components/QuoteFlow/IntakeUpload'
import IntakeVoice from '@/components/QuoteFlow/IntakeVoice'
import ReviewForm from '@/components/QuoteFlow/ReviewForm'
import OptionCards, { type PricingContext } from '@/components/QuoteFlow/OptionCards'
import { suggestTemplate } from '@/lib/templateMatcher'
import { parseDealName } from '@/lib/dealParser'
import type { QuoteTemplate } from '@/lib/hubspot'
import type { QuoteFormData, QuoteOption } from '@/types'

type Step = 1 | 2 | 3 | 4 | 5

const INTAKE_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'upload', label: 'Document Upload' },
  { id: 'voice', label: 'Voice' },
] as const

interface SavedQuote {
  id: string
  quoteNumber: string
  machineLabel: string
  machineModel: string
  name: string
  totalPrice: number
  hubspotDealId: string
  hubspotQuoteId?: string | null
}

function NewQuotePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>(1)
  const [intakeTab, setIntakeTab] = useState<'chat' | 'upload' | 'voice'>('chat')

  // Data accumulated across steps
  const [dealContext, setDealContext] = useState<any>(null)
  const [intakeData, setIntakeData] = useState<Record<string, any>>({})
  const [formData, setFormData] = useState<QuoteFormData | null>(null)
  const [quoteOptions, setQuoteOptions] = useState<QuoteOption[]>([])
  const [selectedOptions, setSelectedOptions] = useState<QuoteOption[]>([])
  const [generatingOptions, setGeneratingOptions] = useState(false)
  const [pricingContext, setPricingContext] = useState<PricingContext | null>(null)
  const [savingQuote, setSavingQuote] = useState(false)
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([])

  // ─── Publish state (Step 5) ──────────────────────────────────────────────────
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [sharedTemplateId, setSharedTemplateId] = useState('')
  const [templateConfirmed, setTemplateConfirmed] = useState(false)
  const [publishStatus, setPublishStatus] = useState<Record<string, 'idle' | 'publishing' | 'done' | 'error'>>({})
  const [publishResults, setPublishResults] = useState<Record<string, { hubspotQuoteId?: string; dealLink?: string; error?: string }>>({})
  const [publishingAll, setPublishingAll] = useState(false)

  // ─── Auto-select deal from ?dealId= query param ──────────────────────────────
  useEffect(() => {
    const dealId = searchParams.get('dealId')
    if (!dealId || step !== 1) return

    fetch(`/api/deals/search?dealId=${encodeURIComponent(dealId)}`)
      .then(r => r.json())
      .then(data => {
        const deal = data.deals?.[0]
        if (!deal) return
        // Mirror DealSelect's in-wizard selection: parse machine info from the
        // deal name and prefill contact details from the associated HubSpot contact
        const parsed = parseDealName(deal.properties?.dealname ?? '')
        const contact = deal.contact?.properties
        handleDealSelected(deal, {
          company: parsed.company,
          machineModel: parsed.model,
          machinePower: parsed.power,
          laserSource: parsed.laserSource,
          contactName: contact ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') : '',
          contactEmail: contact?.email || '',
          contactPhone: contact?.phone || '',
        })
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Step 1: Deal selected ───────────────────────────────────────────────────
  async function handleDealSelected(deal: any, parsed: any) {
    const dealName: string = deal.properties?.dealname ?? ''
    const customerCompany = dealName.includes(' - ') ? dealName.split(' - ')[0].trim() : (parsed.company || '')
    const ctx = { ...parsed, dealId: deal.id, dealName, company: customerCompany }
    setDealContext(ctx)
    setIntakeData({
      model: parsed.machineModel || '',
      power: parsed.machinePower || '',
      laser: parsed.laserSource || '',
    })
    setStep(2)

    // Silently fetch company deal history and add to context for AI.
    const company = customerCompany
    if (company) {
      try {
        const res = await fetch(
          `/api/deals/company-history?company=${encodeURIComponent(company)}&excludeId=${deal.id}`
        )
        const data = await res.json()
        if (data.deals?.length > 0) {
          setDealContext((prev: any) => ({ ...prev, companyDealHistory: data.deals }))
        }
      } catch {
        // Non-critical
      }
    }
  }

  // ─── Step 2: Intake complete ─────────────────────────────────────────────────
  function handleIntakeComplete(data: Record<string, any>) {
    // Merge over deal-parsed defaults (model/power/laser) so "Skip" keeps them
    setIntakeData(prev => ({ ...prev, ...data }))
    setStep(3)
  }

  // ─── Step 3: Review form submitted ──────────────────────────────────────────
  async function handleReviewSubmit(data: QuoteFormData) {
    setFormData(data)
    setGeneratingOptions(true)
    setSelectedOptions([])
    setStep(4)

    try {
      const primaryMachine = data.machines[0]

      const [genRes, ctxRes] = await Promise.all([
        fetch('/api/quotes/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formData: data, dealContext }),
        }),
        primaryMachine ? fetch(
          `/api/quotes/pricing-context?model=${encodeURIComponent(primaryMachine.machineModel)}&laser=${encodeURIComponent(primaryMachine.laserSource)}&power=${encodeURIComponent(primaryMachine.machinePower)}`
        ) : Promise.resolve(null),
      ])

      const genJson = await genRes.json()
      if (genJson.error) throw new Error(genJson.error)
      setQuoteOptions(genJson.options)

      if (ctxRes?.ok) {
        const ctx = await ctxRes.json()
        if (!ctx.error) setPricingContext(ctx)
      }
    } catch (e: any) {
      alert('Failed to generate options: ' + e.message)
      setStep(3)
    } finally {
      setGeneratingOptions(false)
    }
  }

  // ─── Toggle an option in/out of the selection (max 3) ───────────────────────
  function toggleOption(option: QuoteOption) {
    setSelectedOptions(prev => {
      const alreadySelected = prev.some(o => o.machineLabel === option.machineLabel)
      if (alreadySelected) {
        return prev.filter(o => o.machineLabel !== option.machineLabel)
      }
      if (prev.length >= 3) return prev // max 3 quotes per deal
      return [...prev, option]
    })
  }

  // ─── Fetch templates when entering step 5 ───────────────────────────────────
  useEffect(() => {
    if (step !== 5 || templates.length > 0 || templatesLoading) return
    setTemplatesLoading(true)
    fetch('/api/quotes/templates')
      .then(r => r.json())
      .then(data => {
        const list: QuoteTemplate[] = data.templates ?? []
        setTemplates(list)
        // Auto-select recommended template based on first saved quote's model
        if (savedQuotes.length > 0) {
          const rec = suggestTemplate(
            savedQuotes[0].machineModel,
            list,
            formData?.company,
            dealContext?.dealName
          )
          if (rec) setSharedTemplateId(rec.id)
        }
        setTemplateConfirmed(false)
      })
      .catch(() => {})
      .finally(() => setTemplatesLoading(false))
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Publish a single quote ──────────────────────────────────────────────────
  async function publishOne(quoteId: string) {
    setPublishStatus(s => ({ ...s, [quoteId]: 'publishing' }))
    try {
      const res = await fetch('/api/quotes/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, templateId: sharedTemplateId || undefined }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setPublishStatus(s => ({ ...s, [quoteId]: 'done' }))
      setPublishResults(r => ({ ...r, [quoteId]: { hubspotQuoteId: json.hubspotQuoteId, dealLink: json.dealLink } }))
    } catch (e: any) {
      setPublishStatus(s => ({ ...s, [quoteId]: 'error' }))
      setPublishResults(r => ({ ...r, [quoteId]: { error: e.message } }))
    }
  }

  // ─── Publish all quotes sequentially ────────────────────────────────────────
  async function publishAll() {
    setPublishingAll(true)
    const pending = savedQuotes.filter(q => publishStatus[q.id] !== 'done')
    for (const q of pending) {
      await publishOne(q.id)
    }
    setPublishingAll(false)
  }

  // ─── Step 4 → 5: Save all selected options ───────────────────────────────────
  async function handleContinueToPublish() {
    if (selectedOptions.length === 0 || !formData) return
    setSavingQuote(true)

    try {
      const res = await fetch('/api/quotes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, selectedOptions, dealContext }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      const quotes: SavedQuote[] = (json.quotes as any[]).map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        machineLabel: q.tier,
        machineModel: q.machineModel,
        name: q.packageName,
        totalPrice: q.totalAmount,
        hubspotDealId: q.hubspotDealId,
        hubspotQuoteId: q.hubspotQuoteId ?? null,
      }))
      setSavedQuotes(quotes)
      setPublishStatus({})
      setPublishResults({})
      setStep(5)
    } catch (e: any) {
      alert('Failed to save quotes: ' + e.message)
    } finally {
      setSavingQuote(false)
    }
  }

  // ─── Initial data for ReviewForm ─────────────────────────────────────────────
  const reviewInitialData: Partial<QuoteFormData> = {
    company: dealContext?.company || '',
    contactName: dealContext?.contactName || '',
    contactEmail: dealContext?.contactEmail || '',
    contactPhone: dealContext?.contactPhone || '',
    machines: [],
    notes: '',
  }

  function fmt(n: number) {
    return '$' + Math.round(n).toLocaleString('en-US')
  }

  return (
    <div className="cla-page-canvas">
      <BrandHeader eyebrow="New quote" logoHeight={32}>
        <a href="/" className="cla-btn-ghost hidden sm:inline text-xs tracking-wide">
          ← Dashboard
        </a>
      </BrandHeader>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <StepIndicator currentStep={step} />

        <div className="cla-elevated p-6 md:p-9 animate-cla-rise">
          {/* ── Step 1 ── */}
          {step === 1 && <DealSelect onDealSelected={handleDealSelected} />}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div>
              <div className="mb-6">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0A2E52] mb-1">Quote Intake</h2>
                <p className="cla-section-sub mb-0">
                  Deal: <span className="font-medium text-brand-text-mid">{dealContext?.dealName}</span>
                </p>
              </div>

              <div className="cla-tabs">
                {INTAKE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setIntakeTab(tab.id)}
                    className={`cla-tab ${intakeTab === tab.id ? 'cla-tab-active' : ''}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {intakeTab === 'chat' && (
                <IntakeChat dealContext={dealContext} onQuoteDataExtracted={handleIntakeComplete} />
              )}
              {intakeTab === 'upload' && (
                <IntakeUpload onQuoteDataExtracted={handleIntakeComplete} />
              )}
              {intakeTab === 'voice' && (
                <IntakeVoice onQuoteDataExtracted={handleIntakeComplete} />
              )}

              <div className="mt-4 text-center">
                <button
                  onClick={() => handleIntakeComplete({})}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Skip — I&apos;ll fill in details manually
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div>
              <div className="mb-6">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0A2E52] mb-1">Review &amp; Edit</h2>
                <p className="cla-section-sub mb-0">Confirm all details before generating quote options.</p>
              </div>
              <ReviewForm
                initialData={reviewInitialData}
                intakeData={intakeData}
                dealId={dealContext?.dealId}
                onSubmit={handleReviewSubmit}
              />
            </div>
          )}

          {/* ── Step 4 ── */}
          {step === 4 && (
            <div>
              <div className="mb-6">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0A2E52] mb-1">Quote Options</h2>
                <p className="cla-section-sub mb-0">Select one or more options to generate quotes for this deal.</p>
              </div>

              {generatingOptions ? (
                <div className="flex flex-col items-center py-16 gap-4">
                  <div className="w-10 h-10 border-4 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
                  <p className="text-brand-text-muted text-sm">Generating quote options with AI…</p>
                </div>
              ) : (
                <OptionCards
                  options={quoteOptions}
                  selectedLabels={selectedOptions.map(o => o.machineLabel)}
                  onToggle={toggleOption}
                  onContinue={handleContinueToPublish}
                  pricingContext={pricingContext}
                />
              )}

              {savingQuote && (
                <div className="fixed inset-0 bg-[#061a31]/40 backdrop-blur-sm flex items-center justify-center z-50 animate-cla-fade">
                  <div className="cla-glass-panel p-6 flex items-center gap-4 animate-cla-scale-in">
                    <div className="w-6 h-6 border-2 border-brand-steel border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium text-brand-text-mid">
                      Saving {selectedOptions.length > 1 ? `${selectedOptions.length} quotes` : 'quote'}…
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5 ── */}
          {step === 5 && (() => {
            const allDone = savedQuotes.length > 0 && savedQuotes.every(q => publishStatus[q.id] === 'done')
            const anyDone = savedQuotes.some(q => publishStatus[q.id] === 'done')
            const pendingCount = savedQuotes.filter(q => publishStatus[q.id] !== 'done').length
            const recommendedId = savedQuotes.length > 0
              ? suggestTemplate(savedQuotes[0].machineModel, templates, formData?.company, dealContext?.dealName)?.id
              : undefined
            const canPublish = templateConfirmed

            return (
              <div>
                <div className="mb-6">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0A2E52] mb-1">
                    {savedQuotes.length === 1 ? 'Publish Quote' : `Publish ${savedQuotes.length} Quotes`}
                  </h2>
                  <p className="cla-section-sub mb-0">
                    Preview or download each quote, then push to HubSpot individually or all at once.
                  </p>
                </div>

                <div className="cla-elevated p-4 md:p-5 mb-6 space-y-3 bg-brand-warm-white/50">
                  <p className="cla-kicker">Push to HubSpot</p>

                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                    {/* Template picker */}
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">
                        Quote Template{templatesLoading && <span className="ml-1 text-gray-400">Loading…</span>}
                      </label>
                      {templates.length > 0 ? (
                        <select
                          value={sharedTemplateId}
                          onChange={e => {
                            setSharedTemplateId(e.target.value)
                            setTemplateConfirmed(false)
                          }}
                          className="cla-input py-2 text-sm"
                        >
                          <option value="">— No template —</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.id === recommendedId ? '★ ' : ''}{t.name}
                            </option>
                          ))}
                        </select>
                      ) : !templatesLoading ? (
                        <p className="text-sm text-gray-400 italic py-2">No templates available</p>
                      ) : null}
                      {templates.length > 0 && (
                        <label className="flex items-start gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-[#1B6FC8]"
                            checked={templateConfirmed}
                            onChange={(e) => setTemplateConfirmed(e.target.checked)}
                          />
                          <span>
                            I confirm the HubSpot quote template
                            {sharedTemplateId
                              ? ` (${templates.find(t => t.id === sharedTemplateId)?.name ?? 'selected'})`
                              : ' (none — official terms will not apply)'}
                          </span>
                        </label>
                      )}
                    </div>

                    {/* Publish All button */}
                    {!allDone && (
                      <button
                        onClick={publishAll}
                        disabled={publishingAll || !canPublish}
                        className="cla-btn-primary flex items-center gap-2 px-5 py-2 text-sm disabled:active:scale-100 whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                      >
                        {publishingAll ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Publishing…
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            {savedQuotes.length === 1
                              ? 'Push to HubSpot'
                              : anyDone
                                ? `Push Remaining ${pendingCount}`
                                : `Push All ${savedQuotes.length} to HubSpot`}
                          </>
                        )}
                      </button>
                    )}

                    {allDone && (
                      <div className="flex items-center gap-1.5 text-green-700 font-semibold text-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        All quotes published!
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Per-quote cards ── */}
                <div className="space-y-4">
                  {savedQuotes.map((q, idx) => {
                    const status = publishStatus[q.id] ?? 'idle'
                    const result = publishResults[q.id]
                    const CARD_COLORS = [
                      { badge: 'bg-[#1B6FC8] text-white', header: 'bg-[#E6F1FB] border-blue-100' },
                      { badge: 'bg-[#0A2E52] text-white', header: 'bg-slate-50 border-slate-200' },
                      { badge: 'bg-emerald-600 text-white', header: 'bg-emerald-50 border-emerald-100' },
                    ]
                    const colors = CARD_COLORS[idx % CARD_COLORS.length]

                    return (
                      <div key={q.id} className="cla-elevated overflow-hidden">
                        {/* Header */}
                        <div className={`px-5 py-4 border-b flex items-center justify-between ${colors.header}`}>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
                                {q.machineLabel}
                              </span>
                              <span className="text-sm font-semibold text-[#0A2E52]">{q.name}</span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {formData?.company} · {q.machineModel} · {q.quoteNumber}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-black text-[#0A2E52]">{fmt(q.totalPrice)}</p>
                            <p className="text-xs text-gray-400">USD · 12 weeks</p>
                          </div>
                        </div>

                        {/* Actions row */}
                        <div className="px-5 py-3 bg-white flex items-center justify-between flex-wrap gap-3">
                          {/* Preview / PDF / Detail links */}
                          <div className="flex items-center gap-2">
                            <a
                              href={`/quotes/${q.id}/preview`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-rule-gray/70 text-brand-text-mid rounded-lg text-xs font-medium hover:border-brand-steel/40 hover:text-brand-steel hover:bg-brand-steel-light/40 transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Preview
                            </a>
                            <a
                              href={`/api/quotes/${q.id}/pdf`}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-rule-gray/70 text-brand-text-mid rounded-lg text-xs font-medium hover:border-brand-steel/40 hover:text-brand-steel hover:bg-brand-steel-light/40 transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              PDF
                            </a>
                            <a
                              href={`/quotes/${q.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-rule-gray/70 text-brand-text-mid rounded-lg text-xs font-medium hover:border-brand-steel/40 hover:text-brand-steel hover:bg-brand-steel-light/40 transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              Detail
                            </a>
                          </div>

                          {/* Per-card publish button / status */}
                          <div className="flex items-center gap-3">
                            {status === 'idle' && (
                              <button
                                onClick={() => publishOne(q.id)}
                                disabled={publishingAll}
                                className="flex items-center gap-1.5 px-4 py-1.5 cla-btn-primary text-xs py-1.5 disabled:opacity-40"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                Push to HubSpot
                              </button>
                            )}
                            {status === 'publishing' && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <span className="w-3.5 h-3.5 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
                                Pushing…
                              </div>
                            )}
                            {status === 'done' && (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  Published
                                </div>
                                {result?.dealLink && (
                                  <a
                                    href={result.dealLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-[#1B6FC8] hover:underline"
                                  >
                                    View in HubSpot →
                                  </a>
                                )}
                              </div>
                            )}
                            {status === 'error' && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-600">{result?.error ?? 'Failed'}</span>
                                <button
                                  onClick={() => publishOne(q.id)}
                                  className="text-xs text-[#1B6FC8] hover:underline"
                                >
                                  Retry
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-8 text-center">
                  <button
                    onClick={() => router.push('/')}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default function NewQuotePageWrapper() {
  return (
    <Suspense>
      <NewQuotePage />
    </Suspense>
  )
}
