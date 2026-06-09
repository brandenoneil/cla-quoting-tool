import { getReviewPricingWarnings } from '@/lib/sheetPricingWarnings'
import { normalizeModel } from '@/lib/pricingTable'

export interface IntakeConfigGuess {
  model?: string
  power?: string
  laser?: string
}

export interface SheetValidationWarning {
  userMessage: string
  aiInstruction: string
}

function modelLooksRecognized(model: string): boolean {
  const m = model.trim()
  return /(?:\d{4,5}|TL\d+)$/i.test(m)
}

/** Parse model / power / laser hints from a single user message. */
export function parseConfigFromText(text: string): IntakeConfigGuess {
  const result: IntakeConfigGuess = {}

  const powerMatch = text.match(/\b(\d+(?:\.\d+)?)\s*kW\b/i)
  if (powerMatch) {
    result.power = `${Math.round(parseFloat(powerMatch[1]))}kW`
  }

  if (/\bipg\b/i.test(text)) result.laser = 'IPG'
  if (/\braycus\b/i.test(text) || /\bracus\b/i.test(text)) result.laser = 'Raycus'

  const normalized = normalizeModel(text)
  if (modelLooksRecognized(normalized)) {
    result.model = normalized
  }

  return result
}

/** Merge config hints from all user messages (later messages override earlier ones). */
export function guessConfigFromMessages(
  messages: { role: string; content: string }[]
): IntakeConfigGuess {
  const merged: IntakeConfigGuess = {}

  for (const msg of messages) {
    if (msg.role !== 'user') continue
    const parsed = parseConfigFromText(msg.content)
    if (parsed.model) merged.model = parsed.model
    if (parsed.power) merged.power = parsed.power
    if (parsed.laser) merged.laser = parsed.laser
  }

  return merged
}

export function validateIntakeAgainstSheet(guess: IntakeConfigGuess): SheetValidationWarning[] {
  if (!guess.model) return []

  const model = normalizeModel(guess.model)
  const pricingWarnings = getReviewPricingWarnings({
    machineModel: model,
    machinePower: guess.power || '6kW',
    laserSource: guess.laser || 'IPG',
  })

  return pricingWarnings.map((w) => ({
    userMessage: w.message,
    aiInstruction:
      'Acknowledge that we do not have current pricing for this configuration on the Feb 2026 sheet. The rep may continue — machine base pricing will be TBD. Do not block them or call it a standard sheet price.',
  }))
}

/** Deterministic notice prepended to chat stream when config has no sheet pricing. */
export function getChatValidationNotice(
  messages: { role: string; content: string }[]
): string | null {
  const guess = guessConfigFromMessages(messages)
  const warnings = validateIntakeAgainstSheet(guess)
  if (warnings.length === 0) return null

  return `⚠ Pricing note: ${warnings.map((w) => w.userMessage).join(' ')}\n\n`
}

/** Extra system-prompt block for the model (in addition to the prepended notice). */
export function buildIntakeValidationSystemBlock(
  messages: { role: string; content: string }[]
): string | null {
  const guess = guessConfigFromMessages(messages)
  const warnings = validateIntakeAgainstSheet(guess)
  if (warnings.length === 0) return null

  const configDesc = [
    guess.model ? `model=${guess.model}` : null,
    guess.power ? `power=${guess.power}` : null,
    guess.laser ? `laser=${guess.laser || 'IPG (assumed)'}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return [
    '━━ PRICING NOTE (MANDATORY — mention in your next reply) ━━',
    `Configuration so far: ${configDesc || 'incomplete'}`,
    ...warnings.map((w) => `• ${w.userMessage}`),
    'Tell the rep we do not have current pricing for this option on the Feb 2026 sheet and machine base pricing will be TBD. They may continue.',
    'Bevel follow-up must be Yes or No only — never "None", "Basic Bevel", or "Plus Bevel" as bevel choices.',
  ].join('\n')
}
