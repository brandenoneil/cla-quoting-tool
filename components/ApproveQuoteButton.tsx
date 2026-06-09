'use client'

import { useState } from 'react'

interface Props {
  quoteId: string
  dealerEmail?: string | null
}

export default function ApproveQuoteButton({ quoteId, dealerEmail }: Props) {
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<{ success?: boolean; error?: string; dealLink?: string } | null>(null)

  async function handleApprove() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/approve`, { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResult({ success: true, dealLink: json.dealLink })
    } catch (e: any) {
      setResult({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  if (result?.success) {
    return (
      <div className="cla-alert-success space-y-1.5">
        <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Quote approved
        </div>
        {result.dealLink && (
          <a
            href={result.dealLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#1B6FC8] hover:underline block"
          >
            View deal in HubSpot →
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="cla-elevated p-5 space-y-3 border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white">
      <div>
        <p className="text-sm font-semibold text-amber-800">Dealer Quote Request</p>
        {dealerEmail && (
          <p className="text-xs text-amber-700 mt-0.5">Submitted by: {dealerEmail}</p>
        )}
      </div>

      {result?.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {result.error}
        </div>
      )}

      <button
        onClick={handleApprove}
        disabled={loading}
        className="cla-btn-gold w-full py-2.5 text-sm disabled:active:scale-100"
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Approving…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Approve &amp; publish to HubSpot
          </>
        )}
      </button>
    </div>
  )
}
