import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { sessionTokenCookieName, shouldUseSecureAuthCookies } from '@/lib/auth-cookies'
import { prisma } from '@/lib/prisma'

const secureCookies = shouldUseSecureAuthCookies()

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email.trim().toLowerCase()
        const password = credentials.password

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          })

          if (!user) return null

          const passwordMatch = await bcrypt.compare(password, user.password)
          if (!passwordMatch) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        } catch (err) {
          console.error('[auth] authorize failed:', err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in — store id + role from the authorized() result
        token.role = (user as any).role
        token.id = (user as any).id
      } else if (token.id) {
        // Subsequent requests — re-read role from DB so admin role changes
        // take effect on the next session refresh without requiring a re-login
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          })
          if (dbUser) token.role = dbUser.role
        } catch {
          // Non-fatal — keep the cached role if the DB is unreachable
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: secureCookies,
  cookies: {
    sessionToken: {
      name: sessionTokenCookieName(),
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: secureCookies,
      },
    },
  },
}
