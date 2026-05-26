'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  quoteId: string
  quoteNumber: string
  isPublished: boolean
}

export default function DeleteQuoteButton({ quoteId, quoteNumber, isPublished }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      router.push('/')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 border border-red-400/60 text-red-300 text-xs rounded-lg hover:bg-red-900/30 transition-colors"
      >
        Delete
      </button>

      {open && (
        <div className="fixed inset-0 bg-[#061a31]/45 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-cla-fade">
          <div className="cla-glass-panel max-w-md w-full p-6 animate-cla-scale-in shadow-cla-login">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-base">Delete {quoteNumber}?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isPublished
                    ? 'This will permanently delete the quote from this tool and remove it from HubSpot.'
                    : 'This will permanently delete the quote from this tool.'}
                  {' '}This cannot be undone.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setOpen(false); setError('') }}
                disabled={deleting}
                className="cla-btn-secondary px-4 py-2 text-sm disabled:active:scale-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isPublished ? 'Deleting from HubSpot…' : 'Deleting…'}
                  </>
                ) : (
                  'Delete permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
