'use client'

import { useEffect } from 'react'
import { setPriceTable, type PriceRow } from '@/lib/pricingTable'

const REFRESH_MS = 60_000

async function pullPriceTable() {
  try {
    const res = await fetch('/api/pricing/table', { cache: 'no-store' })
    if (!res.ok) return
    const data: { signature: string; rows: Record<string, PriceRow> } = await res.json()
    setPriceTable(data.rows, data.signature)
  } catch {
    // Keep the rows already loaded.
  }
}

/**
 * Seeds the browser's price table with the rows the server rendered with, then keeps it current.
 * Must render before any component that reads prices.
 */
export default function PriceTableSync({
  signature,
  rows,
}: {
  signature: string
  rows: Record<string, PriceRow>
}) {
  // During render so components below hydrate with the same rows the server used.
  setPriceTable(rows, signature, { notify: false })

  useEffect(() => {
    const onFocus = () => void pullPriceTable()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(pullPriceTable, REFRESH_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [])

  return null
}
