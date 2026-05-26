'use client'

import { useState, useEffect } from 'react'
import BrandHeader from '@/components/BrandHeader'

interface User {
  id: string
  email: string
  name: string
  role: string
  createdAt: string
}

const ROLES = [
  { value: 'sales',  label: 'Sales Rep',  color: 'bg-blue-100 text-blue-700' },
  { value: 'admin',  label: 'Admin',      color: 'bg-purple-100 text-purple-700' },
  { value: 'dealer', label: 'Dealer',     color: 'bg-amber-100 text-amber-700' },
]

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLES.find(r => r.value === role) ?? { label: role, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

export default function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'sales' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingRole, setEditingRole] = useState<Record<string, string>>({})
  const [savingRole, setSavingRole] = useState<string | null>(null)

  async function fetchUsers() {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSuccess(`User ${data.user.email} created.`)
      setForm({ email: '', name: '', password: '', role: 'sales' })
      fetchUsers()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRoleSave(userId: string) {
    const newRole = editingRole[userId]
    if (!newRole) return
    setSavingRole(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: newRole }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEditingRole(prev => { const next = { ...prev }; delete next[userId]; return next })
      fetchUsers()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSavingRole(null)
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      fetchUsers()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const inputCls = 'cla-input py-2.5 text-sm'

  return (
    <div className="cla-page-canvas">
      <BrandHeader logoHeight={32} eyebrow="Users">
        <a href="/" className="cla-btn-ghost text-sm">
          ← Dashboard
        </a>
      </BrandHeader>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

        {/* Add user */}
        <div className="cla-elevated p-6 md:p-8 animate-cla-rise">
          <h2 className="font-display text-lg font-semibold text-[#0A2E52] tracking-tight mb-1">Add user</h2>
          <p className="text-sm text-gray-500 mb-4">
            Sales reps and admins access the full quoting tool. Dealers get a limited portal to submit quote requests.
          </p>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputCls}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {error   && <div className="col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
            {success && <div className="col-span-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

            <div className="col-span-2">
              <button
                type="submit"
                disabled={adding}
                className="cla-btn-primary px-6 py-2.5 text-sm disabled:active:scale-100"
              >
                {adding ? 'Adding…' : 'Add User'}
              </button>
            </div>
          </form>
        </div>

        {/* Users table */}
        <div className="cla-elevated overflow-hidden animate-cla-rise" style={{ animationDelay: '100ms' }}>
          <div className="px-6 py-4 border-b border-brand-rule-gray/50 bg-gradient-to-r from-brand-steel-light/40 to-transparent">
            <h2 className="font-display font-semibold text-[#0A2E52]">Users ({users.length})</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-warm-white/80 border-b border-brand-rule-gray/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Added</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isEditing = u.id in editingRole
                  return (
                    <tr key={u.id} className="border-t border-brand-rule-gray/40 hover:bg-brand-steel-light/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                      <td className="px-4 py-3 text-gray-500">{u.email}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editingRole[u.id]}
                              onChange={e => setEditingRole(prev => ({ ...prev, [u.id]: e.target.value }))}
                              className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B6FC8]"
                            >
                              {ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleRoleSave(u.id)}
                              disabled={savingRole === u.id}
                              className="text-xs text-white bg-[#0A2E52] hover:bg-brand-steel px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {savingRole === u.id ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingRole(prev => { const next = { ...prev }; delete next[u.id]; return next })}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <RoleBadge role={u.role} />
                            <button
                              onClick={() => setEditingRole(prev => ({ ...prev, [u.id]: u.role }))}
                              className="text-xs text-gray-400 hover:text-[#1B6FC8] transition-colors"
                              title="Change role"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
