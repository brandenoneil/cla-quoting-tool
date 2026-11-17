import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ensurePriceTable } from '@/lib/hubspotPriceTable'
import { PRICE_TABLE, getPriceTableSignature } from '@/lib/pricingTable'

export const dynamic = 'force-dynamic'

/** Current machine price table (HubSpot products, or the built-in fallback) for client-side previews. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await ensurePriceTable()
  return Response.json(
    { signature: getPriceTableSignature(), rows: PRICE_TABLE },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
