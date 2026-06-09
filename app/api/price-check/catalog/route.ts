import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDealerPriceCheckCatalog } from '@/lib/dealerPriceCheckCatalog'

/** GET machine families + table sizes for catalog-driven UI (review form, price check). */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return Response.json({ machines: getDealerPriceCheckCatalog() })
}
