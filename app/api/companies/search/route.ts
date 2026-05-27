import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hubspotConfigured, searchCompanies, getCompanyPrimaryContact } from '@/lib/hubspot'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized', companies: [] }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q') || ''
  if (q.length < 2) return Response.json({ companies: [], hubspotConfigured: hubspotConfigured() })

  if (!hubspotConfigured()) {
    return Response.json({
      companies: [],
      hubspotConfigured: false,
      message:
        'CRM search is unavailable. In Vercel → Environment Variables, set HUBSPOT_PRIVATE_APP_TOKEN (HubSpot private app with scopes to read Companies and Contacts). Redeploy after saving.',
    })
  }

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

    return Response.json({ companies: enriched, hubspotConfigured: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ companies: [], hubspotConfigured: true, error: message }, { status: 200 })
  }
}
