'use client'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  REVIEWING: 'bg-orange-100 text-orange-700',
  PUBLISHED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Pending Review',
  REVIEWING: 'Under Review',
}

interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
