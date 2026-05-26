'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  onQuoteDataExtracted: (data: Record<string, any>) => void
}

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export default function IntakeVoice({ onQuoteDataExtracted }: Props) {
  const [supported, setSupported] = useState(true)
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState('')
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let final = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' '
        }
      }
      setTranscript(final.trim())
    }

    recognition.onerror = (e: any) => {
      setError(`Speech recognition error: ${e.error}`)
      setRecording(false)
    }

    recognitionRef.current = recognition
  }, [])

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop()
      setRecording(false)
    } else {
      setTranscript('')
      setError('')
      recognitionRef.current?.start()
      setRecording(true)
    }
  }

  async function handleExtract() {
    if (!transcript.trim()) return
    setExtracting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('transcript', transcript)
      const res = await fetch('/api/extract', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setExtracted(data.quoteData)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExtracting(false)
    }
  }

  if (!supported) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-sm">Voice input requires Chrome or Edge browser.</p>
        <p className="text-gray-400 text-xs mt-1">Please use the Chat or Upload tab instead.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center py-6">
        <button
          onClick={toggleRecording}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center text-white transition-all ${
            recording
              ? 'bg-red-500 hover:bg-red-600 shadow-lg'
              : 'bg-[#0A2E52] hover:bg-[#1B6FC8]'
          }`}
        >
          {recording && (
            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
          )}
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
            {recording ? (
              <rect x="6" y="6" width="8" height="8" rx="1" />
            ) : (
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            )}
          </svg>
        </button>
        <p className="mt-3 text-sm text-gray-500">
          {recording ? 'Recording… click to stop' : 'Click to start recording'}
        </p>
      </div>

      {transcript && (
        <div className="p-4 cla-elevated">
          <h4 className="cla-kicker mb-2">Transcript</h4>
          <p className="text-sm text-gray-700">{transcript}</p>
          {!recording && !extracted && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="mt-3 w-full cla-btn-primary py-2.5 text-sm disabled:active:scale-100"
            >
              {extracting ? 'Extracting…' : 'Extract Quote Data →'}
            </button>
          )}
        </div>
      )}

      {error && <div className="cla-alert-error">{error}</div>}

      {extracted && (
        <div className="space-y-3">
          <div className="p-4 cla-alert-success">
            <h4 className="text-sm font-semibold text-green-800 mb-2">Extracted Fields</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {Object.entries(extracted).map(([key, val]) => (
                <div key={key} className="flex gap-1">
                  <dt className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</dt>
                  <dd className="font-medium text-gray-800">{String(val)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <button
            onClick={() => onQuoteDataExtracted(extracted)}
            className="w-full cla-btn-primary py-2.5 text-sm"
          >
            Use These Details →
          </button>
        </div>
      )}
    </div>
  )
}
