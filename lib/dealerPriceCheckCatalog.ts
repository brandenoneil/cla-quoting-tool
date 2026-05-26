import { enrichPriceCheckCatalog } from '@/lib/enrichPriceCheckCatalog'
import { buildPriceCheckCatalog } from '@/lib/priceCheckCatalog'
import type { PriceCheckMachineOptionEnriched } from '@/lib/priceCheckClient'

let cachedEnriched: PriceCheckMachineOptionEnriched[] | null = null

/** Build once per server process — shared by price-check pages and API. */
export function getDealerPriceCheckCatalog(): PriceCheckMachineOptionEnriched[] {
  if (!cachedEnriched) {
    cachedEnriched = enrichPriceCheckCatalog(buildPriceCheckCatalog())
  }
  return cachedEnriched
}
