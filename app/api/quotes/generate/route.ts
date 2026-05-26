import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAnthropicClient, QUOTE_GENERATION_SYSTEM_PROMPT } from '@/lib/anthropic'
import { buildQuoteOption } from '@/lib/pricingEngine'
import { lookupPrice, parseKw } from '@/lib/pricingTable'
import { NextRequest } from 'next/server'
import type { QuoteConfig, QuoteOption, MachineOption } from '@/types'

function machineToConfig(m: MachineOption): QuoteConfig {
  return {
    model: m.machineModel || '',
    power: m.machinePower || '6kW',
    laser: m.laserSource || 'IPG',
    bevel: m.bevelHead || 'None',
    training_days: m.trainingDays || 0,
    warranty: m.extendedWarranty || 'None',
    smartMix: m.smartMix ?? false,
    smartChanger: m.smartChanger ?? false,
    smartGrease: m.smartGrease ?? false,
    smartDoor: m.smartDoor ?? false,
    smartRaster: m.smartRaster ?? false,
    smartSetUp: m.smartSetUp ?? false,
    automation: m.automation || 'None',
    pistonLift: m.pistonLift ?? false,
    ulCertification: m.ulCertification ?? false,
    cadCamSoftware: m.cadCamSoftware ?? false,
    sideLoad: m.sideLoad ?? false,
    notes: m.notes || '',
  }
}

function describeMachine(m: MachineOption): string {
  const lines: string[] = []
  lines.push(`Machine: ${m.machineModel} ${m.machinePower} ${m.laserSource}`)
  if (m.bevelHead !== 'None') lines.push(`Bevel: ${m.bevelHead}`)

  const smart = [
    m.smartMix && 'SMART Mix',
    m.smartChanger && 'SMART Changer',
    m.smartGrease && 'SMART Grease',
    m.smartDoor && 'SMART Door',
    m.smartRaster && 'SMART Raster',
    m.smartSetUp && 'SMART Set Up',
  ].filter(Boolean)
  if (smart.length) lines.push(`SMART Options: ${smart.join(', ')}`)

  if (m.automation !== 'None') lines.push(`Automation: ${m.automation}`)

  const extras = [
    m.pistonLift && 'Piston Lift',
    m.ulCertification && 'UL Certification',
    m.cadCamSoftware && 'CAD/CAM Software',
    m.sideLoad && 'Side Load',
  ].filter(Boolean)
  if (extras.length) lines.push(`Additional: ${extras.join(', ')}`)

  if (m.trainingDays > 0) lines.push(`Training: ${m.trainingDays} additional days`)
  if (m.extendedWarranty && m.extendedWarranty !== 'None') lines.push(`Warranty: ${m.extendedWarranty}`)
  if (m.notes) lines.push(`Notes: ${m.notes}`)

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { formData, dealContext } = await req.json()

  // Support both new (machines[]) and legacy (single machine) format
  const machines: MachineOption[] = formData.machines?.length
    ? formData.machines
    : [{
        id: 'legacy',
        label: 'Option A',
        machineModel: formData.machineModel || '',
        machinePower: formData.machinePower || '6kW',
        laserSource: formData.laserSource || 'IPG',
        bevelHead: formData.bevelHead || 'None',
        smartMix: false, smartChanger: false, smartGrease: false,
        smartDoor: false, smartRaster: false, smartSetUp: false,
        automation: 'None',
        pistonLift: false, ulCertification: false, cadCamSoftware: false, sideLoad: false,
        trainingDays: formData.trainingDays || 0,
        extendedWarranty: formData.extendedWarranty || 'None',
        notes: formData.notes || '',
      }]

  const client = getAnthropicClient()

  // Build sheet price notes for each machine
  const sheetPriceNotes = machines.map((m, i) => {
    const kw = parseKw(m.machinePower)
    const price = lookupPrice(m.machineModel, m.laserSource, kw)
    if (!price) return `${m.label}: No price sheet match — custom pricing needed`
    return `${m.label} FEB 2026 PRICES — List: $${price.list.toLocaleString()} | Net (dealer): $${price.net.toLocaleString()}`
  }).join('\n')

  const userMessage = `Generate quote options for the following machine configurations. Return one QuoteOption per machine.

Deal: ${dealContext?.dealName || 'New Quote'}
Company: ${formData.company || 'Customer'}

${machines.map((m, i) => `--- ${m.label} ---\n${describeMachine(m)}`).join('\n\n')}

PRICE SHEET REFERENCE:
${sheetPriceNotes}

Delivery and installation are standard on every machine — always shown as $0 included line items.`

  let options: QuoteOption[] = []

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: QUOTE_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed) && parsed.length === machines.length) {
      options = parsed
    }
  } catch {
    // Fall through to local engine
  }

  // Build from local engine if Claude failed or count mismatch
  if (options.length !== machines.length) {
    options = machines.map((m) => {
      const config = machineToConfig(m)
      const kw = parseKw(m.machinePower)
      const sheetPrice = lookupPrice(m.machineModel, m.laserSource, kw)
      const engineResult = buildQuoteOption(config, sheetPrice?.list ?? undefined)
      return {
        ...engineResult,
        machineLabel: m.label,
        machineModel: m.machineModel,
        machinePower: m.machinePower,
        laserSource: m.laserSource,
        bevelHead: m.bevelHead,
        name: m.machineModel ? `${m.machineModel} ${m.machinePower}` : engineResult.name,
        tagline: [
          m.laserSource !== 'IPG' ? m.laserSource : '',
          /plus\s*bevel/i.test(m.machineModel) ? 'Plus Bevel' : m.bevelHead !== 'None' ? m.bevelHead : '',
          m.automation !== 'None' ? `${m.automation} Automation` : '',
        ].filter(Boolean).join(' · ') || engineResult.tagline,
        notes: sheetPrice ? engineResult.notes : 'No standard price sheet match — custom pricing required.',
      }
    })
  }

  return Response.json({ options })
}
