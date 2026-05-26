'use client'

/**
 * Root error boundary — must define its own &lt;html&gt; and &lt;body&gt;.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#F8F7F5] text-[#4A4A4A] p-6">
        <div className="max-w-md mx-auto mt-16 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h1 className="text-lg font-bold">Application error</h1>
          <p className="mt-2 text-sm">{error.message || 'Please refresh the page.'}</p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 w-full rounded-xl bg-[#0A2E52] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
