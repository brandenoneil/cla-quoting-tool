import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAnthropicClient, EXTRACT_SYSTEM_PROMPT, parseQuoteData } from '@/lib/anthropic'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const contentType = req.headers.get('content-type') || ''
    const client = getAnthropicClient()

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      const transcript = formData.get('transcript') as string | null

      // Voice transcript — plain text path
      if (transcript) {
        return await extractFromText(client, transcript)
      }

      if (!file) {
        return Response.json({ error: 'No file provided.' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const filename = file.name.toLowerCase()

      if (filename.endsWith('.pdf')) {
        // Send PDF directly to Claude — handles text-based AND image/scanned PDFs
        return await extractFromPdf(client, buffer)
      } else if (filename.endsWith('.txt')) {
        return await extractFromText(client, buffer.toString('utf-8'))
      } else if (filename.endsWith('.docx')) {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        return await extractFromText(client, result.value)
      } else {
        return Response.json({ error: 'Unsupported file type. Use PDF, DOCX, or TXT.' }, { status: 400 })
      }
    } else {
      const body = await req.json()
      return await extractFromText(client, body.text || '')
    }
  } catch (err: any) {
    console.error('[/api/extract]', err)
    return Response.json({ error: err?.message || 'Extraction failed. Please try again.' }, { status: 500 })
  }
}

async function extractFromPdf(client: ReturnType<typeof getAnthropicClient>, buffer: Buffer) {
  const base64 = buffer.toString('base64')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          } as any,
          {
            type: 'text',
            text: 'Extract the laser machine quote configuration from this document.',
          },
        ],
      },
    ],
  })

  return finalize(message as any)
}

async function extractFromText(client: ReturnType<typeof getAnthropicClient>, text: string) {
  if (!text.trim()) {
    return Response.json({ error: 'No text could be extracted from the file.' }, { status: 400 })
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Extract quote data from this text:\n\n${text.slice(0, 8000)}` }],
  })

  return finalize(message as any)
}

function finalize(message: { content: Array<{ type: string; text?: string }> }) {
  const responseText = message.content[0].type === 'text' ? (message.content[0].text ?? '') : ''
  const quoteData = parseQuoteData(responseText)

  if (!quoteData) {
    return Response.json({
      error: 'Could not parse structured data. Try the Chat tab for better results.',
      raw: responseText,
    }, { status: 422 })
  }

  return Response.json({ quoteData })
}
