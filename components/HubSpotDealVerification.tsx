import type { HubSpotDealVerification } from '@/lib/hubspotDealVerification'

interface Props {
  verification: HubSpotDealVerification
}

function CheckIcon({ passed }: { passed: boolean }) {
  if (passed) {
    return (
      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function HubSpotDealVerificationPanel({ verification }: Props) {
  const criticalChecks = verification.checks.filter((c) => c.critical)
  const optionalChecks = verification.checks.filter((c) => !c.critical)
  const optionalPassed = optionalChecks.filter((c) => c.passed).length

  return (
    <div
      className={`mb-6 max-w-md mx-auto text-left rounded-xl border p-4 ${
        verification.verified
          ? 'bg-green-50/80 border-green-200'
          : 'bg-amber-50/80 border-amber-200'
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        {verification.verified ? (
          <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <div>
          <p className={`text-sm font-semibold ${verification.verified ? 'text-green-800' : 'text-amber-800'}`}>
            {verification.verified ? 'CRM verification passed' : 'CRM verification needs attention'}
          </p>
          <p className={`text-xs mt-0.5 ${verification.verified ? 'text-green-700' : 'text-amber-700'}`}>
            {verification.verified
              ? 'Your deal and quote draft are in HubSpot — Cutlite sales can review and send.'
              : 'Your request was saved, but HubSpot did not pass every required check. Our team has been notified.'}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {criticalChecks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <CheckIcon passed={c.passed} />
            <div>
              <span className={`font-medium ${c.passed ? 'text-gray-800' : 'text-amber-900'}`}>{c.label}</span>
              <p className="text-gray-600 mt-0.5 leading-snug">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {optionalChecks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-black/5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Additional checks ({optionalPassed}/{optionalChecks.length})
          </p>
          <ul className="space-y-2">
            {optionalChecks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-xs">
                <CheckIcon passed={c.passed} />
                <div>
                  <span className={`font-medium ${c.passed ? 'text-gray-800' : 'text-gray-600'}`}>{c.label}</span>
                  <p className="text-gray-500 mt-0.5 leading-snug">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
