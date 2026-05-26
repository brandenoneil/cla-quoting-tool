'use client'

import { useState, useCallback } from 'react'

interface Props {
  onQuoteDataExtracted: (data: Record<string, any>) => void
}

export default function IntakeUpload({ onQuoteDataExtracted }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback((f: File) => {
    const allowed = ['.pdf', '.docx', '.txt']
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!allowed.includes(ext)) {
      setError('Only .pdf, .docx, and .txt files are supported')
      return
    }
    setFile(f)
    setError('')
  }, [])

  async function handleExtract() {
    if (!file) return
    setExtracting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
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

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 cursor-pointer ${
          dragOver ? 'border-brand-steel bg-brand-steel-light/60 shadow-cla-card' : 'border-brand-rule-gray/70 hover:border-brand-steel/40 bg-white/60'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        {file ? (
          <p className="text-sm font-medium text-[#0A2E52]">{file.name}</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">Drop your file here, or <span className="text-[#1B6FC8] font-medium">browse</span></p>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, or TXT</p>
          </>
        )}
      </div>

      {error && <div className="cla-alert-error">{error}</div>}

      {file && !extracted && (
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="cla-btn-primary w-full py-3 disabled:active:scale-100"
        >
          {extracting ? 'Extracting quote data…' : 'Extract Quote Data →'}
        </button>
      )}

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
          <div className="flex gap-3">
            <button
              onClick={() => { setExtracted(null); setFile(null) }}
              className="cla-btn-secondary flex-1 py-2.5 text-sm"
            >
              Re-upload
            </button>
            <button
              onClick={() => onQuoteDataExtracted(extracted)}
              className="cla-btn-primary flex-1 py-2.5 text-sm"
            >
              Use These Details →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
