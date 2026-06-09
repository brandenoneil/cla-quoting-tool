import { hasExactSheetRow } from '@/lib/priceCheckNeighbors'
import { getAllowedLaserSources, getAllowedPowerLabels } from '@/lib/machineConstraints'
import { normalizeModel, parseKw, PRICE_TABLE } from '@/lib/pricingTable'

const SHEET_LABEL = 'Feb 2026 price sheet'

export function isModelOnSheet(modelRaw: string): boolean {
  const norm = normalizeModel(modelRaw || '')
  if (!norm.trim()) return false
  return Object.keys(PRICE_TABLE).some((key) => key.startsWith(`${norm}|`))
}

export function hasCurrentSheetPricing(
  modelRaw: string,
  laserRaw: string,
  powerRaw: string
): boolean {
  const model = modelRaw.trim()
  if (!model) return false
  return hasExactSheetRow(model, laserRaw, parseKw(powerRaw))
}

export function ratedPowerSummary(modelRaw: string, laserRaw: string): string {
  const allowed = getAllowedPowerLabels(modelRaw, laserRaw)
  return allowed.length > 0 ? allowed.join(', ') : ''
}

/** User-facing warning when this exact row has no list price on the sheet. */
export function noPricingMessage(modelRaw: string, powerRaw: string, laserRaw: string): string {
  const model = modelRaw.trim() || 'this machine'
  const power = powerRaw.trim() || 'this power rating'
  const laser = laserRaw.trim() || 'this laser'

  if (!isModelOnSheet(model)) {
    return `We don't have current pricing for ${model} on the ${SHEET_LABEL}. You can continue — machine base pricing will be TBD.`
  }

  const rated = ratedPowerSummary(model, laser)
  const ratedNote = rated ? ` Rated options on the sheet for ${laser}: ${rated}.` : ''

  return `We don't have current pricing for ${model} at ${power} with ${laser} on the ${SHEET_LABEL}. You can continue — machine base pricing will be TBD.${ratedNote}`
}

export interface PricingWarning {
  field: 'model' | 'power' | 'laser'
  message: string
}

/** Warnings for the review form (and anywhere the full machine row is shown). */
export function getReviewPricingWarnings(
  machine: {
    machineModel: string
    machinePower: string
    laserSource: string
  }
): PricingWarning[] {
  const { machineModel, machinePower, laserSource } = machine
  if (!machineModel.trim()) return []

  const warnings: PricingWarning[] = []
  const seen = new Set<string>()

  const push = (field: PricingWarning['field'], message: string) => {
    if (seen.has(message)) return
    seen.add(message)
    warnings.push({ field, message })
  }

  if (!isModelOnSheet(machineModel)) {
    push('model', noPricingMessage(machineModel, machinePower, laserSource))
    return warnings
  }

  const allowedLasers = getAllowedLaserSources(machineModel)
  if (allowedLasers.length > 0 && !allowedLasers.includes(laserSource as 'IPG' | 'Raycus')) {
    push('laser', noPricingMessage(machineModel, machinePower, laserSource))
  }

  if (!hasCurrentSheetPricing(machineModel, laserSource, machinePower)) {
    push('power', noPricingMessage(machineModel, machinePower, laserSource))
  }

  return warnings
}
