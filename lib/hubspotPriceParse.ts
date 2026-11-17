export interface HubSpotProductLite {
  name?: string | null
  price?: string | null
  createdate?: string | null
  hs_status?: string | null
}

const FAMILIES: [RegExp, string][] = [
  [/^PLUS\s+Bevel$/i, 'PLUS Bevel'],
  [/^(FIBER\s+HD|FHD)$/i, 'Fiber HD'],
  [/^FAST$/i, 'FAST'],
  [/^XME$/i, 'XME'],
  [/^XMF$/i, 'XMF'],
  [/^LME$/i, 'LME'],
]

const MACHINE_NAME =
  /^(PLUS\s+Bevel|FIBER\s+HD|FHD|FAST|XME|XMF|LME)\s+(\d{4,5})\s+(\d+)\s*kW(?:\s+(IPG|Raycus))?$/i

/** "FIBER HD 6020 12kW IPG" -> "Fiber HD 6020|IPG|12". Anything else (options, specials, side load, other lasers) -> null. */
export function parseMachineProductName(
  rawName: string
): { key: string; explicitLaser: boolean } | null {
  const name = rawName.replace(/\s+/g, ' ').trim()
  const m = MACHINE_NAME.exec(name)
  if (!m) return null
  const family = FAMILIES.find(([rx]) => rx.test(m[1].replace(/\s+/g, ' ')))?.[1]
  if (!family) return null
  const laser = m[4] ? (m[4].toLowerCase() === 'raycus' ? 'Raycus' : 'IPG') : 'IPG'
  return { key: `${family} ${m[2]}|${laser}|${parseInt(m[3], 10)}`, explicitLaser: !!m[4] }
}

const DEALER_DISCOUNT = 0.08

/**
 * HubSpot products -> price table rows. HubSpot stores list price only, so net is list less the
 * standard dealer discount. When several products describe the same machine, one that names its
 * laser beats one that doesn't, then the most recently created wins.
 */
export function hubspotProductsToPriceTable(
  products: HubSpotProductLite[]
): Record<string, { list: number; net: number }> {
  const best = new Map<string, { list: number; explicitLaser: boolean; created: string }>()
  for (const p of products) {
    if (p.hs_status && p.hs_status.toLowerCase() !== 'active') continue
    const parsed = parseMachineProductName(p.name ?? '')
    if (!parsed) continue
    const price = Number(p.price)
    if (!Number.isFinite(price) || price <= 0) continue
    const candidate = {
      list: Math.round(price),
      explicitLaser: parsed.explicitLaser,
      created: p.createdate ?? '',
    }
    const current = best.get(parsed.key)
    const wins =
      !current ||
      (candidate.explicitLaser !== current.explicitLaser
        ? candidate.explicitLaser
        : candidate.created > current.created)
    if (wins) best.set(parsed.key, candidate)
  }
  const table: Record<string, { list: number; net: number }> = {}
  for (const [key, row] of Array.from(best.entries())) {
    table[key] = { list: row.list, net: Math.round(row.list * (1 - DEALER_DISCOUNT)) }
  }
  return table
}
