import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateQuotePDF } from '@/lib/pdf'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) return new Response('Not found', { status: 404 })

  // Dealers can only download PDFs for their own submitted quotes
  const email = session.user?.email
  if ((session.user as any).role === 'dealer' && quote.submittedByDealer !== email) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const pdfBuffer = await generateQuotePDF(params.id, baseUrl)

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Cutlite_America_${quote.quoteNumber}.pdf"`,
      },
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
