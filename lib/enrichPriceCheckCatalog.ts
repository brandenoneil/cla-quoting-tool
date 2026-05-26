import {
  getAllowedBevelHeads,
  getAllowedLaserSources,
  getSheetKwListForModelLaser,
  LASER_SOURCE_LABELS,
} from '@/lib/machineConstraints'
import type {
  PriceCheckMachineOption,
  PriceCheckMachineOptionEnriched,
} from '@/lib/priceCheckClient'

/** Build dealer price-check catalog with constraint metadata (server-only). */
export function enrichPriceCheckCatalog(
  catalog: PriceCheckMachineOption[]
): PriceCheckMachineOptionEnriched[] {
  return catalog.map((machine) => ({
    ...machine,
    sizes: machine.sizes.map((size) => {
      const allowedLasers = getAllowedLaserSources(size.sheetModel)
      const kwByLaser: Record<string, number[]> = {}
      for (const laser of LASER_SOURCE_LABELS) {
        if (allowedLasers.includes(laser)) {
          kwByLaser[laser] = getSheetKwListForModelLaser(size.sheetModel, laser)
        }
      }
      return {
        ...size,
        allowedLasers,
        kwByLaser,
        allowedBevels: getAllowedBevelHeads(size.sheetModel),
      }
    }),
  }))
}
