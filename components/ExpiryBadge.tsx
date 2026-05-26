'use client'

interface Props {
  createdAt: Date | string
  validDays?: number
}

export default function ExpiryBadge({ createdAt, validDays = 30 }: Props) {
  const created = new Date(createdAt)
  const expiry = new Date(created.getTime() + validDays * 86400000)
  const now = new Date()
  const isActive = expiry > now

  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
  const daysAgo = Math.ceil((now.getTime() - expiry.getTime()) / 86400000)

  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Active · {daysLeft}d left
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
      Expired · {daysAgo}d ago
    </span>
  )
}
