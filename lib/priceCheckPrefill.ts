import type { MachineOption } from '@/types'

const STORAGE_KEY = 'cla.priceCheckPrefill'

export interface PriceCheckPrefill {
  machineModel: string
  machinePower: string
  laserSource: string
  bevelHead: MachineOption['bevelHead']
}

export function savePriceCheckPrefill(data: PriceCheckPrefill): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadPriceCheckPrefill(): PriceCheckPrefill | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PriceCheckPrefill
  } catch {
    return null
  }
}

export function clearPriceCheckPrefill(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

export function priceCheckPrefillToIntake(prefill: PriceCheckPrefill): Record<string, unknown> {
  return {
    model: prefill.machineModel,
    power: prefill.machinePower,
    laser: prefill.laserSource,
    bevel: prefill.bevelHead,
  }
}
