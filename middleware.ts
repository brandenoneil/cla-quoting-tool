import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import { sessionTokenCookieName } from '@/lib/auth-cookies'

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | undefined
    const path = req.nextUrl.pathname

    /** Allow known dealer portal origins to iframe embed routes only. */
    function withEmbedFrameAncestors(response: NextResponse) {
      if (path.startsWith('/dealer/embed')) {
        const raw = process.env.DEALER_EMBED_FRAME_ANCESTORS ?? ''
        const origins = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const fa = origins.length > 0 ? origins.join(' ') : "'self'"
        response.headers.set('Content-Security-Policy', `frame-ancestors ${fa}`)
      }
      return response
    }

    // Only enforce routing rules on page paths (API routes handle their own auth)
    if (!path.startsWith('/api/')) {
      const isDealer = role === 'dealer'
      const isDealerPath = path.startsWith('/dealer')

      if (isDealer && !isDealerPath) {
        return NextResponse.redirect(new URL('/dealer', req.url))
      }
      if (!isDealer && isDealerPath) {
        return NextResponse.redirect(new URL('/', req.url))
      }

      return withEmbedFrameAncestors(NextResponse.next())
    }

    return withEmbedFrameAncestors(NextResponse.next())
  },
  {
    secret: process.env.NEXTAUTH_SECRET,
    cookies: {
      sessionToken: {
        name: sessionTokenCookieName(),
      },
    },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: ['/((?!login|api/auth|_next|favicon.ico|logos/|machines/|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.webp$).*)'],
}
