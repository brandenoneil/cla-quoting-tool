import { PRICE_TABLE, normalizeLaser, normalizeModel } from '@/lib/pricingTable'

export type NeighborMode = 'format' | 'power'

/** Parsed model footprint for grouping formats within one product series (derived from PRICE_TABLE keys). */
export interface ModelFormatParts {
  family: string
  sortNumeric: number
  fullModel: string
}

/** Split canonical sheet model names into ordered format parts for neighbor logic. */
export function splitModelForSort(modelNorm: string): ModelFormatParts | null {
  const ft = /^Fiber Tube (TL\d+)$/i.exec(modelNorm.trim())
  if (ft) {
    const n = parseInt(ft[1].replace(/\D/g, ''), 10) || 0
    return { family: 'Fiber Tube', sortNumeric: n, fullModel: modelNorm }
  }
  const m = /^(.+?)\s+(\d{4,5})$/.exec(modelNorm.trim())
  if (!m) return null
  return {
    family: m[1].trim(),
    sortNumeric: parseInt(m[2], 10),
    fullModel: modelNorm,
  }
}

/** Build `{ family }|{laser}|{kw}` → sorted unique models seen on the sheet (format neighbor axis). */
function buildFormatBuckets(): Map<string, ModelFormatParts[]> {
  const byBucket = new Map<string, Map<string, ModelFormatParts>>()

  for (const key of Object.keys(PRICE_TABLE)) {
    const [model, laser, kwStr] = key.split('|')
    const parts = splitModelForSort(model)
    if (!parts) continue
    const bucketKey = `${parts.family}|${laser}|${kwStr}`
    if (!byBucket.has(bucketKey)) byBucket.set(bucketKey, new Map())
    byBucket.get(bucketKey)!.set(parts.fullModel, parts)
  }

  const out = new Map<string, ModelFormatParts[]>()
  for (const [bk, mm] of Array.from(byBucket.entries())) {
    const arr = Array.from(mm.values()).sort(
      (a, b) => a.sortNumeric - b.sortNumeric || a.fullModel.localeCompare(b.fullModel)
    )
    out.set(bk, arr)
  }
  return out
}

const formatBuckets = buildFormatBuckets()

/** `{ modelNorm }|{laserSheet}` → ascending unique kW values on the sheet (power neighbor axis). */
function buildPowerLists(): Map<string, number[]> {
  const kwBy = new Map<string, number[]>()
  for (const key of Object.keys(PRICE_TABLE)) {
    const [model, laser, kwStr] = key.split('|')
    const bk = `${model}|${laser}`
    if (!kwBy.has(bk)) kwBy.set(bk, [])
    kwBy.get(bk)!.push(parseInt(kwStr, 10))
  }
  const out = new Map<string, number[]>()
  for (const [bk, kws] of Array.from(kwBy.entries())) {
    const sorted = kws.slice().sort((a, b) => a - b)
    const uniq = sorted.filter((v, i) => i === 0 || sorted[i - 1] !== v)
    out.set(bk, uniq)
  }
  return out
}

const powerLists = buildPowerLists()

export function getFormatNeighborModels(
  normalizedModel: string,
  laserSheet: 'IPG' | 'Raycus',
  kw: number
): { down: string | null; up: string | null } {
  const parts = splitModelForSort(normalizedModel)
  if (!parts) return { down: null, up: null }
  const bucketKey = `${parts.family}|${laserSheet}|${kw}`
  const list = formatBuckets.get(bucketKey)
  if (!list?.length) return { down: null, up: null }
  const idx = list.findIndex((p) => p.fullModel === normalizedModel)
  if (idx < 0) return { down: null, up: null }
  return {
    down: idx > 0 ? list[idx - 1].fullModel : null,
    up: idx < list.length - 1 ? list[idx + 1].fullModel : null,
  }
}

/** Pick nearest sheet kW to the request, then return adjacent kWs at fixed model + laser. */
export function getPowerNeighborKws(
  normalizedModel: string,
  laserSheet: 'IPG' | 'Raycus',
  requestedKw: number
): { resolvedKw: number; down: number | null; up: number | null } {
  const bk = `${normalizedModel}|${laserSheet}`
  const kws = powerLists.get(bk)
  if (!kws?.length) return { resolvedKw: requestedKw, down: null, up: null }

  let idx = kws.indexOf(requestedKw)
  if (idx < 0) {
    let bestI = 0
    let bestDiff = Infinity
    for (let i = 0; i < kws.length; i++) {
      const diff = Math.abs(kws[i] - requestedKw)
      if (diff < bestDiff) {
        bestDiff = diff
        bestI = i
      }
    }
    idx = bestI
  }

  const resolvedKw = kws[idx]
  return {
    resolvedKw,
    down: idx > 0 ? kws[idx - 1] : null,
    up: idx < kws.length - 1 ? kws[idx + 1] : null,
  }
}

export function kwToPowerLabel(kw: number): string {
  return `${kw}kW`
}

export function hasExactSheetRow(modelRaw: string, laserSourceLabel: string, kw: number): boolean {
  const laser = normalizeLaser(laserSourceLabel)
  const modelNorm = normalizeModel(modelRaw)
  return !!PRICE_TABLE[`${modelNorm}|${laser}|${kw}`]
}
