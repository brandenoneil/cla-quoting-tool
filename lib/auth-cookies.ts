/** Match NextAuth secure cookie naming on Vercel / HTTPS (see next-auth/jwt getToken). */
export function shouldUseSecureAuthCookies(): boolean {
  const url = process.env.NEXTAUTH_URL ?? ''
  if (url.startsWith('https://')) return true
  if (url.startsWith('http://')) return false
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
}

export function sessionTokenCookieName(): string {
  return shouldUseSecureAuthCookies()
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'
}
