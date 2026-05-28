'use client'

import { useState, useEffect, useRef } from 'react'

interface CustomerInfo {
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  notes: string
}

interface CompanyResult {
  id: string
  name: string
  city?: string
  state?: string
  contact: { name: string; email: string; phone: string } | null
}

interface Props {
  onContinue: (info: CustomerInfo) => void
}

export default function DealerCustomerForm({ onContinue }: Props) {
  const [company, setCompany]           = useState('')
  const [contactName, setContactName]   = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [notes, setNotes]               = useState('')
  const [error, setError]               = useState('')
  const [crmBanner, setCrmBanner]       = useState('')

  // ── Company search ───────────────────────────────────────────────────────────
  const [results, setResults]       = useState<CompanyResult[]>([])
  const [searching, setSearching]   = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(null)
  const debounceRef = useRef<NodeJS.Timeout>()
  const wrapperRef  = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced search on company name change (skip after CRM pick — otherwise dropdown reopens)
  useEffect(() => {
    if (selectedCompany && company === selectedCompany.name) {
      return
    }

    clearTimeout(debounceRef.current)
    if (company.length < 2) {
      setResults([])
      setDropdownOpen(false)
      setCrmBanner('')
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(company)}`, {
          credentials: 'same-origin',
        })
        let data: {
          companies?: CompanyResult[]
          hubspotConfigured?: boolean
          message?: string
          error?: string
        } = {}
        try {
          data = await res.json()
        } catch {
          data = {}
        }
        const list = data.companies ?? []
        if (!res.ok) {
          setResults([])
          setDropdownOpen(false)
          setCrmBanner(
            data.error ??
              (res.status === 401
                ? 'Session expired — refresh the page and sign in again.'
                : `CRM search failed (${res.status}).`)
          )
          return
        }
        setResults(list)
        setDropdownOpen(list.length > 0)
        if (data.hubspotConfigured === false && data.message) {
          setCrmBanner(data.message)
        } else if (data.error) {
          setCrmBanner(data.error)
        } else {
          setCrmBanner('')
        }
      } catch {
        setResults([])
        setDropdownOpen(false)
        setCrmBanner('Could not reach CRM search.')
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [company, selectedCompany])

  function selectCompany(result: CompanyResult) {
    setSelectedCompany(result)
    setCompany(result.name)
    setDropdownOpen(false)
    setResults([])
    if (result.contact) {
      if (result.contact.name)  setContactName(result.contact.name)
      if (result.contact.email) setContactEmail(result.contact.email)
      if (result.contact.phone) setContactPhone(result.contact.phone)
    }
  }

  function handleSubmit() {
    if (!company.trim() || !contactName.trim() || !contactEmail.trim()) {
      setError('Company, contact name, and email are required.')
      return
    }
    setError('')
    onContinue({
      company: company.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      notes: notes.trim(),
    })
  }

  const inputCls = 'cla-input py-2.5'
  const labelCls = 'cla-field-label'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="cla-section-heading">Customer information</h2>
        <p className="cla-section-sub mb-0">Enter the end customer&apos;s details. This will create a new deal in HubSpot.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* ── Company Name with search dropdown ── */}
        <div className="sm:col-span-2" ref={wrapperRef}>
          <label className={labelCls}>Company Name *</label>
          <div className="relative">
            <input
              className={
                inputCls +
                (dropdownOpen ? ' rounded-b-none border-b-0' : '') +
                (selectedCompany ? ' border-green-400 bg-green-50/50' : '')
              }
              placeholder="Acme Manufacturing Co."
              value={company}
              autoComplete="off"
              onChange={e => {
                setSelectedCompany(null)
                setCompany(e.target.value)
                setDropdownOpen(false)
              }}
              onFocus={() => {
                if (!selectedCompany && results.length > 0) setDropdownOpen(true)
              }}
            />

            {/* Spinner / selected indicator */}
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {selectedCompany && !searching && (
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}

            {/* Dropdown */}
            {dropdownOpen && results.length > 0 && (
              <div className="cla-dropdown rounded-t-none border-t-0 max-h-64">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectCompany(r) }}
                    className="w-full text-left px-4 py-3 hover:bg-[#E6F1FB] transition-colors border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0A2E52] truncate">{r.name}</p>
                        {(r.city || r.state) && (
                          <p className="text-xs text-gray-400">{[r.city, r.state].filter(Boolean).join(', ')}</p>
                        )}
                      </div>
                      {r.contact && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-600">{r.contact.name}</p>
                          <p className="text-xs text-gray-400">{r.contact.email}</p>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {dropdownOpen && results.length > 0 && !selectedCompany && (
            <p className="text-[11px] text-gray-400 mt-1">Select to auto-fill contact info, or continue typing to enter manually.</p>
          )}
          {crmBanner && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">{crmBanner}</p>
          )}
        </div>

        <div>
          <label className={labelCls}>Contact Name *</label>
          <input
            className={inputCls}
            placeholder="John Smith"
            value={contactName}
            onChange={e => setContactName(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Contact Email *</label>
          <input
            type="email"
            className={inputCls}
            placeholder="john@acme.com"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Contact Phone</label>
          <input
            className={inputCls}
            placeholder="(555) 000-0000"
            value={contactPhone}
            onChange={e => setContactPhone(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Additional Notes</label>
        <textarea
          className={inputCls + ' min-h-[80px] resize-y'}
          placeholder="Any specific requirements, timeline, or context for this customer…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="cla-alert-error">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        className="cla-btn-primary w-full py-3.5"
      >
        Continue →
      </button>
    </div>
  )
}
