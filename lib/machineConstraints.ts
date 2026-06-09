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
  const trimmed = (currentPower || '').trim()

  // Normalize "60 kW" → "60kW"
  const kwMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*kW$/i)
  if (kwMatch) {
    return `${Math.round(parseFloat(kwMatch[1]))}kW`
  }

  if (!trimmed) {
    return allowed[0] ?? '6kW'
  }

  // Keep explicit power even when off-sheet — pricing will be TBD
  if (allowed.includes(trimmed)) return trimmed
  if (/\d/.test(trimmed)) return trimmed

  if (allowed.length === 0) return trimmed || '6kW'

  const wantKw = parseInt(trimmed.replace(/\D/g, ''), 10) || 6
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

// ─── Bevel (Yes/No only — PLUS Bevel is a machine name, not a bevel type) ───

export type BevelChoice = 'Yes' | 'No'

/** Machine family whose base price already includes bevel (PLUS Bevel line). */
export function isPlusBevelMachineModel(machineModelRaw: string): boolean {
  return /^PLUS\s+Bevel\b/i.test(normalizeModel(machineModelRaw || ''))
}

export function normalizeBevelChoice(raw: string | undefined | null): BevelChoice {
  const s = (raw ?? '').trim().toLowerCase()
  if (s === 'yes' || s === 'true') return 'Yes'
  if (s === 'no' || s === 'false' || s === 'none' || !s) return 'No'
  // Legacy stored values and line-item text → Yes
  if (s.includes('bevel') && !s.includes('no bevel')) return 'Yes'
  if (s.includes('basic') || s.includes('plus')) return 'Yes'
  return 'No'
}

export function coerceBevelForModel(
  current: string | undefined | null,
  machineModelRaw: string
): BevelChoice {
  const norm = normalizeModel(machineModelRaw || '')
  let choice = normalizeBevelChoice(current)

  if (isPlusBevelMachineModel(machineModelRaw)) return 'Yes'
  if (/^PLUS\s+Evo\b/i.test(norm) || /^FIBER\s+Fast\b/i.test(norm) || /^XME\b/i.test(norm)) {
    return 'No'
  }
  return choice
}

/** @deprecated Use coerceBevelForModel */
export const coerceBevelHeadForModel = coerceBevelForModel

export function getBevelUiOptions(machineModelRaw: string): {
  yesDisabled: boolean
  noDisabled: boolean
} {
  if (isPlusBevelMachineModel(machineModelRaw)) {
    return { yesDisabled: false, noDisabled: true }
  }
  const norm = normalizeModel(machineModelRaw || '')
  if (/^PLUS\s+Evo\b/i.test(norm) || /^FIBER\s+Fast\b/i.test(norm) || /^XME\b/i.test(norm)) {
    return { yesDisabled: true, noDisabled: false }
  }
  return { yesDisabled: false, noDisabled: false }
}

export function getAllowedBevelChoices(machineModelRaw: string): BevelChoice[] {
  const { yesDisabled, noDisabled } = getBevelUiOptions(machineModelRaw)
  const choices: BevelChoice[] = []
  if (!noDisabled) choices.push('No')
  if (!yesDisabled) choices.push('Yes')
  return choices.length > 0 ? choices : ['No']
}

/** @deprecated Use getAllowedBevelChoices */
export function getAllowedBevelHeads(machineModelRaw: string): BevelChoice[] {
  return getAllowedBevelChoices(machineModelRaw)
}

export function parseBevelFromIntake(
  raw: string | undefined | null,
  machineModelRaw: string
): BevelChoice {
  return coerceBevelForModel(raw, machineModelRaw)
}
