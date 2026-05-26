'use client'

import { STAGE_MAP, type DealStageGroup } from '@/types'

const STAGE_COLORS: Record<DealStageGroup, string> = {
  early: 'bg-gray-100 text-gray-700',
  mid: 'bg-blue-100 text-blue-700',
  late: 'bg-green-100 text-green-700',
  hold: 'bg-amber-100 text-amber-700',
  qualified: 'bg-purple-100 text-purple-700',
}

interface Props {
  stageId: string
}

export default function StageBadge({ stageId }: Props) {
  const stage = STAGE_MAP[stageId]
  if (!stage) return null

  const colorClass = STAGE_COLORS[stage.group]

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {stage.label}
    </span>
  )
}
