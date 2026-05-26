'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="cla-header-action text-sm"
    >
      Print
    </button>
  )
}
