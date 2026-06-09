'use client'

import { useMemo } from 'react'
import type { PriceCheckMachineOptionEnriched } from '@/lib/priceCheckClient'
import { resolveSheetModel } from '@/lib/priceCheckClient'
import { LASER_FALLBACK, POWER_FALLBACK } from '@/lib/priceCheckFormHelpers'
import { PowerSlider, TableSizeSlider } from '@/components/PriceCheckSliders'

interface Props {
  catalog: PriceCheckMachineOptionEnriched[]
  familyId: string
  sizeCode: string
  machinePower: string
  laserSource: string
  onFamilyChange: (familyId: string) => void
  onSizeChange: (sizeCode: string) => void
  onPowerChange: (power: string) => void
  disabled?: boolean
  showResolvedModel?: boolean
}

export default function MachineCatalogFields({
  catalog,
  familyId,
  sizeCode,
  machinePower,
  laserSource,
  onFamilyChange,
  onSizeChange,
  onPowerChange,
  disabled = false,
  showResolvedModel = true,
}: Props) {
  const familyValue = catalog.some((m) => m.id === familyId) ? familyId : catalog[0]?.id ?? ''
  const selectedMachine = useMemo(
    () => catalog.find((m) => m.id === familyValue),
    [catalog, familyValue]
  )
  const sizes = selectedMachine?.sizes ?? []
  const sizeValue = sizes.some((s) => s.code === sizeCode) ? sizeCode : sizes[0]?.code ?? ''

  const powerChoices = useMemo(() => {
    const size = sizes.find((s) => s.code === sizeValue)
    const kws = size?.kwByLaser[laserSource] ?? size?.kwByLaser[LASER_FALLBACK[0]] ?? []
    if (kws.length) return kws.map((k) => `${k}kW`)
    return [...POWER_FALLBACK]
  }, [sizes, sizeValue, laserSource])

  const powerValue = powerChoices.includes(machinePower) ? machinePower : powerChoices[0] ?? '20kW'
  const machineModel = resolveSheetModel(catalog, familyValue, sizeValue)

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">Machine line</span>
        <select
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-[#0A2E52] disabled:opacity-50"
          value={familyValue}
          disabled={disabled || !catalog.length}
          onChange={(e) => onFamilyChange(e.target.value)}
        >
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Table size</span>
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 min-h-[88px]">
            <TableSizeSlider
              sizes={sizes}
              valueCode={sizeValue}
              disabled={disabled || !sizes.length}
              onChange={onSizeChange}
            />
          </div>
        </div>

        <div className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Power</span>
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 min-h-[88px]">
            <PowerSlider
              options={powerChoices}
              value={powerValue}
              disabled={disabled || !machineModel || !powerChoices.length}
              onChange={onPowerChange}
            />
          </div>
        </div>
      </div>

      {showResolvedModel && machineModel && (
        <p className="text-xs text-gray-500">
          Sheet model: <span className="font-medium text-[#0A2E52]">{machineModel}</span>
        </p>
      )}
    </div>
  )
}
