'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import QuickPriceCheck from '@/components/QuickPriceCheck'
import type { PriceCheckMachineOptionEnriched } from '@/lib/priceCheckClient'

type Props = {
  catalog: PriceCheckMachineOptionEnriched[]
  embed?: boolean
  user?: { name?: string | null; email?: string | null }
}

class PriceCheckErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[dealer/price-check]', err, info.componentStack)
  }

  render() {
    if (this.state.err) {
      return (
        <div className="cla-page-canvas min-h-screen p-6">
          <div className="max-w-2xl rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
            <h1 className="font-bold text-lg">Price check could not load</h1>
            <p className="mt-2 text-sm font-mono whitespace-pre-wrap break-words">{this.state.err.message}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** Catalog is built on the server and passed in — avoids a hung client fetch. */
export default function DealerPriceCheckClient(props: Props) {
  return (
    <PriceCheckErrorBoundary>
      <QuickPriceCheck catalog={props.catalog} embed={props.embed} user={props.user} />
    </PriceCheckErrorBoundary>
  )
}
