import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DealerDashboard from '@/components/DealerDashboard'

export default async function DealerDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if ((session.user as any).role !== 'dealer') redirect('/')

  const email = session.user?.email || ''

  const requests = await prisma.quote.findMany({
    where: { submittedByDealer: email },
    orderBy: { createdAt: 'desc' },
  })

  return <DealerDashboard requests={requests} user={session.user as any} />
}
