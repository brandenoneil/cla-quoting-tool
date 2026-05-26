import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  searchCompanyByName,
  createCompany,
  searchContactByEmail,
  createContact,
  createDeal,
  associateV3,
} from '@/lib/hubspot'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { companyName, contactName, contactEmail, contactPhone, machineInterest, closeDate } =
    await req.json()

  try {
    // 1. Find or create company
    let company = await searchCompanyByName(companyName)
    if (!company) {
      company = await createCompany({
        name: companyName,
        createdate: new Date().toISOString(),
      })
    }

    await new Promise((r) => setTimeout(r, 100))

    // 2. Find or create contact
    let contact = await searchContactByEmail(contactEmail)
    if (!contact) {
      const [firstName, ...rest] = (contactName || '').split(' ')
      contact = await createContact({
        firstname: firstName || '',
        lastname: rest.join(' ') || '',
        email: contactEmail,
        phone: contactPhone || '',
      })
    }

    await new Promise((r) => setTimeout(r, 100))

    // 3. Create deal
    const dealName = `${companyName} - ${machineInterest || 'Laser System'}`
    const deal = await createDeal({
      dealname: dealName,
      pipeline: '90932330',
      dealstage: '168290363',
      amount: 0,
      closedate: closeDate
        ? new Date(closeDate).getTime()
        : new Date(Date.now() + 90 * 86400000).getTime(),
    })

    await new Promise((r) => setTimeout(r, 100))

    // 4. Associate contact → deal
    await associateV3('contacts', contact.id, 'deals', deal.id, 'contact_to_deal')
    await new Promise((r) => setTimeout(r, 100))

    // 5. Associate company → deal
    await associateV3('companies', company.id, 'deals', deal.id, 'company_to_deal')

    return Response.json({ deal, contact, company })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
