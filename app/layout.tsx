import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import SessionProvider from './SessionProvider'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ensurePriceTable } from '@/lib/hubspotPriceTable'
import { PRICE_TABLE, getPriceTableSignature } from '@/lib/pricingTable'
import PriceTableSync from '@/components/PriceTableSync'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Cutlite America Quote Builder',
  description: 'Internal sales quoting tool for Cutlite America',
  icons: {
    icon: '/logos/icon-over-white.png',
    shortcut: '/logos/icon-over-white.png',
    apple: '/logos/icon-over-white.png',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (session) await ensurePriceTable()
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} font-sans`}>
        {session && <PriceTableSync signature={getPriceTableSignature()} rows={{ ...PRICE_TABLE }} />}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
