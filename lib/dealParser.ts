import type { ParsedDeal } from '@/types'

const MACHINE_PATTERN =
  /\b(PLUS\s+Bevel|PLUS\s+EVO|Fiber\s+Plus\s+HD|Fiber\s+HD|FHD|Demo\s+Fast|FIBER\s+Tube\s+TL|XMF|XME|Fast)\s*([\d\-]+)\s+(\d+(?:\.\d+)?kW)\s*(IPG|Raycus|Racus|Maxphotonics|nLIGHT|Coherent)?\b/i

export function parseDealName(dealName: string): ParsedDeal {
  const match = dealName.match(MACHINE_PATTERN)

  if (!match) {
    // Try to extract company name at minimum
    const dashIdx = dealName.indexOf(' - ')
    const company = dashIdx > -1 ? dealName.substring(0, dashIdx).trim() : dealName.trim()
    return {
      company,
      model: '',
      format: '',
      power: '',
      laserSource: '',
      rawMatch: '',
    }
  }

  const [rawMatch, modelPart, formatPart, powerPart, laserPart] = match

  // Extract company: everything before the machine match
  const matchIndex = dealName.indexOf(rawMatch)
  const beforeMatch = dealName.substring(0, matchIndex).trim()
  const company = beforeMatch.replace(/[-–\s]+$/, '').trim()

  // Normalize model name
  const model = normalizeModel(modelPart, formatPart)

  return {
    company,
    model,
    format: formatPart || '',
    power: powerPart || '',
    laserSource: laserPart || '',
    rawMatch,
  }
}

function normalizeModel(model: string, format: string): string {
  const m = model.trim().toLowerCase().replace(/\s+/g, ' ')
  if (m.includes('plus bevel')) {
    return `Plus Bevel ${format}`.trim()
  }
  if (m.includes('plus evo')) {
    return `Plus EVO ${format}`.trim()
  }
  if (m.includes('fiber plus hd') || m.includes('fiber hd') || m === 'fhd') {
    return `Fiber HD ${format}`.trim()
  }
  if (m.includes('demo fast')) {
    return `Demo Fast ${format}`.trim()
  }
  if (m.includes('fiber tube')) {
    return `FIBER Tube TL ${format}`.trim()
  }
  if (m === 'xmf') return `XMF ${format}`.trim()
  if (m === 'xme') return `XME ${format}`.trim()
  if (m === 'fast') return `Fast ${format}`.trim()
  return `${model} ${format}`.trim()
}

export function modelToKey(model: string): string {
  const m = model.toLowerCase().replace(/\s+/g, '-')
  if (m.includes('plus-bevel') || m.includes('plusbevel')) return 'plus-bevel-4020'
  if (m.includes('plus-evo') || m.includes('plusevo')) return 'plus-evo-6525'
  if (m.includes('fiber-hd') || m.includes('fiberhd') || m.includes('fhd')) return 'fiber-hd-4020'
  if (m.includes('demo-fast')) return 'demo-fast-4020'
  if (m.includes('fiber-tube') || m.includes('fibertube')) return 'fiber-tube-tl'
  if (m.includes('xmf')) return 'xmf-6020'
  if (m.includes('xme')) return 'xme-4020'
  if (m.includes('fast')) return 'fast-4020'
  return m
}
