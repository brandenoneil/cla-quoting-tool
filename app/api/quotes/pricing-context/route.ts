import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getClosedWonDealsByModel } from '@/lib/hubspot'
import { lookupExactPrice, normalizeModel, normalizeLaser, parseKw } from '@/lib/pricingTable'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const model = req.nextUrl.searchParams.get('model') ?? ''
  const laser = req.nextUrl.searchParams.get('laser') ?? 'IPG'
  const power = req.nextUrl.searchParams.get('power') ?? '6kW'

  if (!model) return Response.json({ error: 'model required' }, { status: 400 })

  const kw = parseKw(power)
  const modelKey = normalizeModel(model)

  // 1. Current price from the Feb 2026 sheet
  const sheetPrice = lookupExactPrice(model, laser, kw)

  // 2. Historical closed-won averages — search by short model keyword
  // Use the format portion (e.g. "4020" from "FAST 4020") as the search token
  const keyword = extractSearchKeyword(modelKey)
  let historicalDeals: any[] = []
  let historicalAvg: number | null = null
  let historicalCount = 0

  try {
    historicalDeals = await getClosedWonDealsByModel(keyword)
    const amounts = historicalDeals
      .map((d) => parseFloat(d.properties?.amount ?? '0'))
      .filter((a) => a > 10000)
    if (amounts.length > 0) {
      historicalAvg = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length)
      historicalCount = amounts.length
    }
  } catch {
    // Non-critical — ignore
  }

  return Response.json({
    model: modelKey,
    laser: normalizeLaser(laser),
    kw,
    currentPrice: sheetPrice ? { list: sheetPrice.list } : null,
    historical: {
      avg: historicalAvg,
      count: historicalCount,
      deals: historicalDeals.slice(0, 10).map((d) => ({
        name: d.properties?.dealname ?? '',
        amount: parseFloat(d.properties?.amount ?? '0'),
        closeDate: d.properties?.closedate ?? null,
        company: d.properties?.dealer_company ?? '',
      })),
    },
  })
}

function extractSearchKeyword(modelKey: string): string {
  // "FAST 4020" -> "FAST 4020" (search exact)
  // "PLUS Bevel 6525" -> "Bevel 6525"
  // "XME 4020" -> "XME 4020"
  if (modelKey.startsWith('PLUS Bevel')) return modelKey.replace('PLUS Bevel', 'Bevel').trim()
  return modelKey
}
