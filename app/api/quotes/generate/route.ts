import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildQuoteOption } from '@/lib/pricingEngine'
import {
  coerceBevelForModel,
  coerceLaserSourceForModel,
  coercePowerForModel,
  isPlusBevelMachineModel,
} from '@/lib/machineConstraints'
import { coerceSmartOptionsForModel } from '@/lib/productRules'
import { lookupExactPrice, parseKw } from '@/lib/pricingTable'
import { NextRequest } from 'next/server'
import type { QuoteConfig, QuoteOption, MachineOption } from '@/types'

function sanitizeMachine(m: MachineOption): MachineOption {
  const laserSource = coerceLaserSourceForModel(m.laserSource, m.machineModel)
  const machinePower = coercePowerForModel(m.machinePower, m.machineModel, laserSource)
  const bevelHead = coerceBevelForModel(m.bevelHead, m.machineModel)
  const smart = coerceSmartOptionsForModel({
    machineModel: m.machineModel,
    smartMix: m.smartMix,
    smartChanger: m.smartChanger,
    smartGrease: m.smartGrease,
    smartDoor: m.smartDoor,
    smartRaster: m.smartRaster,
    smartSetUp: m.smartSetUp,
    automation: m.automation,
  })
  return {
    ...m,
    laserSource,
    machinePower,
    bevelHead,
    ...smart,
  }
}

function machineToConfig(m: MachineOption): QuoteConfig {
  return {
    model: m.machineModel || '',
    power: m.machinePower || '6kW',
    laser: m.laserSource || 'IPG',
    bevel: m.bevelHead || 'No',
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { formData } = await req.json()

  const rawMachines: MachineOption[] = formData.machines?.length
    ? formData.machines
    : [{
        id: 'legacy',
        label: 'Option A',
        machineModel: formData.machineModel || '',
        machinePower: formData.machinePower || '6kW',
        laserSource: formData.laserSource || 'IPG',
        bevelHead: formData.bevelHead || 'No',
        smartMix: false, smartChanger: false, smartGrease: false,
        smartDoor: false, smartRaster: false, smartSetUp: false,
        automation: 'None',
        pistonLift: false, ulCertification: false, cadCamSoftware: false, sideLoad: false,
        trainingDays: formData.trainingDays || 0,
        extendedWarranty: formData.extendedWarranty || 'None',
        notes: formData.notes || '',
      }]

  const machines = rawMachines.map(sanitizeMachine)

  const options: QuoteOption[] = machines.map((m) => {
    const config = machineToConfig(m)
    const kw = parseKw(m.machinePower)
    const sheetPrice = lookupExactPrice(m.machineModel, m.laserSource, kw)
    const customPricing = !sheetPrice
    const engineResult = buildQuoteOption(config, sheetPrice ? sheetPrice.list : 0)

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
        m.bevelHead === 'Yes' && !isPlusBevelMachineModel(m.machineModel) ? 'Bevel' : '',
        m.automation !== 'None' ? `${m.automation} Automation` : '',
      ].filter(Boolean).join(' · ') || engineResult.tagline,
      notes: customPricing
        ? 'No standard price sheet match — custom pricing required.'
        : engineResult.notes,
    }
  })

  return Response.json({ options })
}
