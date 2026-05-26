import { PRICE_TABLE } from '@/lib/pricingTable'
import { splitModelForSort } from '@/lib/priceCheckNeighbors'

export interface PriceCheckSizeOption {
  /** Numeric footprint on the sheet (e.g. `4020`, `12030`, `TL4`). */
  code: string
  /** Human size in meters, e.g. `4.0 × 2.0 m`. */
  label: string
  /** Same footprint in feet, e.g. `13.1 × 6.6 ft` — empty when not a rectangular table code. */
  feetLabel: string
  /** Full model string passed to pricing (`FAST 4020`, `Fiber Tube TL4`). */
  sheetModel: string
}

/** Server-enriched size row for dealer UI (keeps PRICE_TABLE off the client bundle). */
export interface PriceCheckSizeOptionEnriched extends PriceCheckSizeOption {
  allowedLasers: string[]
  kwByLaser: Record<string, number[]>
  allowedBevels: string[]
}

export interface PriceCheckMachineOptionEnriched extends Omit<PriceCheckMachineOption, 'sizes'> {
  sizes: PriceCheckSizeOptionEnriched[]
}

const METERS_TO_FEET = 3.280839895

function formatFeetFromMeters(meters: number): string {
  const ft = meters * METERS_TO_FEET
  const rounded = Math.round(ft * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Length × width in meters for standard sheet size codes; null for tube / unknown. */
export function parseTableSizeMeters(code: string): { lengthM: number; widthM: number } | null {
  const c = code.trim()
  if (/^\d{4}$/.test(c)) {
    return {
      lengthM: parseInt(c.slice(0, 2), 10) / 10,
      widthM: parseInt(c.slice(2, 4), 10) / 10,
    }
  }
  if (/^\d{5}$/.test(c)) {
    return {
      lengthM: parseInt(c.slice(0, 3), 10) / 10,
      widthM: parseInt(c.slice(3, 5), 10) / 10,
    }
  }
  return null
}

export interface PriceCheckMachineOption {
  /** Product family id (matches sheet prefix), e.g. `FAST`, `Fiber HD`, `PLUS Bevel`. */
  id: string
  label: string
  sizes: PriceCheckSizeOption[]
}

/** Turn a sheet size code into meters (length × width). */
export function formatSizeInMeters(code: string): string {
  const c = code.trim()
  if (/^TL\d+$/i.test(c)) {
    const n = c.replace(/^TL/i, '')
    return `Tube TL${n}`
  }
  const dims = parseTableSizeMeters(c)
  if (dims) {
    return `${dims.lengthM} × ${dims.widthM} m`
  }
  return c
}

/** Imperial equivalent of {@link formatSizeInMeters} for rectangular table sizes. */
export function formatSizeInFeet(code: string): string {
  const dims = parseTableSizeMeters(code)
  if (!dims) return ''
  return `${formatFeetFromMeters(dims.lengthM)} × ${formatFeetFromMeters(dims.widthM)} ft`
}

/** Product families omitted from dealer quick price check (still on internal sheet). */
const DEALER_HIDDEN_FAMILIES = new Set(['LME'])

const FAMILY_SORT: Record<string, number> = {
  FAST: 10,
  XME: 30,
  XMF: 40,
  'Fiber HD': 50,
  'PLUS Bevel': 60,
  'Fiber Tube': 70,
}

function familySortKey(family: string): number {
  return FAMILY_SORT[family] ?? 100 + family.charCodeAt(0)
}

/** Dealer-facing machine list + sizes derived only from Feb 2026 sheet keys (no prices). */
export function buildPriceCheckCatalog(): PriceCheckMachineOption[] {
  const byFamily = new Map<string, Map<string, string>>()

  for (const key of Object.keys(PRICE_TABLE)) {
    const model = key.split('|')[0]
    const parts = splitModelForSort(model)
    if (!parts || DEALER_HIDDEN_FAMILIES.has(parts.family)) continue

    let sizeCode: string
    if (parts.family === 'Fiber Tube') {
      const tl = /^Fiber Tube (TL\d+)$/i.exec(parts.fullModel)
      sizeCode = tl ? tl[1] : String(parts.sortNumeric)
    } else {
      sizeCode = String(parts.sortNumeric)
    }

    if (!byFamily.has(parts.family)) byFamily.set(parts.family, new Map())
    byFamily.get(parts.family)!.set(sizeCode, parts.fullModel)
  }

  const machines: PriceCheckMachineOption[] = []
  for (const [family, sizeMap] of Array.from(byFamily.entries()).sort(
    (a, b) => familySortKey(a[0]) - familySortKey(b[0]) || a[0].localeCompare(b[0])
  )) {
    if (DEALER_HIDDEN_FAMILIES.has(family)) continue
    const sizes = Array.from(sizeMap.entries())
      .sort((a, b) => {
        const na = parseInt(a[0].replace(/\D/g, ''), 10) || 0
        const nb = parseInt(b[0].replace(/\D/g, ''), 10) || 0
        return na - nb || a[0].localeCompare(b[0])
      })
      .map(([code, sheetModel]) => ({
        code,
        label: formatSizeInMeters(code),
        feetLabel: formatSizeInFeet(code),
        sheetModel,
      }))

    machines.push({
      id: family,
      label: family === 'Fiber HD' ? 'Fiber HD' : family,
      sizes,
    })
  }

  return machines
}

export {
  defaultMachineSelection,
  findMachineOption,
  resolveSheetModel,
} from '@/lib/priceCheckClient'
