import { enrichPriceCheckCatalog } from '@/lib/enrichPriceCheckCatalog'
import { buildPriceCheckCatalog } from '@/lib/priceCheckCatalog'
import type { PriceCheckMachineOptionEnriched } from '@/lib/priceCheckClient'
import { getPriceTableVersion } from '@/lib/pricingTable'

let cachedEnriched: PriceCheckMachineOptionEnriched[] | null = null
let cachedAtVersion = -1

/** Built once per price table version — shared by price-check pages and API. */
export function getDealerPriceCheckCatalog(): PriceCheckMachineOptionEnriched[] {
  if (!cachedEnriched || cachedAtVersion !== getPriceTableVersion()) {
    cachedAtVersion = getPriceTableVersion()
    cachedEnriched = enrichPriceCheckCatalog(buildPriceCheckCatalog())
  }
  return cachedEnriched
}
