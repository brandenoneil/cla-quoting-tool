import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchDealsByStages } from '@/lib/hubspot'
import { NextRequest } from 'next/server'

// Closed Won = 168290368 | Closed Lost = 168290369
const CLOSED_WON = '168290368'
const CLOSED_LOST = '168290369'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const filter = req.nextUrl.searchParams.get('filter') ?? 'all' // 'won' | 'lost' | 'all'
  const q = req.nextUrl.searchParams.get('q') ?? ''

  const stages =
    filter === 'won'  ? [CLOSED_WON] :
    filter === 'lost' ? [CLOSED_LOST] :
    [CLOSED_WON, CLOSED_LOST]

  try {
    const deals = await searchDealsByStages(stages, q)
    return Response.json({ deals })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
