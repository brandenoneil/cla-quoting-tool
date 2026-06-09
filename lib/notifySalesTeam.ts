import {
  associateObjects,
  associateV3,
  createNote,
  createTask,
  updateDeal,
} from '@/lib/hubspot'
import {
  getSalesAlertOwnerIds,
  hubspotDealUrl,
  hubspotQuoteUrl,
} from '@/lib/hubspotConfig'

const QUOTE_TOOL_STATUS_PROPERTY = 'quote_tool_status'
const QUOTE_TOOL_MACHINE_SUMMARY_PROPERTY = 'quote_tool_machine_summary'

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function associateNoteToDeal(noteId: string, dealId: string) {
  try {
    await associateObjects('notes', noteId, 'deals', dealId, 214)
  } catch {
    try {
      await associateV3('notes', noteId, 'deals', dealId, 'note_to_deal')
    } catch {
      /* non-fatal */
    }
  }
}

async function associateTaskToDeal(taskId: string, dealId: string) {
  try {
    await associateObjects('tasks', taskId, 'deals', dealId, 216)
  } catch {
    try {
      await associateV3('tasks', taskId, 'deals', dealId, 'task_to_deal')
    } catch {
      /* non-fatal */
    }
  }
}

export interface DealerQuoteAlertOption {
  machineLabel: string
  machineModel: string
  machinePower: string
  name: string
  totalPrice: number
  quoteNumber: string
  hubspotQuoteId?: string | null
  customPricing?: boolean
}

export interface DealerQuoteAlertPayload {
  dealId: string
  dealName: string
  dealerName: string
  dealerEmail: string
  dealerCompany?: string
  customerCompany: string
  contactName: string
  contactEmail: string
  options: DealerQuoteAlertOption[]
  hubspotDraftErrors?: string[]
}

/** HubSpot-native alerts after dealer quote drafts are on the deal. */
export async function notifySalesTeamOfDealerQuote(payload: DealerQuoteAlertPayload): Promise<void> {
  const ownerIds = getSalesAlertOwnerIds()
  const primaryOwnerId = ownerIds[0]
  const dealUrl = hubspotDealUrl(payload.dealId)

  const machineSummary = payload.options
    .map(
      (o) =>
        `${o.machineLabel}: ${o.machineModel} ${o.machinePower}` +
        (o.totalPrice > 0 ? ` ~$${Math.round(o.totalPrice).toLocaleString()}` : ' (custom pricing)') +
        (o.customPricing ? ' [TBD]' : '')
    )
    .join(' | ')

  const quoteLines = payload.options
    .map((o) => {
      const price =
        o.totalPrice > 0 ? `$${Math.round(o.totalPrice).toLocaleString()}` : 'Custom pricing required'
      const quoteLink = o.hubspotQuoteId ? hubspotQuoteUrl(o.hubspotQuoteId) : null
      return [
        `${o.quoteNumber} — ${o.machineLabel} ${o.machineModel} ${o.machinePower} — ${price}`,
        quoteLink ? `  Quote: ${quoteLink}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const noteBody = [
    '🔔 Dealer quote request — action required',
    '',
    `Deal: ${payload.dealName}`,
    `Deal link: ${dealUrl}`,
    '',
    `Dealer: ${payload.dealerName} (${payload.dealerEmail})` +
      (payload.dealerCompany ? ` — ${payload.dealerCompany}` : ''),
    `Customer: ${payload.customerCompany} · ${payload.contactName} · ${payload.contactEmail}`,
    '',
    'Requested configurations:',
    machineSummary,
    '',
    'HubSpot quotes:',
    quoteLines,
    ...(payload.hubspotDraftErrors?.length
      ? ['', `Warnings: ${payload.hubspotDraftErrors.join(' | ')}`]
      : []),
  ].join('\n')

  try {
    const note = await createNote(noteBody)
    await delay(100)
    await associateNoteToDeal(note.id, payload.dealId)
  } catch {
    /* non-fatal */
  }

  const taskSubject = `Review dealer quote: ${payload.customerCompany} — ${payload.options[0]?.machineModel ?? 'quote'}`
  const taskBody = [
    `${payload.dealerName} submitted a quote request via the dealer portal.`,
    `Customer: ${payload.customerCompany} (${payload.contactName})`,
    machineSummary,
    `Open deal: ${dealUrl}`,
  ].join('\n')

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 1)

  for (const ownerId of ownerIds) {
    try {
      const task = await createTask(taskSubject, taskBody, 'HIGH', { ownerId, dueDate })
      await delay(100)
      await associateTaskToDeal(task.id, payload.dealId)
    } catch {
      /* non-fatal */
    }
  }

  try {
    const dealProps: Record<string, string> = {
      [QUOTE_TOOL_STATUS_PROPERTY]: 'ready_for_review',
      [QUOTE_TOOL_MACHINE_SUMMARY_PROPERTY]: machineSummary.slice(0, 500),
    }
    if (primaryOwnerId) dealProps.hubspot_owner_id = primaryOwnerId
    await updateDeal(payload.dealId, dealProps)
  } catch {
    /* workflow trigger may need custom properties created in HubSpot admin */
  }
}

