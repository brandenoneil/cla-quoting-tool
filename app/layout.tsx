import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import SessionProvider from './SessionProvider'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} font-sans`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
