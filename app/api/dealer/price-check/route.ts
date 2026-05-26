import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildQuoteOption } from '@/lib/pricingEngine'
import { coerceBevelHeadForModel, coerceLaserSourceForModel } from '@/lib/machineConstraints'
import {
  getFormatNeighborModels,
  getPowerNeighborKws,
  hasExactSheetRow,
  kwToPowerLabel,
  type NeighborMode,
} from '@/lib/priceCheckNeighbors'
import { getDealerPriceCheckCatalog } from '@/lib/dealerPriceCheckCatalog'
import { lookupPrice, normalizeModel, normalizeLaser, parseKw, PRICE_TABLE } from '@/lib/pricingTable'
import type { NextRequest } from 'next/server'
import type { MachineOption, QuoteConfig } from '@/types'

const DISCLAIMER = [
  'Approximate configured totals only.',
  'Freight is estimated using the same rules as formal quotes.',
  'This is not a binding offer — submit a quote request for official pricing and approval.',
].join(' ')

function dealerOnly(session: Session | null): boolean {
  return !!(session?.user && (session.user as { role?: string }).role === 'dealer')
}

function toQuoteConfig(
  modelNorm: string,
  powerLabel: string,
  laserLabel: string,
  bevel: MachineOption['bevelHead']
): QuoteConfig {
  return {
    model: modelNorm,
    power: powerLabel,
    laser: laserLabel,
    bevel,
    training_days: 0,
    warranty: 'None',
    smartMix: false,
    smartChanger: false,
    smartGrease: false,
    smartDoor: false,
    smartRaster: false,
    smartSetUp: false,
    automation: 'None',
    pistonLift: false,
    ulCertification: false,
    cadCamSoftware: false,
    sideLoad: false,
    notes: '',
  }
}

export type PriceCheckSlot = {
  role: 'down' | 'target' | 'up'
  label: string
  model: string
  power: string
  laserLabel: string
  totalPrice: number
  subtotal: number
  freight: number
  sheetMatched: boolean
}

function computeSlot(
  role: PriceCheckSlot['role'],
  modelNorm: string,
  powerLabel: string,
  laserUi: string,
  bevelUi: MachineOption['bevelHead']
): PriceCheckSlot {
  const laserLabel = coerceLaserSourceForModel(laserUi, modelNorm)
  const bevel = coerceBevelHeadForModel(bevelUi, modelNorm)
  const config = toQuoteConfig(modelNorm, powerLabel, laserLabel, bevel)
  const kw = parseKw(powerLabel)
  const sheet = lookupPrice(modelNorm, laserLabel, kw)
  const opt = buildQuoteOption(config, sheet?.list)
  const sheetMatched = hasExactSheetRow(modelNorm, laserLabel, kw)
  const laserShort = laserLabel.replace(/\s+Photonics/i, '').trim() || laserLabel
  return {
    role,
    label: `${modelNorm} · ${powerLabel} · ${laserShort}`,
    model: modelNorm,
    power: powerLabel,
    laserLabel,
    totalPrice: opt.totalPrice,
    subtotal: opt.subtotal,
    freight: opt.freight,
    sheetMatched,
  }
}

/** GET machine families + table sizes (labels only — no pricing) for dealer UI dropdowns. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!dealerOnly(session)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return Response.json({ machines: getDealerPriceCheckCatalog() })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!dealerOnly(session)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: {
    machineModel?: string
    machinePower?: string
    laserSource?: string
    bevelHead?: MachineOption['bevelHead']
    neighborMode?: NeighborMode
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawModel = (body.machineModel ?? '').trim()
  const rawPower = (body.machinePower ?? '6kW').trim()
  const rawLaser = body.laserSource ?? 'IPG'
  const rawBevel = (body.bevelHead ?? 'None') as MachineOption['bevelHead']
  const neighborMode: NeighborMode = body.neighborMode === 'power' ? 'power' : 'format'

  if (!rawModel) return Response.json({ error: 'machineModel required' }, { status: 400 })

  const targetNormModel = normalizeModel(rawModel)

  /** Baseline laser from target model — used only for locating format buckets (still coerced per slot). */
  const baselineLaserUi = coerceLaserSourceForModel(rawLaser, targetNormModel)
  const baselineLaserSheet = normalizeLaser(baselineLaserUi)

  let targetPowerLabel = rawPower

  /** Down/up slot models (format mode) */
  let formatDownModel: string | null = null
  let formatUpModel: string | null = null
  /** Down/up powers (power mode), after resolving target kW to sheet ladder */
  let powerDownKw: number | null = null
  let powerUpKw: number | null = null

  if (neighborMode === 'format') {
    const kw = parseKw(rawPower)
    targetPowerLabel = kwToPowerLabel(kw)
    const { down, up } = getFormatNeighborModels(targetNormModel, baselineLaserSheet, kw)
    formatDownModel = down
    formatUpModel = up
  } else {
    const requestedKw = parseKw(rawPower)
    const ladder = getPowerNeighborKws(targetNormModel, baselineLaserSheet, requestedKw)
    targetPowerLabel = kwToPowerLabel(ladder.resolvedKw)
    powerDownKw = ladder.down
    powerUpKw = ladder.up
  }

  const target = computeSlot('target', targetNormModel, targetPowerLabel, rawLaser, rawBevel)

  let down: PriceCheckSlot | null = null
  let up: PriceCheckSlot | null = null

  if (neighborMode === 'format') {
    if (formatDownModel) down = computeSlot('down', formatDownModel, targetPowerLabel, rawLaser, rawBevel)
    if (formatUpModel) up = computeSlot('up', formatUpModel, targetPowerLabel, rawLaser, rawBevel)
  } else {
    if (powerDownKw !== null)
      down = computeSlot('down', targetNormModel, kwToPowerLabel(powerDownKw), rawLaser, rawBevel)
    if (powerUpKw !== null)
      up = computeSlot('up', targetNormModel, kwToPowerLabel(powerUpKw), rawLaser, rawBevel)
  }

  return Response.json({
    mode: neighborMode,
    disclaimer: DISCLAIMER,
    down,
    target,
    up,
  })
}
