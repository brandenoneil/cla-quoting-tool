'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
  }, [error])

  return (
    <div className="cla-page-canvas min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm">
        <h1 className="text-lg font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-red-800">{error.message || 'An unexpected error occurred.'}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 cla-btn-primary w-full py-2.5 text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
