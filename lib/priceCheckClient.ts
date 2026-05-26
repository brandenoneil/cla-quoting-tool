/** Client-safe price-check types + helpers (no PRICE_TABLE import). */

export interface PriceCheckSizeOption {
  code: string
  label: string
  feetLabel: string
  sheetModel: string
}

export interface PriceCheckSizeOptionEnriched extends PriceCheckSizeOption {
  allowedLasers: string[]
  kwByLaser: Record<string, number[]>
  allowedBevels: string[]
}

export interface PriceCheckMachineOption {
  id: string
  label: string
  sizes: PriceCheckSizeOption[]
}

export interface PriceCheckMachineOptionEnriched extends Omit<PriceCheckMachineOption, 'sizes'> {
  sizes: PriceCheckSizeOptionEnriched[]
}

export function findMachineOption(
  catalog: PriceCheckMachineOption[],
  familyId: string
): PriceCheckMachineOption | undefined {
  return catalog.find((m) => m.id === familyId)
}

export function resolveSheetModel(
  catalog: PriceCheckMachineOption[],
  familyId: string,
  sizeCode: string
): string {
  const machine = findMachineOption(catalog, familyId)
  const size = machine?.sizes.find((s) => s.code === sizeCode)
  return size?.sheetModel ?? ''
}

/** Human table size from sheet model suffix (e.g. `Fiber HD 24035` → `24 × 3.5 m`). */
export function tableSizeLabelFromSheetModel(model: string): string {
  const m = /\s(\d{4,5})$/.exec(model.trim())
  if (!m) return ''
  const code = m[1]
  if (code.length === 4) {
    const lengthM = parseInt(code.slice(0, 2), 10) / 10
    const widthM = parseInt(code.slice(2, 4), 10) / 10
    return `${lengthM} × ${widthM} m`
  }
  if (code.length === 5) {
    const lengthM = parseInt(code.slice(0, 3), 10) / 10
    const widthM = parseInt(code.slice(3, 5), 10) / 10
    return `${lengthM} × ${widthM} m`
  }
  return code
}

export function defaultMachineSelection(catalog: PriceCheckMachineOption[]): {
  familyId: string
  sizeCode: string
  sheetModel: string
} {
  if (!catalog.length) return { familyId: '', sizeCode: '', sheetModel: '' }

  const fast = catalog.find((m) => m.id === 'FAST')
  const machine = fast ?? catalog[0]
  const prefer4020 = machine.sizes.find((s) => s.code === '4020')
  const size = prefer4020 ?? machine.sizes[Math.floor(machine.sizes.length / 2)] ?? machine.sizes[0]

  return {
    familyId: machine.id,
    sizeCode: size?.code ?? '',
    sheetModel: size?.sheetModel ?? '',
  }
}
