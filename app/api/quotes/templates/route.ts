import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchQuoteTemplates } from '@/lib/hubspot'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  try {
    const templates = await fetchQuoteTemplates()
    return Response.json({ templates })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
