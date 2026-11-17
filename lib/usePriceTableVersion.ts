'use client'

import { useSyncExternalStore } from 'react'
import { getPriceTableVersion, subscribePriceTable } from '@/lib/pricingTable'

/** Re-renders the calling component whenever the price table rows are replaced. */
export function usePriceTableVersion(): number {
  return useSyncExternalStore(subscribePriceTable, getPriceTableVersion, getPriceTableVersion)
}
