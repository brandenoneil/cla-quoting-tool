'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import DealCard from '@/components/DealCard'
import type { HubSpotDeal } from '@/types'
import { parseDealName } from '@/lib/dealParser'

interface Company { id: string; properties: { name: string; city?: string; state?: string } }

interface EnrichedDeal extends HubSpotDeal {
  contact?: { properties: { firstname?: string; lastname?: string; email?: string; phone?: string } }
}

interface Props {
  onDealSelected: (deal: EnrichedDeal, parsedInfo: any) => void
}

export default function DealSelect({ onDealSelected }: Props) {
  const [tab, setTab] = useState<'search' | 'new'>('search')
  const [query, setQuery] = useState('')
  const [deals, setDeals] = useState<EnrichedDeal[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()

  // New deal form state
  const [newDeal, setNewDeal] = useState({
    companyName: '', contactName: '', contactEmail: '',
    contactPhone: '', machineInterest: '', closeDate: '',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Company search autocomplete
  const [companyQuery, setCompanyQuery] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [companySearching, setCompanySearching] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const companyDebounce = useRef<NodeJS.Timeout>()
  const companyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    clearTimeout(companyDebounce.current)
    if (companyQuery.length < 2) { setCompanies([]); return }
    companyDebounce.current = setTimeout(async () => {
      setCompanySearching(true)
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(companyQuery)}`)
        const data = await res.json()
        setCompanies(data.companies ?? [])
        setCompanyOpen(true)
      } catch {}
      finally { setCompanySearching(false) }
    }, 300)
  }, [companyQuery])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) {
        setCompanyOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectCompany(c: Company) {
    setSelectedCompany(c)
    setNewDeal(d => ({ ...d, companyName: c.properties.name }))
    setCompanyQuery(c.properties.name)
    setCompanyOpen(false)
  }

  const fetchDeals = useCallback(async (q: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/deals/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDeals(data.deals || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchDeals(query), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, fetchDeals])

  // Initial load
  useEffect(() => { fetchDeals('') }, [fetchDeals])

  function handleSelectDeal(deal: EnrichedDeal) {
    setSelectedId(deal.id)
    const parsed = parseDealName(deal.properties.dealname)
    const contactName = [
      deal.contact?.properties.firstname,
      deal.contact?.properties.lastname,
    ].filter(Boolean).join(' ')

    onDealSelected(deal, {
      dealId: deal.id,
      dealName: deal.properties.dealname,
      company: parsed.company || deal.properties.dealname.split(' - ')[0],
      contactName,
      contactEmail: deal.contact?.properties.email || '',
      contactPhone: deal.contact?.properties.phone || '',
      machineModel: parsed.model,
      machinePower: parsed.power,
      laserSource: parsed.laserSource,
    })
  }

  async function handleCreateDeal(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCompany) {
      setCreateError('Please select a company from the search results.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/deals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDeal),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const enriched: EnrichedDeal = {
        ...data.deal,
        contact: data.contact,
      }
      handleSelectDeal(enriched)
    } catch (e: any) {
      setCreateError(e.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="cla-section-heading">Select a deal</h2>
      <p className="cla-section-sub">Search for an existing HubSpot deal or create a new one.</p>

      {/* Tabs */}
      <div className="cla-tabs">
        {(['search', 'new'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`cla-tab ${tab === t ? 'cla-tab-active' : ''}`}
          >
            {t === 'search' ? 'Search existing deal' : 'Create new deal'}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <div>
          <div className="relative mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deal name, company…"
              className="cla-input pl-10 pr-4 py-3"
            />
            <svg className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {loading && (
              <div className="absolute right-3 top-3.5 w-4 h-4 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {error && (
            <div className="cla-alert-error mb-4">{error}</div>
          )}

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {deals.length === 0 && !loading && (
              <p className="text-gray-400 text-sm text-center py-8">No deals found</p>
            )}
            {deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onSelect={handleSelectDeal}
                selected={selectedId === deal.id}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'new' && (
        <form onSubmit={handleCreateDeal} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
              <div className="relative" ref={companyRef}>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={companyQuery}
                  onChange={e => {
                    setCompanyQuery(e.target.value)
                    setSelectedCompany(null)
                    setNewDeal(d => ({ ...d, companyName: '' }))
                  }}
                  onFocus={() => { if (companies.length > 0) setCompanyOpen(true) }}
                  placeholder="Search HubSpot companies…"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B6FC8] text-sm pr-8 ${
                    selectedCompany ? 'border-green-400 bg-green-50' : 'border-gray-300'
                  }`}
                />
                {companySearching && (
                  <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
                )}
                {selectedCompany && !companySearching && (
                  <svg className="absolute right-3 top-2.5 w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}

                {companyOpen && companies.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto">
                    {companies.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectCompany(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#E6F1FB] transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        <p className="text-sm font-medium text-[#0A2E52]">{c.properties.name}</p>
                        {(c.properties.city || c.properties.state) && (
                          <p className="text-xs text-gray-400">
                            {[c.properties.city, c.properties.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {companyOpen && companyQuery.length >= 2 && companies.length === 0 && !companySearching && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 px-4 py-3 text-sm text-gray-400">
                    No companies found in HubSpot
                  </div>
                )}
              </div>
              {!selectedCompany && companyQuery.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">Select a company from the list</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
              <input
                required
                type="text"
                value={newDeal.contactName}
                onChange={(e) => setNewDeal({ ...newDeal, contactName: e.target.value })}
                className="cla-input py-2.5"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email *</label>
              <input
                required
                type="email"
                value={newDeal.contactEmail}
                onChange={(e) => setNewDeal({ ...newDeal, contactEmail: e.target.value })}
                className="cla-input py-2.5"
                placeholder="john@acmesteel.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
              <input
                type="tel"
                value={newDeal.contactPhone}
                onChange={(e) => setNewDeal({ ...newDeal, contactPhone: e.target.value })}
                className="cla-input py-2.5"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Machine Interest</label>
              <input
                type="text"
                value={newDeal.machineInterest}
                onChange={(e) => setNewDeal({ ...newDeal, machineInterest: e.target.value })}
                className="cla-input py-2.5"
                placeholder="XMF 6020 20kW IPG"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Est. Close Date</label>
              <input
                type="date"
                value={newDeal.closeDate}
                onChange={(e) => setNewDeal({ ...newDeal, closeDate: e.target.value })}
                className="cla-input py-2.5"
              />
            </div>
          </div>

          {createError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{createError}</div>
          )}

          <button
            type="submit"
            disabled={creating}
            className="cla-btn-primary w-full py-3 disabled:active:scale-100"
          >
            {creating ? 'Creating deal in HubSpot…' : 'Create Deal & Continue →'}
          </button>
        </form>
      )}
    </div>
  )
}
