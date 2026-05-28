'use client'

import { useState, useRef, useEffect } from 'react'
import { parseQuoteData } from '@/lib/anthropic'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  dealContext: any
  onQuoteDataExtracted: (data: Record<string, any>) => void
}

export default function IntakeChat({ dealContext, onQuoteDataExtracted }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [quoteDetected, setQuoteDetected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-start conversation
  useEffect(() => {
    const greeting = `Hi! I'm ready to help build a quote for ${dealContext.company || 'your customer'}. ${dealContext.machineModel ? `I see you're looking at a **${dealContext.machineModel}${dealContext.machinePower ? ' ' + dealContext.machinePower : ''}** — let me confirm a few details.` : 'What machine model are they interested in?'}`
    setMessages([{ role: 'assistant', content: greeting }])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Re-focus the input after streaming ends (disabled → enabled triggers a blur)
  useEffect(() => {
    if (!streaming && !quoteDetected) {
      inputRef.current?.focus()
    }
  }, [streaming])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || streaming) return

    const userMessage = input.trim()
    setInput('')
    const updatedMessages = [...messages, { role: 'user' as const, content: userMessage }]
    setMessages(updatedMessages)
    setStreaming(true)

    let fullResponse = ''
    const assistantIndex = updatedMessages.length

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const controller = new AbortController()
      const timeoutMs = 45000
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: updatedMessages,
          dealContext,
        }),
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        let details = ''
        try {
          const data = await res.json()
          details = data?.error ? ` ${data.error}` : ''
        } catch {
          /* ignore json parse failures */
        }
        throw new Error(`Chat request failed (${res.status}).${details}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No streaming response from chat service.')
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (payload === '[DONE]') break
            try {
              const { text: chunk } = JSON.parse(payload)
              fullResponse += chunk
              setMessages((prev) => {
                const updated = [...prev]
                updated[assistantIndex] = { role: 'assistant', content: fullResponse }
                return updated
              })
            } catch {}
          }
        }
      }

      // Check if quote data was emitted
      const quoteData = parseQuoteData(fullResponse)
      if (quoteData) {
        setQuoteDetected(true)
        // Small delay so user can see the response before auto-advancing
        setTimeout(() => onQuoteDataExtracted(quoteData), 1500)
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Chat timed out. Please try again.'
          : 'Sorry, there was an error. Please try again.'
      setMessages((prev) => {
        const updated = [...prev]
        updated[assistantIndex] = {
          role: 'assistant',
          content: message,
        }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  function renderContent(content: string) {
    // Strip the JSON block from display
    return content.replace(/\[QUOTE_DATA\][\s\S]*?\[\/QUOTE_DATA\]/g, '')
  }

  return (
    <div className="flex flex-col h-[520px]">
      {quoteDetected && (
        <div className="mb-3 px-4 py-2 cla-alert-success flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Quote data collected — advancing to review…
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#0A2E52] text-white rounded-br-sm'
                  : 'bg-brand-steel-light/80 text-brand-text-mid rounded-bl-sm border border-brand-steel/10'
              }`}
            >
              {renderContent(msg.content)}
              {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="mt-3 flex gap-2">
        <textarea
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage(e)
            }
          }}
          placeholder="Type your response…"
          rows={2}
          disabled={streaming || quoteDetected}
          className="flex-1 cla-input py-2 resize-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim() || quoteDetected}
          className="cla-btn-primary px-4 py-2 self-end disabled:opacity-40 disabled:active:scale-100"
        >
          Send
        </button>
      </form>
    </div>
  )
}
