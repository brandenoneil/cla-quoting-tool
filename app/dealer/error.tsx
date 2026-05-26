'use client'

import { useEffect } from 'react'

export default function DealerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dealer/error]', error)
  }, [error])

  return (
    <div className="cla-page-canvas min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
        <h1 className="text-lg font-bold">Dealer portal error</h1>
        <p className="mt-2 text-sm">{error.message || 'Could not load this page.'}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={() => reset()} className="cla-btn-primary w-full py-2.5 text-sm">
            Try again
          </button>
          <a href="/dealer" className="text-center text-sm font-semibold text-[#1B6FC8] hover:underline">
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
