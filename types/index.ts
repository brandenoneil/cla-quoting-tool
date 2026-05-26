export interface LineItem {
  description: string
  detail: string
  qty: number
  unitPrice: number
  amount: number
  included: boolean
}

// ─── Machine Option ───────────────────────────────────────────────────────────
// One entry per machine being quoted. The ReviewForm creates 1–3 of these.
export interface MachineOption {
  id: string
  label: string  // "Option A" | "Option B" | "Option C"

  // Basics
  machineModel: string
  machinePower: string
  laserSource: string

  // Cutting head (exclusive)
  bevelHead: 'None' | 'Basic Bevel' | 'Plus Bevel'

  // SMART Options (checkboxes)
  smartMix: boolean         // Gas Mix System
  smartChanger: boolean     // Automatic Nozzle Change
  smartGrease: boolean      // Automatic Greasing Point
  smartDoor: boolean        // Additional Side Door
  smartRaster: boolean      // 3D Relief Marking
  smartSetUp: boolean       // Automation Predisposition

  // Automation (exclusive)
  automation: 'None' | 'Inline No Tower' | 'No Tower' | 'With Tower'

  // Additional Equipment (checkboxes)
  pistonLift: boolean
  ulCertification: boolean
  cadCamSoftware: boolean   // Lantek / SigmaNAST
  sideLoad: boolean

  // Commercial Terms
  trainingDays: number
  extendedWarranty: string
  notes: string
}

// ─── Quote Form Data ──────────────────────────────────────────────────────────
export interface QuoteFormData {
  // Customer
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string

  // Machines (1–3 options being quoted)
  machines: MachineOption[]

  // Global notes
  notes: string
}

// ─── Quote Option (generated output per machine) ──────────────────────────────
export interface QuoteOption {
  // Machine identity
  machineLabel: string     // "Option A", "Option B", "Option C"
  machineModel: string
  machinePower: string
  laserSource: string
  bevelHead: string

  // Pricing
  name: string
  tagline: string
  machineBasePrice: number
  lineItems: LineItem[]
  subtotal: number
  discountLabel: string
  discountAmount: number
  freight: number
  totalPrice: number
  deliveryWeeks: number
  notes: string
}

// ─── Quote Config (internal, used by pricingEngine) ───────────────────────────
export interface QuoteConfig {
  model: string
  power: string
  laser: string
  bevel: string
  // delivery, installation are standard — always included
  training_days: number
  warranty: string
  // SMART Options
  smartMix: boolean
  smartChanger: boolean
  smartGrease: boolean
  smartDoor: boolean
  smartRaster: boolean
  smartSetUp: boolean
  // Automation
  automation: string
  // Additional
  pistonLift: boolean
  ulCertification: boolean
  cadCamSoftware: boolean
  sideLoad: boolean
  notes: string
}

export interface DealContact {
  id: string
  firstname?: string
  lastname?: string
  email?: string
}

export interface HubSpotDeal {
  id: string
  properties: {
    dealname: string
    amount?: string
    dealstage: string
    closedate?: string
    hubspot_owner_id?: string
    dealer_company?: string
    hs_lastmodifieddate?: string
  }
  associations?: {
    contacts?: { results: Array<{ id: string; type: string }> }
  }
}

export interface ParsedDeal {
  company: string
  model: string
  format: string
  power: string
  laserSource: string
  rawMatch: string
}

export type DealStageGroup = 'early' | 'mid' | 'late' | 'hold' | 'qualified'

export const STAGE_MAP: Record<string, { label: string; group: DealStageGroup }> = {
  '168290363': { label: 'Opportunity Qualified', group: 'qualified' },
  '168290364': { label: 'Initial Outreach', group: 'early' },
  '168290365': { label: 'Initial Project Mtg', group: 'early' },
  '168290366': { label: 'Prelim Proposal', group: 'mid' },
  '168307566': { label: 'Next Steps Mtg', group: 'mid' },
  '168307567': { label: 'Proposal Revision', group: 'mid' },
  '168290367': { label: 'Final Negotiation', group: 'late' },
  '219182244': { label: 'On Hold', group: 'hold' },
}

export const CLOSED_STAGES = ['168290368', '168290369']
export const PIPELINE_ID = '90932330'
export const HUBSPOT_PORTAL_ID = '45270912'
