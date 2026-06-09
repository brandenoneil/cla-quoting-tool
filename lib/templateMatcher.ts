import type { QuoteTemplate } from '@/lib/hubspot'

/**
 * Machine family → keywords that should appear in a HubSpot template name.
 * Order matters — first match wins.
 */
const FAMILY_KEYWORDS: { patterns: RegExp[]; keywords: string[] }[] = [
  {
    // PLUS Bevel — more specific than generic PLUS or PLUS EVO
    patterns: [/plus\s*bevel/i],
    keywords: ['plus bevel', 'plus-bevel', 'bevel'],
  },
  {
    // PLUS EVO — more specific than generic PLUS
    patterns: [/plus\s*evo/i],
    keywords: ['plus evo', 'plus-evo', 'evo'],
  },
  {
    // Fiber HD — before generic fiber/tube
    patterns: [/fiber\s*hd/i, /\bfhd\b/i],
    keywords: ['fiber hd', 'fiberhd', 'fiber-hd', 'fhd'],
  },
  {
    patterns: [/\bfast\b/i],
    keywords: ['fast'],
  },
  {
    patterns: [/\bxmf\b/i],
    keywords: ['xmf'],
  },
  {
    patterns: [/\bxme\b/i],
    keywords: ['xme'],
  },
  {
    patterns: [/\btube\b/i, /\btl\d/i],
    keywords: ['tube', 'fiber tube'],
  },
  {
    patterns: [/\bfiber\b/i],
    keywords: ['fiber'],
  },
  {
    patterns: [/\bplus\b/i],
    keywords: ['plus'],
  },
]

function detectFamily(machineModel: string): string[] {
  for (const entry of FAMILY_KEYWORDS) {
    if (entry.patterns.some((p) => p.test(machineModel))) {
      return entry.keywords
    }
  }
  return []
}

/** Customer-specific template name keywords (company or deal name). */
const COMPANY_TEMPLATE_KEYWORDS: { patterns: RegExp[]; keywords: string[] }[] = [
  { patterns: [/fanello/i], keywords: ['fanello'] },
  { patterns: [/ryerson/i], keywords: ['ryerson'] },
]

function detectCompanyKeywords(companyName: string, dealName?: string): string[] {
  const hay = `${companyName} ${dealName ?? ''}`
  const out: string[] = []
  for (const entry of COMPANY_TEMPLATE_KEYWORDS) {
    if (entry.patterns.some((p) => p.test(hay))) out.push(...entry.keywords)
  }
  return out
}

function findTemplateByKeywords(keywords: string[], templates: QuoteTemplate[]): QuoteTemplate | null {
  for (const kw of keywords) {
    const match = templates.find((t) => t.name.toLowerCase().includes(kw.toLowerCase()))
    if (match) return match
  }
  return null
}

/**
 * Suggest template from company/deal name first, then machine family.
 */
export function suggestTemplate(
  machineModel: string,
  templates: QuoteTemplate[],
  companyName?: string,
  dealName?: string
): QuoteTemplate | null {
  if (templates.length === 0) return null
  const companyKw = detectCompanyKeywords(companyName ?? '', dealName)
  const companyMatch = findTemplateByKeywords(companyKw, templates)
  if (companyMatch) return companyMatch
  return recommendTemplate(machineModel, templates)
}

/**
 * Given a machine model string and a list of HubSpot quote templates,
 * returns the best-matching template (or null if none found).
 */
export function recommendTemplate(
  machineModel: string,
  templates: QuoteTemplate[]
): QuoteTemplate | null {
  if (!machineModel || templates.length === 0) return null

  const keywords = detectFamily(machineModel)
  return findTemplateByKeywords(keywords, templates)
}

/**
 * Score all templates for a given machine model.
 * Returns templates sorted by relevance (score descending).
 */
export function rankTemplates(
  machineModel: string,
  templates: QuoteTemplate[]
): (QuoteTemplate & { score: number })[] {
  const keywords = detectFamily(machineModel)

  return templates
    .map((t) => {
      const nameLower = t.name.toLowerCase()
      let score = 0
      for (const kw of keywords) {
        if (nameLower.includes(kw.toLowerCase())) {
          // More specific (longer) keywords score higher
          score += kw.length * 2
        }
      }
      return { ...t, score }
    })
    .sort((a, b) => b.score - a.score)
}
