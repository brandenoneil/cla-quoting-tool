import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'

async function requireAdmin(session: any) {
  if (!session || (session.user as any)?.role !== 'admin') return false
  return true
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return new Response('Forbidden', { status: 403 })

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json({ users })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return new Response('Forbidden', { status: 403 })

  const { email, name, password, role } = await req.json()

  if (!email || !name || !password) {
    return Response.json({ error: 'email, name, and password are required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return Response.json({ error: 'Email already exists' }, { status: 409 })

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, name, password: hashed, role: role || 'sales' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })

  return Response.json({ user })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return new Response('Forbidden', { status: 403 })

  const { id, role } = await req.json()
  if (!id || !role) return Response.json({ error: 'id and role are required' }, { status: 400 })

  const validRoles = ['sales', 'admin', 'dealer']
  if (!validRoles.includes(role)) {
    return Response.json({ error: `Invalid role. Must be: ${validRoles.join(', ')}` }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  })

  return Response.json({ user })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return new Response('Forbidden', { status: 403 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  // Prevent self-deletion
  if ((session!.user as any).id === id) {
    return Response.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })
  return Response.json({ success: true })
}
