import type { LineItem, QuoteConfig, QuoteOption } from '@/types'
import { modelToKey } from './dealParser'
import { isPlusBevelMachineModel } from './machineConstraints'
import { normalizeModel } from './pricingTable'

const BASE_PRICES: Record<string, [number, number]> = {
  'fast-4020':        [400000, 600000],
  'xme-4020':         [400000, 600000],
  'xmf-6020':         [450000, 850000],
  'demo-fast-4020':   [500000, 700000],
  'plus-bevel-4020':  [800000, 1200000],
  'plus-bevel-6525':  [900000, 2500000],
  'plus-bevel-19025': [2500000, 4500000],
  'fiber-tube-tl':    [800000, 2000000],
}

function configHasBevel(bevel: string): boolean {
  const b = (bevel ?? '').trim().toLowerCase()
  if (!b || b === 'no' || b === 'none' || b === 'false') return false
  return true
}

const POWER_MULT: Record<string, number> = {
  '3kw': 0.85,
  '6kw': 1.0,
  '10kw': 1.15,
  '12kw': 1.22,
  '15kw': 1.30,
  '20kw': 1.35,
  '25kw': 1.45,
  '30kw': 1.55,
  '40kw': 1.80,
}

export const ADDONS = {
  bevelBasic: 50000,
  bevelPlus: 120000,
  ipgPremium: 0.08,
  installation: { small: 15000, medium: 22500, large: 35000 },
  trainingDay: 2500,
  warranty1yr: 18000,
  warranty2yr: 32000,
  warranty3yr: 45000,
  freightPct: 0.025,
  // SMART Options
  smartMix: 31300,
  smartChanger: 41700,
  smartGrease: 8400,
  smartDoor: 13600,
  smartRaster: 12000,
  smartSetUp: 8300,
  // Automation
  automationNoTower: 195800,
  automationWithTower: 324600,
  automationInline: 145000,
  // Additional Equipment
  pistonLift: 18500,
  ulCertification: 12000,
  cadCamSoftware: 8900,
  sideLoad: 22000,
}

function bevelAddonPrice(model: string): number {
  const norm = normalizeModel(model || '')
  if (/^XMF\b/i.test(norm)) return ADDONS.bevelBasic
  return ADDONS.bevelPlus
}

function getBasePrice(modelKey: string): [number, number] {
  if (BASE_PRICES[modelKey]) return BASE_PRICES[modelKey]
  for (const [key, value] of Object.entries(BASE_PRICES)) {
    if (modelKey.includes(key.split('-')[0])) return value
  }
  return [500000, 1000000]
}

function getPowerMult(power: string): number {
  const key = power.toLowerCase().replace(/\s/g, '')
  return POWER_MULT[key] ?? 1.0
}

function getInstallationCost(modelKey: string): number {
  if (modelKey.includes('plus-bevel-19025') || modelKey.includes('plus-bevel-6525')) {
    return ADDONS.installation.large
  }
  if (modelKey.includes('plus-bevel') || modelKey.includes('fiber-tube')) {
    return ADDONS.installation.medium
  }
  return ADDONS.installation.small
}

// Builds a warranty label + cost from the warranty string
function parseWarranty(warranty: string): { label: string; cost: number } {
  const w = warranty.toLowerCase()
  if (w.includes('3yr') || w.includes('3 year') || w.includes('+3') || warranty === '3') {
    return { label: '3-Year Extended Warranty', cost: ADDONS.warranty3yr }
  }
  if (w.includes('2yr') || w.includes('2 year') || w.includes('+2') || warranty === '2') {
    return { label: '2-Year Extended Warranty', cost: ADDONS.warranty2yr }
  }
  if (w.includes('1yr') || w.includes('1 year') || w.includes('+1') || warranty === '1') {
    return { label: '1-Year Extended Warranty', cost: ADDONS.warranty1yr }
  }
  return { label: '', cost: 0 }
}

// ─── Build line items for a single machine configuration ──────────────────────
// sheetBasePrice: actual Feb 2026 list price from the price sheet — use this
//   when available (it already accounts for laser source and power). The rough
//   BASE_PRICES fallback only runs when no sheet price is found.
export function buildLineItems(config: QuoteConfig, sheetBasePrice?: number): LineItem[] {
  const modelKey = modelToKey(config.model)
  const [baseMin, baseMax] = getBasePrice(modelKey)
  const powerMult = getPowerMult(config.power)

  let machineBase: number
  let laserPremium = 0

  if (sheetBasePrice != null && sheetBasePrice > 0) {
    machineBase = sheetBasePrice
  } else if (sheetBasePrice === undefined) {
    // Rough fallback for dealer price-check estimates only (no exact sheet row passed)
    machineBase = (baseMin + (baseMax - baseMin) * 0.5) * powerMult
    const laser = config.laser.toLowerCase()
    if (laser.includes('ipg')) laserPremium = machineBase * ADDONS.ipgPremium
  } else {
    // Explicit TBD / custom pricing (sheetBasePrice === 0 or null from formal quotes)
    machineBase = 0
  }

  const items: LineItem[] = []

  // ── Machine base ────────────────────────────────────────────────────────────
  items.push({
    description: config.model || 'Laser Cutting System',
    detail: `${config.power} ${config.laser} laser cutting system`,
    qty: 1,
    unitPrice: Math.round(machineBase),
    amount: Math.round(machineBase),
    included: false,
  })

  // Laser premium (only in fallback mode — sheet price already includes it)
  if (laserPremium > 0) {
    items.push({
      description: `${config.laser} Laser Source Premium`,
      detail: 'Premium laser source upgrade',
      qty: 1,
      unitPrice: Math.round(laserPremium),
      amount: Math.round(laserPremium),
      included: false,
    })
  }

  // ── Bevel ───────────────────────────────────────────────────────────────────
  // PLUS Bevel machines: sheet price already includes bevel — don't add again.
  // Other machines: add bevel head cost only when bevel is Yes.
  if (!isPlusBevelMachineModel(config.model) && configHasBevel(config.bevel)) {
    const amount = bevelAddonPrice(config.model)
    items.push({
      description: 'Bevel Head',
      detail: 'Bevel cutting capability',
      qty: 1, unitPrice: amount, amount, included: false,
    })
  }

  // ── Standard inclusions ─────────────────────────────────────────────────────
  const installCost = getInstallationCost(modelKey)
  items.push({
    description: 'Professional Installation & Commissioning',
    detail: 'On-site installation, alignment, and system commissioning — standard on every machine',
    qty: 1, unitPrice: installCost, amount: installCost, included: true,
  })

  // ── SMART Options ───────────────────────────────────────────────────────────
  const smartOptions: [boolean | undefined, string, string, number][] = [
    [config.smartMix,     'SMART Mix — Gas Mix System',          'Automatic gas mix technology for optimal cut quality',  ADDONS.smartMix],
    [config.smartChanger, 'SMART Changer — Auto Nozzle Change',  'Automatic nozzle replacement — up to 10 positions',     ADDONS.smartChanger],
    [config.smartGrease,  'SMART Grease — Auto Greasing',        'Automatically greases X and Y axis linear drives',      ADDONS.smartGrease],
    [config.smartDoor,    'SMART Door — Additional Side Door',   'Additional side door for sizes 3015 up to 6025',        ADDONS.smartDoor],
    [config.smartRaster,  'SMART Raster — 3D Relief Marking',    'High-quality 3D relief marking capability',             ADDONS.smartRaster],
    [config.smartSetUp,   'SMART Set Up — Automation Preconfig', 'Predisposition for future automation integration',      ADDONS.smartSetUp],
  ]
  for (const [enabled, desc, detail, price] of smartOptions) {
    if (enabled) {
      items.push({ description: desc, detail, qty: 1, unitPrice: price, amount: price, included: false })
    }
  }

  // ── Automation ──────────────────────────────────────────────────────────────
  const automation = config.automation || 'None'
  if (automation === 'With Tower') {
    items.push({
      description: 'SMART Flow CS — Load/Unload Automation with Tower',
      detail: '90-degree load/unload automation system with tower storage',
      qty: 1, unitPrice: ADDONS.automationWithTower, amount: ADDONS.automationWithTower, included: false,
    })
  } else if (automation === 'No Tower') {
    items.push({
      description: 'SMART Flow CS — Load/Unload Automation (No Tower)',
      detail: 'Load/unload automation system without tower storage',
      qty: 1, unitPrice: ADDONS.automationNoTower, amount: ADDONS.automationNoTower, included: false,
    })
  } else if (automation === 'Inline No Tower') {
    items.push({
      description: 'Inline Automation (No Tower)',
      detail: 'Inline load/unload automation — no tower required',
      qty: 1, unitPrice: ADDONS.automationInline, amount: ADDONS.automationInline, included: false,
    })
  }

  // ── Additional Equipment ────────────────────────────────────────────────────
  if (config.pistonLift) {
    items.push({ description: 'Piston Lift', detail: 'Hydraulic sheet lifter', qty: 1, unitPrice: ADDONS.pistonLift, amount: ADDONS.pistonLift, included: false })
  }
  if (config.ulCertification) {
    items.push({ description: 'UL Certification', detail: 'US electrical safety certification', qty: 1, unitPrice: ADDONS.ulCertification, amount: ADDONS.ulCertification, included: false })
  }
  if (config.cadCamSoftware) {
    items.push({ description: 'CAD/CAM Software', detail: 'Lantek or SigmaNAST 2D/3D software license', qty: 1, unitPrice: ADDONS.cadCamSoftware, amount: ADDONS.cadCamSoftware, included: false })
  }
  if (config.sideLoad) {
    items.push({ description: 'Side Load Configuration', detail: 'Side-access sheet loading configuration', qty: 1, unitPrice: ADDONS.sideLoad, amount: ADDONS.sideLoad, included: false })
  }

  // ── Training ────────────────────────────────────────────────────────────────
  if (config.training_days > 0) {
    items.push({
      description: 'Operator Training',
      detail: `${config.training_days} day${config.training_days > 1 ? 's' : ''} on-site operator training`,
      qty: config.training_days,
      unitPrice: ADDONS.trainingDay,
      amount: config.training_days * ADDONS.trainingDay,
      included: false,
    })
  }

  // ── Extended Warranty ───────────────────────────────────────────────────────
  const { label: warrantyLabel, cost: warrantyCost } = parseWarranty(config.warranty || '')
  if (warrantyCost > 0) {
    items.push({
      description: warrantyLabel,
      detail: 'Extended parts and labor warranty coverage',
      qty: 1, unitPrice: warrantyCost, amount: warrantyCost, included: false,
    })
  }

  return items
}

// ─── Build a complete QuoteOption for one machine ─────────────────────────────
export function buildQuoteOption(
  config: QuoteConfig,
  sheetBasePrice?: number
): QuoteOption {
  const lineItems = buildLineItems(config, sheetBasePrice)
  const subtotal = lineItems.reduce((sum, item) => sum + (item.included ? 0 : item.amount), 0)
  const freight = Math.round(subtotal * ADDONS.freightPct)
  const totalPrice = subtotal + freight

  return {
    machineLabel: '',
    machineModel: config.model,
    machinePower: config.power,
    laserSource: config.laser,
    bevelHead: config.bevel,
    name: config.model || 'Laser Cutting System',
    tagline: '',
    machineBasePrice: lineItems[0]?.amount ?? 0,
    lineItems,
    subtotal,
    discountLabel: '',
    discountAmount: 0,
    freight,
    totalPrice,
    deliveryWeeks: 12,
    notes: '',
  }
}
