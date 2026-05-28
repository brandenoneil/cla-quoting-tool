import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAnthropicClient, INTAKE_SYSTEM_PROMPT } from '@/lib/anthropic'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { messages, dealContext } = await req.json()

    const client = getAnthropicClient()

    let systemPrompt = INTAKE_SYSTEM_PROMPT

    if (dealContext) {
      const { companyDealHistory, ...coreDeal } = dealContext
      systemPrompt += `\n\nCurrent deal context: ${JSON.stringify(coreDeal)}`

    if (companyDealHistory?.length > 0) {
      const historyText = companyDealHistory.map((d: any) => {
        const lines: string[] = []
        const amt = d.amount ? `$${Number(d.amount).toLocaleString()}` : null
        lines.push(`DEAL: "${d.name}"`)
        lines.push(`  Stage: ${d.stage}${amt ? ` | Amount: ${amt}` : ''}${d.closeDate ? ` | Closed: ${d.closeDate.slice(0, 10)}` : ''}`)

        if (d.lineItems?.length > 0) {
          lines.push('  Line items (exact products/options sold):')
          d.lineItems.forEach((li: any) => {
            const desc = li.description || li.name || ''
            const price = li.price > 0 ? ` — $${Number(li.price).toLocaleString()}` : ''
            const qty = li.quantity > 1 ? ` x${li.quantity}` : ''
            if (desc) lines.push(`    • ${desc}${qty}${price}`)
          })
        }

        if (d.notes?.length > 0) {
          lines.push('  Notes from this deal:')
          d.notes.slice(0, 3).forEach((note: string) => {
            const trimmed = note.slice(0, 400)
            lines.push(`    "${trimmed}${note.length > 400 ? '...' : ''}"`)
          })
        }

        if (d.quotes?.length > 0) {
          lines.push('  Quotes:')
          d.quotes.forEach((q: any) => {
            const qAmt = q.amount ? ` — $${Number(q.amount).toLocaleString()}` : ''
            lines.push(`    • ${q.name} (${q.status})${qAmt}`)
          })
        }

        return lines.join('\n')
      }).join('\n\n')

      systemPrompt += `\n\n━━ DEAL HISTORY from HubSpot CRM ━━\nThe following is the full history of deals for this customer, including line items, notes, and quotes. Use this to answer questions about what was previously sold, which options they chose, which laser source, pricing, etc.\n\n${historyText}\n\nIf the rep mentions a deal or date that does NOT appear above, be honest that it may not be in the data you have access to.`
    } else {
      systemPrompt += `\n\nDEAL HISTORY: No previous deals found in HubSpot CRM for this company. This may be their first deal, or records may exist under a different name.`
    }
    }

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const data = `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`
              controller.enqueue(encoder.encode(data))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat service unavailable'
    return Response.json({ error: message }, { status: 500 })
  }
}
