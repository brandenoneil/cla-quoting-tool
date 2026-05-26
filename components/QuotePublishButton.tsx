'use client'

import { useState, useEffect } from 'react'
import { recommendTemplate } from '@/lib/templateMatcher'
import type { QuoteTemplate } from '@/lib/hubspot'
import { HUBSPOT_PORTAL_ID } from '@/types'

interface Props {
  quoteId: string
  machineModel: string
  hubspotQuoteId?: string | null
  hubspotDealId: string
}

export default function QuotePublishButton({ quoteId, machineModel, hubspotQuoteId, hubspotDealId }: Props) {
  const [templates, setTemplates]           = useState<QuoteTemplate[]>([])
  const [templatesLoading, setTplLoading]   = useState(false)
  const [selectedTemplateId, setTemplateId] = useState('')
  const [publishing, setPublishing]         = useState(false)
  const [result, setResult]                 = useState<{ success?: boolean; error?: string; hubspotQuoteId?: string; dealLink?: string } | null>(null)

  useEffect(() => {
    setTplLoading(true)
    fetch('/api/quotes/templates')
      .then(r => r.json())
      .then(data => {
        const list: QuoteTemplate[] = data.templates ?? []
        setTemplates(list)
        const rec = recommendTemplate(machineModel, list)
        if (rec) setTemplateId(rec.id)
      })
      .catch(() => {})
      .finally(() => setTplLoading(false))
  }, [machineModel])

  async function handlePublish() {
    setPublishing(true)
    setResult(null)
    try {
      const res = await fetch('/api/quotes/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, templateId: selectedTemplateId || undefined }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResult({ success: true, hubspotQuoteId: json.hubspotQuoteId, dealLink: json.dealLink })
    } catch (e: any) {
      setResult({ error: e.message })
    } finally {
      setPublishing(false)
    }
  }

  const recommendedId = recommendTemplate(machineModel, templates)?.id

  return (
    <div className="cla-elevated p-5 space-y-3">
      <h3 className="font-semibold text-[#0A2E52] text-sm">Push to HubSpot</h3>

      {/* Existing HS quote link */}
      {hubspotQuoteId && !result?.success && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Previously pushed as quote <span className="font-mono font-medium">{hubspotQuoteId}</span>. Pushing again will create a new quote on the deal.
        </div>
      )}

      {/* Template picker */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          Quote Template
          {templatesLoading && <span className="ml-2 text-gray-400">Loading…</span>}
        </label>
        {templates.length > 0 ? (
          <select
            value={selectedTemplateId}
            onChange={e => setTemplateId(e.target.value)}
            className="cla-input py-2 text-xs"
          >
            <option value="">— No template —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.id === recommendedId ? '★ ' : ''}{t.name}
              </option>
            ))}
          </select>
        ) : !templatesLoading ? (
          <p className="text-xs text-gray-400 italic">No templates available</p>
        ) : null}
      </div>

      {/* Publish button */}
      {!result?.success && (
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="cla-btn-primary w-full py-2.5 text-sm disabled:active:scale-100"
        >
          {publishing ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Pushing…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Push to HubSpot
            </>
          )}
        </button>
      )}

      {/* Error */}
      {result?.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {result.error}
        </div>
      )}

      {/* Success */}
      {result?.success && (
        <div className="text-xs bg-green-50 border border-green-300 rounded-lg px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-green-700 font-semibold">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Published!
          </div>
          <a
            href={result.dealLink ?? `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${hubspotDealId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1B6FC8] hover:underline block"
          >
            View deal in HubSpot →
          </a>
          {selectedTemplateId && (() => {
            const tmpl = templates.find(t => t.id === selectedTemplateId)
            return tmpl ? (
              <div className="text-green-700 pt-1 border-t border-green-200">
                <span className="font-medium">Apply template in HubSpot:</span> {tmpl.name}
              </div>
            ) : null
          })()}
        </div>
      )}
    </div>
  )
}
