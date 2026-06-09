'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  clearPriceCheckPrefill,
  loadPriceCheckPrefill,
  priceCheckPrefillToIntake,
} from '@/lib/priceCheckPrefill'
import { parseApiResponse } from '@/lib/parseApiResponse'
import StepIndicator from '@/components/StepIndicator'
import DealerBrandHeader from '@/components/DealerBrandHeader'
import DealerCustomerForm from '@/components/QuoteFlow/DealerCustomerForm'
import IntakeChat from '@/components/QuoteFlow/IntakeChat'
import IntakeUpload from '@/components/QuoteFlow/IntakeUpload'
import IntakeVoice from '@/components/QuoteFlow/IntakeVoice'
import ReviewForm from '@/components/QuoteFlow/ReviewForm'
import OptionCards, { type PricingContext } from '@/components/QuoteFlow/OptionCards'
import {
  DEALER_CUSTOM_PRICING_MESSAGE,
  isCustomPricingOption,
} from '@/lib/sheetPricingWarnings'
import type { QuoteFormData, QuoteOption } from '@/types'

type Step = 1 | 2 | 3 | 4 | 5

const INTAKE_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'upload', label: 'Document Upload' },
  { id: 'voice', label: 'Voice' },
] as const

interface SubmittedQuote {
  id: string
  quoteNumber: string
  machineLabel: string
  machineModel: string
  machinePower: string
  laserSource: string
  name: string
  totalPrice: number
  customPricing: boolean
}

export default function DealerNewQuotePage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [intakeTab, setIntakeTab] = useState<'chat' | 'upload' | 'voice'>('chat')

  const [customerInfo, setCustomerInfo] = useState<any>(null)
  const [intakeData, setIntakeData]     = useState<Record<string, any>>({})
  const [formData, setFormData]         = useState<QuoteFormData | null>(null)
  const [quoteOptions, setQuoteOptions] = useState<QuoteOption[]>([])
  const [selectedOptions, setSelectedOptions] = useState<QuoteOption[]>([])
  const [generatingOptions, setGeneratingOptions] = useState(false)
  const [pricingContext, setPricingContext] = useState<PricingContext | null>(null)
  const [submitting, setSubmitting]     = useState(false)
  const [submittedQuotes, setSubmittedQuotes] = useState<SubmittedQuote[]>([])
  const [submitError, setSubmitError]   = useState('')
  const [submitWarning, setSubmitWarning] = useState('')
  const [fromPriceCheck, setFromPriceCheck] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setFromPriceCheck(params.get('from') === 'price-check' || !!loadPriceCheckPrefill())
  }, [])

  // ─── Step 1: Customer info ───────────────────────────────────────────────────
  function handleCustomerInfo(info: any) {
    setCustomerInfo(info)
    const prefill = loadPriceCheckPrefill()
    if (prefill) {
      setIntakeData(priceCheckPrefillToIntake(prefill))
      clearPriceCheckPrefill()
      setFromPriceCheck(false)
      setStep(3)
      return
    }
    setStep(2)
  }

  // ─── Step 2: Intake ──────────────────────────────────────────────────────────
  function handleIntakeComplete(data: Record<string, any>) {
    setIntakeData(data)
    setStep(3)
  }

  // ─── Step 3: Review form submitted ──────────────────────────────────────────
  async function handleReviewSubmit(data: QuoteFormData) {
    setFormData(data)
    setGeneratingOptions(true)
    setSelectedOptions([])
    setStep(4)

    const dealContext = {
      dealId: null,
      dealName: `${data.company} - ${data.machines?.[0]?.machineModel || ''}`,
      company: data.company,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
    }

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

  // ─── Toggle option (max 3) ───────────────────────────────────────────────────
  function toggleOption(option: QuoteOption) {
    setSelectedOptions(prev => {
      const already = prev.some(o => o.machineLabel === option.machineLabel)
      if (already) return prev.filter(o => o.machineLabel !== option.machineLabel)
      if (prev.length >= 3) return prev
      return [...prev, option]
    })
  }

  // ─── Step 4 → 5: Submit request ─────────────────────────────────────────────
  async function handleSubmitRequest() {
    if (selectedOptions.length === 0 || !formData) return
    setSubmitting(true)
    setSubmitError('')
    setSubmitWarning('')

    try {
      const res = await fetch('/api/dealer/quotes/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, selectedOptions }),
      })
      const json = await parseApiResponse<{
        error?: string
        quotes?: Array<Record<string, unknown>>
        hubspotDraftErrors?: string[]
      }>(res)
      if (json.error) throw new Error(json.error)

      setSubmittedQuotes((json.quotes as any[]).map((q) => {
        const option = selectedOptions.find((o) => o.machineLabel === q.tier)
        const machinePower = String(q.machinePower ?? option?.machinePower ?? '')
        const laserSource = String(q.laserSource ?? option?.laserSource ?? '')
        const customPricing = option
          ? isCustomPricingOption(option)
          : isCustomPricingOption({
              machineModel: String(q.machineModel ?? ''),
              machinePower,
              laserSource,
            })

        return {
          id: q.id,
          quoteNumber: q.quoteNumber,
          machineLabel: q.tier,
          machineModel: q.machineModel,
          machinePower,
          laserSource,
          name: q.packageName,
          totalPrice: q.totalAmount,
          customPricing,
        }
      }))
      const draftErrors: string[] = json.hubspotDraftErrors ?? []
      if (draftErrors.length > 0) {
        setSubmitWarning(
          `Some quote details could not be synced to HubSpot automatically. Our team has your request and will follow up. (${draftErrors.length} item${draftErrors.length === 1 ? '' : 's'})`
        )
      }
      setStep(5)
    } catch (e: any) {
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const reviewInitialData: Partial<QuoteFormData> = {
    company: customerInfo?.company || '',
    contactName: customerInfo?.contactName || '',
    contactEmail: customerInfo?.contactEmail || '',
    contactPhone: customerInfo?.contactPhone || '',
    machines: [],
    notes: customerInfo?.notes || '',
  }

  function priceRange(total: number): string {
    const round = (n: number) => Math.round(n / 25000) * 25000
    const lo = round(total * 0.90)
    const hi = round(total * 1.10)
    const f = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : '$' + Math.round(n).toLocaleString('en-US')
    return `${f(lo)} – ${f(hi)}`
  }

  return (
    <div className="cla-page-canvas">
      <DealerBrandHeader eyebrow="New quote request" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <StepIndicator currentStep={step} />

        <div className="cla-elevated p-6 md:p-9 animate-cla-rise">
          {/* ── Step 1 ── */}
          {step === 1 && (
            <>
              {fromPriceCheck && (
                <div className="mb-6 rounded-lg border border-[#1B6FC8]/25 bg-[#E6F1FB] px-4 py-3 text-sm text-[#0A2E52]">
                  Your machine configuration from the price check will load on the review step after you enter
                  customer details.
                </div>
              )}
              <DealerCustomerForm onContinue={handleCustomerInfo} />
            </>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div>
              <div className="mb-6">
                <h2 className="cla-section-heading">Machine information</h2>
                <p className="cla-section-sub mb-0">
                  Customer: <span className="font-medium text-brand-text-mid">{customerInfo?.company}</span>
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
                <IntakeChat
                  dealContext={{ company: customerInfo?.company }}
                  onQuoteDataExtracted={handleIntakeComplete}
                />
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
                <h2 className="cla-section-heading">Review &amp; edit</h2>
                <p className="cla-section-sub mb-0">Confirm all details before generating quote options.</p>
              </div>
              <ReviewForm
                initialData={reviewInitialData}
                intakeData={intakeData}
                isDealer
                onSubmit={handleReviewSubmit}
              />
            </div>
          )}

          {/* ── Step 4 ── */}
          {step === 4 && (
            <div>
              <div className="mb-6">
                <h2 className="cla-section-heading">Select quote options</h2>
                <p className="cla-section-sub mb-0">Choose one or more options to include in your quote request.</p>
              </div>

              {generatingOptions ? (
                <div className="flex flex-col items-center py-16 gap-4">
                  <div className="w-10 h-10 border-4 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-500 text-sm">Generating quote options…</p>
                </div>
              ) : (
                <>
                  <OptionCards
                    options={quoteOptions}
                    selectedLabels={selectedOptions.map(o => o.machineLabel)}
                    onToggle={toggleOption}
                    onContinue={() => {}}
                    pricingContext={pricingContext}
                    isDealer
                  />

                  {selectedOptions.length > 0 && (
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between text-sm text-gray-500 px-1">
                        <span>
                          {selectedOptions.length === 1
                            ? '1 option selected'
                            : `${selectedOptions.length} options selected`}
                        </span>
                        <span className="text-xs text-gray-400">click a card to deselect</span>
                      </div>

                      {submitError && (
                        <div className="cla-alert-error">{submitError}</div>
                      )}

                      <button
                        onClick={handleSubmitRequest}
                        disabled={submitting}
                        className="cla-btn-gold w-full py-4 text-base flex items-center justify-center gap-2"
                      >
                        {submitting ? (
                          <>
                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Submitting Request…
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                            Submit Quote Request →
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 5: Confirmation ── */}
          {step === 5 && (
            <div className="text-center">
              {/* Success icon */}
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>

              <h2 className="cla-section-heading text-center mb-2">Request submitted</h2>
              <p className="text-brand-text-muted text-sm mb-6 max-w-md mx-auto leading-relaxed">
                Our team has been notified and will review your quote request. We&apos;ll reach out to {formData?.contactEmail || 'the contact'} once it&apos;s approved.
              </p>

              {/* Quote summary cards */}
              <div className="space-y-3 mb-8 text-left max-w-md mx-auto">
                {submittedQuotes.map(q => (
                  <div key={q.id} className="cla-highlight-total p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold bg-[#0A2E52] text-white px-2 py-0.5 rounded-full">
                          {q.machineLabel}
                        </span>
                        <span className="text-sm font-semibold text-[#0A2E52]">{q.name}</span>
                      </div>
                      <p className="text-xs text-gray-500">{q.machineModel} · {q.quoteNumber}</p>
                    </div>
                    <div className="text-right max-w-[140px]">
                      {q.customPricing ? (
                        <>
                          <p className="text-sm font-semibold text-amber-800 leading-snug">Custom pricing</p>
                          <p className="text-[10px] text-gray-500 mt-1 leading-snug">{DEALER_CUSTOM_PRICING_MESSAGE}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-black text-[#0A2E52] text-base leading-tight">{priceRange(q.totalPrice)}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Estimated range</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Status info */}
              <div className="cla-alert-warning mb-6 max-w-md mx-auto text-left">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Pending Review</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Our inside sales team is reviewing your request. A HubSpot deal will be created when your quote is approved and sent.
                    </p>
                  </div>
                </div>
              </div>

              {submitWarning && (
                <div className="cla-alert-error mb-6 max-w-md mx-auto text-left">
                  {submitWarning}
                </div>
              )}

              <div className="flex gap-3 max-w-md mx-auto">
                <button
                  onClick={() => router.push('/dealer')}
                  className="cla-btn-secondary flex-1 py-3"
                >
                  View my requests
                </button>
                <button
                  onClick={() => {
                    setStep(1)
                    setCustomerInfo(null)
                    setIntakeData({})
                    setFormData(null)
                    setQuoteOptions([])
                    setSelectedOptions([])
                    setSubmittedQuotes([])
                  }}
                  className="cla-btn-primary flex-1 py-3"
                >
                  New Request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
