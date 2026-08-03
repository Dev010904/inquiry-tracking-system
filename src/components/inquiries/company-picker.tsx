'use client'

import { useMemo, useRef, useState } from 'react'
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Select, optionsFrom } from '@/components/ui/select'
import { COMPANY_TYPE } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { CompanyType } from '@/types/database'

export type CompanyOption = {
  id: string
  name: string
  type: CompanyType
  city: string | null
}

export type NewCompanyDraft = {
  name: string
  type: CompanyType
  city: string
  state: string
}

type Props = {
  companies: CompanyOption[]
  selectedId?: string
  onSelect: (id: string | undefined) => void
  draft: NewCompanyDraft | null
  onDraftChange: (draft: NewCompanyDraft | null) => void
  /** Editing an existing inquiry cannot create a company. */
  allowCreate?: boolean
  error?: string
}

const EMPTY_DRAFT: NewCompanyDraft = { name: '', type: 'company', city: '', state: '' }

/**
 * Filtering happens in the browser over the full company list, which the
 * server already loaded. At a few hundred clients that is instant and avoids
 * a round trip per keystroke; if the list ever outgrows that, this is the one
 * place to swap in a server search.
 */
export function CompanyPicker({
  companies,
  selectedId,
  onSelect,
  draft,
  onDraftChange,
  allowCreate = true,
  error,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const selected = companies.find((c) => c.id === selectedId)

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return companies.slice(0, 50)
    return companies.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 50)
  }, [companies, query])

  if (draft) {
    return (
      <div className="space-y-3 rounded-md border border-dashed p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">New company</p>
          <Button variant="ghost" size="sm" onClick={() => onDraftChange(null)}>
            Pick existing instead
          </Button>
        </div>

        <Field label="Name" htmlFor="new-company-name" required error={error}>
          <Input
            id="new-company-name"
            value={draft.name}
            autoFocus
            onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
            placeholder="e.g. Sunrise Public School"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type" htmlFor="new-company-type" required>
            <Select
              id="new-company-type"
              value={draft.type}
              onChange={(e) => onDraftChange({ ...draft, type: e.target.value as CompanyType })}
            >
              {optionsFrom(COMPANY_TYPE)}
            </Select>
          </Field>
          <Field label="City" htmlFor="new-company-city">
            <Input
              id="new-company-city"
              value={draft.city}
              onChange={(e) => onDraftChange({ ...draft, city: e.target.value })}
            />
          </Field>
          <Field label="State" htmlFor="new-company-state">
            <Input
              id="new-company-state"
              value={draft.state}
              onChange={(e) => onDraftChange({ ...draft, state: e.target.value })}
            />
          </Field>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-base',
            error && 'border-destructive'
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected
              ? `${selected.name}${selected.city ? ` · ${selected.city}` : ''}`
              : 'Select a company or school'}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        {open && (
          <div
            ref={listRef}
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg"
          >
            <div className="border-b p-2">
              <Input
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search companies…"
                aria-label="Search companies"
                className="h-10"
              />
            </div>

            <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
              {matches.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No company matches “{query}”.
                </li>
              )}
              {matches.map((company) => (
                <li key={company.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={company.id === selectedId}
                    onClick={() => {
                      onSelect(company.id)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-sm hover:bg-accent"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{company.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {COMPANY_TYPE[company.type]}
                        {company.city ? ` · ${company.city}` : ''}
                      </span>
                    </span>
                    {company.id === selectedId && (
                      <Check className="h-4 w-4 text-primary" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {allowCreate && (
              <div className="border-t p-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(undefined)
                    onDraftChange({ ...EMPTY_DRAFT, name: query })
                    setOpen(false)
                    setQuery('')
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-accent"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {query ? `Add “${query}” as a new company` : 'Add a new company'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
