import type { MachineOption } from '@/types'
import { PRICE_TABLE, normalizeLaser, normalizeModel } from '@/lib/pricingTable'

/** UI labels matching ReviewForm radios — only sources offered on Cutlite America quotes */
export const LASER_SOURCE_LABELS = ['IPG', 'Raycus'] as const
export type LaserSourceUi = (typeof LASER_SOURCE_LABELS)[number]

// ─── Laser canonicalization (intake/API/legacy DB strings) ───

export function canonicalLaserSource(raw: string | undefined | null): LaserSourceUi {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return 'IPG'
  if (s.includes('raycus') || s.includes('racus')) return 'Raycus'
  if (s.includes('ipg')) return 'IPG'
  // Discontinued sources — coerce to IPG when loading legacy deals/quotes
  if (s.includes('nlight') || s.includes('n-light') || s.includes('coherent')) return 'IPG'
  return 'IPG'
}

// ─── Which lasers appear on the Feb 2026 sheet for this normalized model ───

let lasersByNormalizedModel: Map<string, Set<'IPG' | 'Raycus'>> | null = null

function sheetLasersForModel(): Map<string, Set<'IPG' | 'Raycus'>> {
  if (!lasersByNormalizedModel) {
    const map = new Map<string, Set<'IPG' | 'Raycus'>>()
    for (const key of Object.keys(PRICE_TABLE)) {
      const [model, laser] = key.split('|')
      if (laser !== 'IPG' && laser !== 'Raycus') continue
      if (!map.has(model)) map.set(model, new Set())
      map.get(model)!.add(laser as 'IPG' | 'Raycus')
    }
    lasersByNormalizedModel = map
  }
  return lasersByNormalizedModel
}

/** Lasers selectable in the UI for this raw model field; unknown / empty model → all options. */
export function getAllowedLaserSources(machineModelRaw: string): LaserSourceUi[] {
  const norm = normalizeModel(machineModelRaw || '')
  if (!norm.trim()) return [...LASER_SOURCE_LABELS]

  const sheet = sheetLasersForModel().get(norm)
  if (!sheet || sheet.size === 0) return [...LASER_SOURCE_LABELS]

  const labels: LaserSourceUi[] = []
  if (sheet.has('IPG')) labels.push('IPG')
  if (sheet.has('Raycus')) labels.push('Raycus')
  return labels.length > 0 ? labels : [...LASER_SOURCE_LABELS]
}

/** If current laser is incompatible with model, snap to IPG or first allowed sheet option. */
export function coerceLaserSourceForModel(current: string, machineModelRaw: string): LaserSourceUi {
  const want = canonicalLaserSource(current)
  const allowed = getAllowedLaserSources(machineModelRaw)
  if (allowed.includes(want)) return want
  if (allowed.includes('IPG')) return 'IPG'
  return allowed[0] ?? 'IPG'
}

let kwByModelLaser: Map<string, number[]> | null = null

/** One pass over PRICE_TABLE — used by enrich + price-check (avoids O(n×sheet) scans). */
function sheetKwByModelLaser(): Map<string, number[]> {
  if (!kwByModelLaser) {
    const map = new Map<string, number[]>()
    for (const key of Object.keys(PRICE_TABLE)) {
      const [model, laser, kwStr] = key.split('|')
      if (laser !== 'IPG' && laser !== 'Raycus') continue
      const bk = `${model}|${laser}`
      const kw = parseInt(kwStr, 10)
      if (Number.isNaN(kw)) continue
      if (!map.has(bk)) map.set(bk, [])
      map.get(bk)!.push(kw)
    }
    for (const [bk, kws] of Array.from(map.entries())) {
      const sorted = kws.slice().sort((a, b) => a - b)
      map.set(bk, sorted.filter((v, i, a) => i === 0 || a[i - 1] !== v))
    }
    kwByModelLaser = map
  }
  return kwByModelLaser
}

/** kW values present on the Feb 2026 sheet for this model + laser (after coercion). */
export function getSheetKwListForModelLaser(machineModelRaw: string, laserSourceRaw: string): number[] {
  const norm = normalizeModel(machineModelRaw || '')
  if (!norm.trim()) return []

  const laserUi = coerceLaserSourceForModel(laserSourceRaw, machineModelRaw)
  const sheetLaser = normalizeLaser(laserUi)
  return sheetKwByModelLaser().get(`${norm}|${sheetLaser}`) ?? []
}

/** Power labels selectable in the UI for this model + laser. */
export function getAllowedPowerLabels(machineModelRaw: string, laserSourceRaw: string): string[] {
  const kws = getSheetKwListForModelLaser(machineModelRaw, laserSourceRaw)
  if (kws.length === 0) return []
  return kws.map((kw) => `${kw}kW`)
}

export function coercePowerForModel(
  currentPower: string,
  machineModelRaw: string,
  laserSourceRaw: string
): string {
  const allowed = getAllowedPowerLabels(machineModelRaw, laserSourceRaw)
  if (allowed.length === 0) return currentPower || '6kW'
  if (allowed.includes(currentPower)) return currentPower
  const wantKw = parseInt(currentPower.replace(/\D/g, ''), 10) || 6
  let best = allowed[0]
  let bestDiff = Infinity
  for (const label of allowed) {
    const kw = parseInt(label.replace(/\D/g, ''), 10)
    const diff = Math.abs(kw - wantKw)
    if (diff < bestDiff) {
      bestDiff = diff
      best = label
    }
  }
  return best
}

// ─── Cutting head availability (product-family rules) ───

export function getAllowedBevelHeads(machineModelRaw: string): MachineOption['bevelHead'][] {
  const norm = normalizeModel(machineModelRaw || '')
  if (!norm.trim()) return ['None', 'Basic Bevel', 'Plus Bevel']
  if (/^PLUS\s+Evo\b/i.test(norm)) return ['None']
  if (/^PLUS\s+Bevel\b/i.test(norm)) return ['Plus Bevel']
  return ['None', 'Basic Bevel', 'Plus Bevel']
}

export function coerceBevelHeadForModel(
  current: MachineOption['bevelHead'],
  machineModelRaw: string
): MachineOption['bevelHead'] {
  const allowed = getAllowedBevelHeads(machineModelRaw)
  if (allowed.includes(current)) return current
  return allowed[0]!
}
