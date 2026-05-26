import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [quotes, pendingQuotes] = await Promise.all([
    prisma.quote.findMany({
      where: { status: { notIn: ['PENDING_APPROVAL', 'REVIEWING'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.quote.findMany({
      where: { status: { in: ['PENDING_APPROVAL', 'REVIEWING'] } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return <DashboardClient quotes={quotes} pendingQuotes={pendingQuotes} user={session.user as any} />
}
