import { unstable_cache } from 'next/cache'
import { hubspotProductsToPriceTable, type HubSpotProductLite } from '@/lib/hubspotPriceParse'
import { setPriceTable, type PriceRow } from '@/lib/pricingTable'

const BASE_URL = 'https://api.hubapi.com'
/** Collapse bursts (one page load fires several pricing requests) into a single HubSpot check. */
const RECHECK_MS = 10_000
/** Fewer machine rows than this means a partial or wrong response — keep the previous table. */
const MIN_MACHINE_ROWS = 200

function token(): string {
  return (process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? '').trim()
}

async function hubspotJson(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HubSpot products ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

/** One cheap call: product count + newest modification time. Changes whenever any product is added, edited or removed. */
async function fetchProductsSignature(): Promise<string> {
  const data = await hubspotJson('/crm/v3/objects/products/search', {
    method: 'POST',
    body: JSON.stringify({
      limit: 1,
      properties: ['hs_lastmodifieddate'],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    }),
  })
  const newest = data.results?.[0]?.properties?.hs_lastmodifieddate ?? ''
  return `${data.total ?? 0}:${newest}`
}

async function fetchAllProducts(): Promise<HubSpotProductLite[]> {
  const all: HubSpotProductLite[] = []
  let after: string | undefined
  do {
    const qs = new URLSearchParams({ limit: '100', properties: 'name,price,createdate,hs_status' })
    if (after) qs.set('after', after)
    const page = await hubspotJson(`/crm/v3/objects/products?${qs}`)
    for (const r of page.results ?? []) all.push(r.properties ?? {})
    after = page.paging?.next?.after
  } while (after)
  return all
}

/** Full download, shared across server instances and keyed by signature so it reruns only when HubSpot changed. */
const loadRowsForSignature = unstable_cache(
  async (_signature: string): Promise<Record<string, PriceRow>> => {
    const rows = hubspotProductsToPriceTable(await fetchAllProducts())
    const count = Object.keys(rows).length
    if (count < MIN_MACHINE_ROWS) {
      throw new Error(`HubSpot returned only ${count} machine prices`)
    }
    return rows
  },
  ['hubspot-price-table-v1'],
  { revalidate: 86_400 }
)

let lastCheckAt = 0
let loadedSignature: string | null = null
let inFlight: Promise<void> | null = null

async function refresh(): Promise<void> {
  try {
    const signature = await fetchProductsSignature()
    if (signature !== loadedSignature) {
      setPriceTable(await loadRowsForSignature(signature), `hubspot:${signature}`)
      loadedSignature = signature
    }
  } catch (err) {
    // Keep whatever is loaded (last good HubSpot table, or the built-in fallback).
    console.error('[pricing] HubSpot price list unavailable:', err instanceof Error ? err.message : err)
  } finally {
    lastCheckAt = Date.now()
  }
}

/**
 * Call before any server-side price lookup. Asks HubSpot whether products changed and reloads
 * the price table if so; never throws.
 */
export async function ensurePriceTable(): Promise<void> {
  if (!token()) return
  if (Date.now() - lastCheckAt < RECHECK_MS) return
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
