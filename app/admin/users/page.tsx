import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminUsersClient from './AdminUsersClient'

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if ((session.user as any)?.role !== 'admin') redirect('/')

  return <AdminUsersClient />
}
