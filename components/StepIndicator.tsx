'use client'

const STEPS = [
  { id: 1, label: 'Select Deal' },
  { id: 2, label: 'Intake' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Quote Options' },
  { id: 5, label: 'Publish' },
]

interface Props {
  currentStep: number
}

export default function StepIndicator({ currentStep }: Props) {
  return (
    <div className="flex items-center justify-center py-5 mb-8 overflow-x-auto">
      {STEPS.map((step, idx) => (
        <div key={step.id} className="flex items-center shrink-0">
          <div
            className="flex flex-col items-center animate-cla-fade"
            style={{ animationDelay: `${idx * 45}ms` }}
          >
            <div
              className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ease-cla-out ${
                step.id < currentStep
                  ? 'bg-brand-steel text-white shadow-md scale-100'
                  : step.id === currentStep
                  ? 'bg-[#0A2E52] text-white ring-4 ring-brand-steel/25 shadow-lg scale-105'
                  : 'bg-brand-rule-gray/50 text-brand-text-muted'
              }`}
            >
              {step.id === currentStep && (
                <span
                  className="absolute inset-0 rounded-full border border-white/20 animate-ping opacity-40"
                  style={{ animationDuration: '2.4s' }}
                  aria-hidden
                />
              )}
              {step.id < currentStep ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.id
              )}
            </div>
            <span
              className={`mt-2 text-[11px] whitespace-nowrap transition-colors duration-200 ${
                step.id === currentStep ? 'text-[#0A2E52] font-semibold' : 'text-brand-text-muted'
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className="w-10 sm:w-14 h-0.5 mb-7 mx-0.5 sm:mx-1 rounded-full bg-brand-rule-gray/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-cla-out ${
                  step.id < currentStep ? 'w-full bg-gradient-to-r from-brand-steel to-[#0A2E52]' : 'w-0'
                }`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
