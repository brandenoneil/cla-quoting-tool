import { normalizeModel } from '@/lib/pricingTable'
import type { MachineOption } from '@/types'

export type MachineFamily =
  | 'FAST'
  | 'XME'
  | 'XMF'
  | 'LME'
  | 'PLUS_BEVEL'
  | 'PLUS_EVO'
  | 'FIBER_HD'
  | 'FIBER_TUBE'
  | 'OTHER'

export function getMachineFamily(machineModelRaw: string): MachineFamily {
  const norm = normalizeModel(machineModelRaw || '')
  if (/^FAST\b/i.test(norm)) return 'FAST'
  if (/^XME\b/i.test(norm)) return 'XME'
  if (/^XMF\b/i.test(norm)) return 'XMF'
  if (/^LME\b/i.test(norm)) return 'LME'
  if (/^PLUS\s+Bevel\b/i.test(norm)) return 'PLUS_BEVEL'
  if (/^PLUS\s+Evo\b/i.test(norm)) return 'PLUS_EVO'
  if (/^Fiber\s+HD\b/i.test(norm)) return 'FIBER_HD'
  if (/^Fiber\s+Tube\b/i.test(norm)) return 'FIBER_TUBE'
  return 'OTHER'
}

/** Families that support SMART Flow load/unload automation (with or without tower). */
const AUTOMATION_FAMILIES = new Set<MachineFamily>(['FAST', 'PLUS_BEVEL', 'PLUS_EVO'])

export function isAutomationAllowed(machineModelRaw: string): boolean {
  return AUTOMATION_FAMILIES.has(getMachineFamily(machineModelRaw))
}

export function coerceAutomationForModel(
  current: MachineOption['automation'],
  machineModelRaw: string
): MachineOption['automation'] {
  if (current === 'None' || isAutomationAllowed(machineModelRaw)) return current
  return 'None'
}

/** SMART Door only on table sizes 3015–6025 per price sheet add-on notes. */
export function isSmartDoorAllowed(machineModelRaw: string): boolean {
  const m = normalizeModel(machineModelRaw || '').match(/(\d{4,5})$/)
  if (!m) return true
  const code = parseInt(m[1], 10)
  return code >= 3015 && code <= 6025
}

export interface AllowedSmartOptions {
  smartMix: boolean
  smartChanger: boolean
  smartGrease: boolean
  smartDoor: boolean
  smartRaster: boolean
  smartSetUp: boolean
}

export function getAllowedSmartOptions(machineModelRaw: string): AllowedSmartOptions {
  const family = getMachineFamily(machineModelRaw)
  const door = isSmartDoorAllowed(machineModelRaw)
  if (family === 'FIBER_HD' || family === 'FIBER_TUBE' || family === 'OTHER') {
    return {
      smartMix: false,
      smartChanger: false,
      smartGrease: false,
      smartDoor: door,
      smartRaster: false,
      smartSetUp: false,
    }
  }
  return {
    smartMix: true,
    smartChanger: true,
    smartGrease: true,
    smartDoor: door,
    smartRaster: true,
    smartSetUp: isAutomationAllowed(machineModelRaw),
  }
}

export function coerceSmartOptionsForModel(
  machine: Pick<
    MachineOption,
    | 'machineModel'
    | 'smartMix'
    | 'smartChanger'
    | 'smartGrease'
    | 'smartDoor'
    | 'smartRaster'
    | 'smartSetUp'
    | 'automation'
  >
): Pick<
  MachineOption,
  'smartMix' | 'smartChanger' | 'smartGrease' | 'smartDoor' | 'smartRaster' | 'smartSetUp' | 'automation'
> {
  const allowed = getAllowedSmartOptions(machine.machineModel)
  return {
    smartMix: allowed.smartMix && machine.smartMix,
    smartChanger: allowed.smartChanger && machine.smartChanger,
    smartGrease: allowed.smartGrease && machine.smartGrease,
    smartDoor: allowed.smartDoor && machine.smartDoor,
    smartRaster: allowed.smartRaster && machine.smartRaster,
    smartSetUp: allowed.smartSetUp && machine.smartSetUp,
    automation: coerceAutomationForModel(machine.automation ?? 'None', machine.machineModel),
  }
}
