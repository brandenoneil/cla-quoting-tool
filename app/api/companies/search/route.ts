import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchCompanies, getCompanyPrimaryContact } from '@/lib/hubspot'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const q = req.nextUrl.searchParams.get('q') || ''
  if (q.length < 2) return Response.json({ companies: [] })

  try {
    const companies = await searchCompanies(q, 8)

    const enriched = await Promise.all(
      companies.map(async (c) => ({
        id: c.id,
        name: c.properties.name,
        city: c.properties.city,
        state: c.properties.state,
        contact: await getCompanyPrimaryContact(c.id),
      }))
    )

    return Response.json({ companies: enriched })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
