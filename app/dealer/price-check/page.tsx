import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDealerPriceCheckCatalog } from '@/lib/dealerPriceCheckCatalog'
import { redirect } from 'next/navigation'
import DealerPriceCheckClient from './DealerPriceCheckClient'

export const dynamic = 'force-dynamic'

export default async function DealerPriceCheckPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dealer/price-check')
  if ((session.user as { role?: string }).role !== 'dealer') redirect('/')

  const catalog = getDealerPriceCheckCatalog()

  return <DealerPriceCheckClient catalog={catalog} embed={false} user={session.user ?? undefined} />
}
