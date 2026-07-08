import type { MachineOption } from '@/types'
import type { PriceCheckMachineOptionEnriched } from '@/lib/priceCheckClient'
import { defaultMachineSelection } from '@/lib/priceCheckClient'
import { coerceBevelForModel, type BevelChoice } from '@/lib/machineConstraints'

export const LASER_FALLBACK = ['IPG', 'Raycus'] as const
export const BEVEL_UI_FALLBACK: BevelChoice[] = ['No', 'Yes']
export const POWER_FALLBACK = [
  '3kW',
  '6kW',
  '10kW',
  '12kW',
  '15kW',
  '20kW',
  '25kW',
  '30kW',
  '40kW',
  '50kW',
  '60kW',
]

export interface CatalogSelectionDraft {
  familyId: string
  sizeCode: string
  laserSource: string
  bevelHead: MachineOption['bevelHead']
  machinePower: string
}

export function parseKwLabel(power: string): number {
  const m = power.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 6
}

/** Machine lines that can be quoted above the current sheet ladder (e.g. 60kW on Fiber HD). */
export function modelSupports60Kw(sheetModel: string): boolean {
  const norm = sheetModel.trim().toLowerCase()
  return (
    norm.includes('fiber hd') ||
    norm.includes('plus evo') ||
    norm.includes('plus bevel')
  )
}

/** Off-sheet kWs that may still be quoted for this model (custom pricing, e.g. 60kW on Fiber HD). */
export function quotableOffSheetKws(sheetKws: number[], sheetModel: string): number[] {
  if (!modelSupports60Kw(sheetModel)) return []
  if (sheetKws.includes(60)) return []
  const maxSheet = sheetKws.length ? Math.max(...sheetKws) : 0
  return maxSheet >= 20 && maxSheet < 60 ? [60] : []
}

/** Sheet kW steps plus off-sheet selections (e.g. 60kW when the sheet tops out at 50kW). */
export function buildPowerSliderOptions(
  sheetKws: number[],
  machinePower: string,
  sheetModel: string
): string[] {
  const kws = new Set(sheetKws)
  const cur = parseKwLabel(machinePower)
  if (cur > 0) kws.add(cur)

  for (const kw of quotableOffSheetKws(sheetKws, sheetModel)) {
    kws.add(kw)
  }

  return Array.from(kws)
    .sort((a, b) => a - b)
    .map((k) => `${k}kW`)
}

export function pickDefaultSize(machine: PriceCheckMachineOptionEnriched | undefined): string {
  if (!machine?.sizes.length) return ''
  const prefer4020 = machine.sizes.find((s) => s.code === '4020')
  return prefer4020?.code ?? machine.sizes[0].code
}

export function snapPower(kws: number[], current: string, sheetModel = ''): string {
  if (!kws.length) return current
  const cur = parseKwLabel(current)
  if (kws.includes(cur)) return `${cur}kW`

  // Keep an off-sheet power only when this model can genuinely be quoted at it
  // (e.g. 60kW on Fiber HD). Otherwise snap to the nearest sheet power so a
  // stale selection doesn't follow the user across models and warn everywhere.
  if (sheetModel && quotableOffSheetKws(kws, sheetModel).includes(cur)) {
    return `${cur}kW`
  }

  let pick = kws[0]!
  let best = Infinity
  for (const k of kws) {
    const d = Math.abs(k - cur)
    if (d < best) {
      best = d
      pick = k
    }
  }
  return `${pick}kW`
}

export function constrainCatalogSelection(
  catalog: PriceCheckMachineOptionEnriched[],
  draft: CatalogSelectionDraft
): CatalogSelectionDraft {
  const machine = catalog.find((m) => m.id === draft.familyId)
  const size = machine?.sizes.find((s) => s.code === draft.sizeCode)
  if (!size) return draft

  const laser = size.allowedLasers.includes(draft.laserSource)
    ? draft.laserSource
    : size.allowedLasers[0] ?? 'IPG'
  const bevel = coerceBevelForModel(draft.bevelHead, size.sheetModel)
  const kws = size.kwByLaser[laser] ?? []
  const machinePower = kws.length
    ? snapPower(kws, draft.machinePower, size.sheetModel)
    : draft.machinePower

  return { ...draft, laserSource: laser, bevelHead: bevel, machinePower }
}

export function matchModelToCatalog(
  machineModel: string,
  catalog: PriceCheckMachineOptionEnriched[]
): { familyId: string; sizeCode: string } | null {
  const trimmed = machineModel.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  for (const family of catalog) {
    for (const size of family.sizes) {
      if (size.sheetModel.toLowerCase() === lower) {
        return { familyId: family.id, sizeCode: size.code }
      }
    }
  }
  return null
}

export function inferCatalogSelection(
  machineModel: string,
  machinePower: string,
  laserSource: string,
  bevelHead: MachineOption['bevelHead'],
  catalog: PriceCheckMachineOptionEnriched[]
): CatalogSelectionDraft {
  const matched = matchModelToCatalog(machineModel, catalog)
  if (matched) {
    return constrainCatalogSelection(catalog, {
      familyId: matched.familyId,
      sizeCode: matched.sizeCode,
      laserSource,
      bevelHead,
      machinePower: machinePower || '20kW',
    })
  }

  const d = defaultMachineSelection(catalog)
  return constrainCatalogSelection(catalog, {
    familyId: d.familyId,
    sizeCode: d.sizeCode,
    laserSource,
    bevelHead,
    machinePower: machinePower || '20kW',
  })
}

export function initialPriceCheckForm(catalog: PriceCheckMachineOptionEnriched[]): CatalogSelectionDraft {
  const d = defaultMachineSelection(catalog)
  return constrainCatalogSelection(catalog, {
    familyId: d.familyId,
    sizeCode: d.sizeCode,
    laserSource: 'IPG',
    bevelHead: 'No',
    machinePower: '20kW',
  })
}
