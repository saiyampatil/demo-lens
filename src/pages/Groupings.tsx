import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLensStore } from '@/store/useLensStore'
import PageHeader from '@/components/PageHeader'
import Select from '@/components/ui/Select'
import { QUESTIONS } from '@/engine/questions'
import {
  RANGE_BOUNDS, TEMPLATES, checkDefinition, compatibleVariables, deleteDef, describeDef, newGroupId, optionLabel, optionQuestions,
  rangeQuestions, saveDef, setApplied, unclassifiedCodes, unknownCodes, useApplied, useGroupings, validateDef,
  type ClassGroup, type DefCheck, type GroupingDef, type GroupingType,
} from '@/engine/groupings'

type Draft = {
  id: string
  type: GroupingType
  name: string
  variable: string
  variables: string[]
  kind: 'options' | 'range'
  members: number[]
  min: string
  max: string
  groups: ClassGroup[]
}

const PRESETS: Record<string, { label: string; min: number; max: number }[]> = {
  Q4: [{ label: 'Top 2 box (4–5)', min: 4, max: 5 }, { label: 'Top box (5)', min: 5, max: 5 }, { label: 'Bottom 2 box (1–2)', min: 1, max: 2 }],
  Q6: [{ label: 'Promoters (9–10)', min: 9, max: 10 }, { label: 'Passives (7–8)', min: 7, max: 8 }, { label: 'Detractors (0–6)', min: 0, max: 6 }],
  Q5: [{ label: 'Up to 3 a week', min: 0, max: 3 }, { label: '8 or more a week', min: 8, max: 98 }],
}

const NOW = () => new Date().toISOString()
const qLabel = (id: string) => QUESTIONS[id]?.label ?? id
const isRangeVar = (id: string) => rangeQuestions().some((d) => d.id === id)
const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function newDraft(type: GroupingType): Draft {
  const variable = 'Q1'
  return { id: '', type, name: '', variable, variables: compatibleVariables(variable), kind: 'options', members: [], min: '', max: '', groups: type === 'classification' ? [{ id: newGroupId(), label: '', members: [] }] : [] }
}
function draftFromDef(d: GroupingDef): Draft {
  const variable = d.variables[0] ?? 'Q1'
  return { id: d.id, type: d.type, name: d.name, variable, variables: d.variables, kind: d.kind, members: d.members, min: d.range ? String(d.range[0]) : '', max: d.range ? String(d.range[1]) : '', groups: d.groups.map((g) => ({ ...g })) }
}
function draftFromTemplate(i: number): Draft {
  const t = TEMPLATES[i]!.build()
  const variable = t.variables[0] ?? 'Q1'
  return { id: '', type: t.type, name: t.name, variable, variables: t.variables, kind: t.kind, members: t.members, min: t.range ? String(t.range[0]) : '', max: t.range ? String(t.range[1]) : '', groups: t.groups.map((g) => ({ ...g })) }
}
function toDef(d: Draft, existing?: GroupingDef): GroupingDef {
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
  return {
    id: d.id,
    type: d.type,
    name: d.name,
    variables: d.variables,
    kind: d.type === 'net' ? d.kind : 'options',
    members: d.type === 'net' && d.kind === 'options' ? d.members : [],
    range: d.type === 'net' && d.kind === 'range' ? [num(d.min), num(d.max)] : null,
    groups: d.type === 'classification' ? d.groups : [],
    version: existing?.version ?? 1,
    createdAt: existing?.createdAt ?? NOW(),
    updatedAt: existing?.updatedAt ?? NOW(),
    history: existing?.history ?? [],
  }
}

const card = 'rounded-[14px] border border-border bg-card'
const btn = 'h-8 rounded-[8px] border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = 'h-9 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'h-9 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

function WaveChecks({ check }: { check: DefCheck }) {
  if (check.items.length === 0) return null
  const waves = check.items[0]!.waves.map((w) => w.wave)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1.5 text-left font-medium">Result by wave</th>
            {waves.map((w) => <th key={w} className="py-1.5 text-right font-medium">{w}</th>)}
          </tr>
        </thead>
        <tbody>
          {check.items.map((it) => (
            <tr key={`${it.variable}-${it.label}`} className="border-t border-border">
              <td className="py-1.5 text-foreground">{it.label}</td>
              {it.waves.map((w) => (
                <td key={w.wave} className="py-1.5 text-right tabular-nums text-foreground">
                  {w.hidden ? '–' : `${Math.round(w.value)}%`}
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">n={w.base.toLocaleString()}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-primary" />
      {label}
    </label>
  )
}

export default function Groupings() {
  const navigate = useNavigate()
  const defs = useGroupings()
  const applied = useApplied()
  const crossTab = useLensStore((s) => s.crossTab)
  const setCrossTab = useLensStore((s) => s.setCrossTab)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const editing = draft?.id ? defs.find((d) => d.id === draft.id) : undefined
  const draftDef = useMemo(() => (draft ? toDef(draft, editing) : null), [draft, editing])
  const errors = useMemo(() => (draftDef ? validateDef(draftDef, defs.filter((d) => d.id !== draftDef.id)) : []), [draftDef, defs])
  const draftCheck = useMemo(() => (draftDef && errors.length === 0 ? checkDefinition(draftDef) : null), [draftDef, errors])
  const checks = useMemo(() => Object.fromEntries(defs.map((d) => [d.id, { errs: validateDef(d, defs.filter((x) => x.id !== d.id)), check: checkDefinition(d) }])), [defs])

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const changeVariable = (v: string) => {
    const range = isRangeVar(v)
    const preset = PRESETS[v]?.[0]
    set({
      variable: v,
      variables: range ? [v] : compatibleVariables(v),
      kind: range ? 'range' : 'options',
      members: [],
      groups: draft?.type === 'classification' ? [{ id: newGroupId(), label: '', members: [] }] : [],
      min: range && preset ? String(preset.min) : '',
      max: range && preset ? String(preset.max) : '',
    })
  }
  const toggleMember = (code: number) => draft && set({ members: draft.members.includes(code) ? draft.members.filter((c) => c !== code) : [...draft.members, code] })
  const toggleInGroup = (gid: string, code: number) => {
    if (!draft) return
    set({
      groups: draft.groups.map((g) => {
        if (g.id === gid) return { ...g, members: g.members.includes(code) ? g.members.filter((c) => c !== code) : [...g.members, code] }
        return { ...g, members: g.members.filter((c) => c !== code) } // an option can sit in one group only: moving it
      }),
    })
  }

  const save = () => {
    if (!draftDef || errors.length) return
    const saved = saveDef(draftDef)
    setDraft(null)
    setOpen(saved.id)
  }
  const remove = (d: GroupingDef) => {
    if (window.confirm(`Delete "${d.name}"? Tables that use it will go back to their original rows.`)) {
      deleteDef(d.id)
      if (open === d.id) setOpen(null)
    }
  }
  const useInCrossTabs = (d: GroupingDef) => {
    if (d.type === 'net') setApplied({ nets: [...new Set([...applied.nets, d.id])] })
    else setApplied({ classification: d.id })
    const v = d.variables.includes(crossTab.row) ? crossTab.row : d.variables[0]!
    setCrossTab({ row: v, ...(crossTab.column === v ? { column: 'WAVE' } : {}) })
    navigate('/cross-tabs')
  }

  const optionVars = optionQuestions()
  const variableChoices = draft?.type === 'net' ? [...optionVars, ...rangeQuestions().filter((r) => !optionVars.some((o) => o.id === r.id))] : optionVars
  const options = QUESTIONS[draft?.variable ?? '']?.options ?? []
  const unclassified = draftDef && draft?.type === 'classification' ? unclassifiedCodes(draftDef, draft.variable) : []
  const rangeBound = draft ? RANGE_BOUNDS[draft.variable] : undefined

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6">
        <PageHeader
          title="Groupings"
          description="Reusable nets and classifications for this study. Apply them from Cross-tabs; saved definitions are versioned and checked against every wave."
          actions={
            <div className="flex gap-2">
              <button type="button" className={btn} onClick={() => setDraft(newDraft('net'))}>+ New net</button>
              <button type="button" className={btn} onClick={() => setDraft(newDraft('classification'))}>+ New classification</button>
            </div>
          }
        />

        <div className="mt-5 space-y-6">
          {/* Editor */}
          {draft && draftDef && (
            <section className={`${card} p-5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {editing ? `Edit ${editing.name}` : draft.type === 'net' ? 'New net' : 'New classification'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {draft.type === 'net'
                    ? 'A net combines answer options, or a range of scale values, into one row.'
                    : 'A classification groups answer options under parent categories, such as manufacturer → brand.'}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-muted-foreground">Name</span>
                  <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={draft.type === 'net' ? 'e.g. Any cola brand' : 'e.g. Manufacturer'} className={`${input} mt-1`} />
                </label>
                <div>
                  <span className="text-xs text-muted-foreground">Question</span>
                  <div className="mt-1">
                    <Select
                      label="Question"
                      value={draft.variable}
                      onChange={changeVariable}
                      options={variableChoices.map((v) => ({ value: v.id, label: `${v.label}${isRangeVar(v.id) && !v.options ? ' (scale)' : ''}` }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {draft.kind === 'options' && compatibleVariables(draft.variable).length > 1 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">Applies to these questions (they share the same answer options)</p>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                    {compatibleVariables(draft.variable).map((v) => (
                      <Checkbox
                        key={v}
                        label={qLabel(v)}
                        checked={draft.variables.includes(v)}
                        onChange={() => set({ variables: draft.variables.includes(v) ? draft.variables.filter((x) => x !== v) : [...draft.variables, v] })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {draft.type === 'net' && draft.kind === 'options' && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">Include respondents who chose any of</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-4">
                    {options.map((o) => <Checkbox key={o.code} label={o.label} checked={draft.members.includes(o.code)} onChange={() => toggleMember(o.code)} />)}
                  </div>
                </div>
              )}

              {draft.type === 'net' && draft.kind === 'range' && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">
                    Include respondents with a value from… to… {rangeBound ? `(${qLabel(draft.variable)} runs ${rangeBound[0]}–${rangeBound[1]})` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input value={draft.min} onChange={(e) => set({ min: e.target.value })} inputMode="numeric" aria-label="Minimum" className={`${input} !w-20`} />
                    <span className="text-sm text-muted-foreground">to</span>
                    <input value={draft.max} onChange={(e) => set({ max: e.target.value })} inputMode="numeric" aria-label="Maximum" className={`${input} !w-20`} />
                    {(PRESETS[draft.variable] ?? []).map((p) => (
                      <button key={p.label} type="button" className={btn} onClick={() => set({ min: String(p.min), max: String(p.max), name: draft.name || p.label })}>{p.label}</button>
                    ))}
                  </div>
                  {draft.variable === 'Q4' && <p className="mt-2 text-xs text-muted-foreground">This creates one row for each attitude statement.</p>}
                </div>
              )}

              {draft.type === 'classification' && (
                <div className="mt-4 space-y-3">
                  {draft.groups.map((g, gi) => (
                    <div key={g.id} className="rounded-[10px] border border-border p-3">
                      <div className="flex items-center gap-2">
                        <input value={g.label} onChange={(e) => set({ groups: draft.groups.map((x) => (x.id === g.id ? { ...x, label: e.target.value } : x)) })} placeholder={`Group ${gi + 1} name`} aria-label={`Group ${gi + 1} name`} className={input} />
                        <button type="button" className={btn} onClick={() => set({ groups: draft.groups.filter((x) => x.id !== g.id) })}>Remove</button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-4">
                        {options.map((o) => <Checkbox key={o.code} label={o.label} checked={g.members.includes(o.code)} onChange={() => toggleInGroup(g.id, o.code)} />)}
                      </div>
                    </div>
                  ))}
                  <button type="button" className={btn} onClick={() => set({ groups: [...draft.groups, { id: newGroupId(), label: '', members: [] }] })}>+ Add group</button>
                  <p className="text-xs text-muted-foreground">
                    {unclassified.length === 0
                      ? 'Every option is in a group.'
                      : `Unclassified: ${unclassified.map((c) => optionLabel(draft.variable, c)).join(', ')}. Lens shows these in an "Unclassified" row so nothing is lost.`}
                  </p>
                  {unknownCodes(draft.variable).length > 0 && <p className="text-xs text-[#B45309]">The data contains answer codes that are not defined options; they will appear under Unclassified.</p>}
                </div>
              )}

              {errors.length > 0 && (
                <ul className="mt-4 space-y-1 rounded-[10px] bg-[#FDEEEC] px-3 py-2 text-sm text-[#C0362C]">
                  {errors.map((e) => <li key={e}>✕ {e}</li>)}
                </ul>
              )}
              {draftCheck && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Check against every wave</p>
                  <WaveChecks check={draftCheck} />
                  {draftCheck.warnings.length > 0 && (
                    <ul className="space-y-1 rounded-[10px] bg-[#FEF4E6] px-3 py-2 text-sm text-[#B45309]">
                      {draftCheck.warnings.map((w) => <li key={w}>! {w}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{editing ? `Saving creates version ${editing.version + 1}. Earlier versions stay in the history.` : 'Saved in this browser, for this study.'}</p>
                <div className="flex gap-2">
                  <button type="button" className={btn} onClick={() => setDraft(null)}>Cancel</button>
                  <button type="button" className={btnPrimary} disabled={errors.length > 0} onClick={save}>{editing ? 'Save new version' : 'Save grouping'}</button>
                </div>
              </div>
            </section>
          )}

          {/* Definitions */}
          <section className={`${card} overflow-hidden`}>
            {defs.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No groupings yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create a net (for example Top 2 box) or a classification (for example manufacturer → brand), or start from a template below.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">Name</th>
                      <th className="px-3 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 font-medium">Applies to</th>
                      <th className="px-3 py-2.5 font-medium">Definition</th>
                      <th className="px-3 py-2.5 text-right font-medium">Version</th>
                      <th className="px-3 py-2.5 font-medium">Checks</th>
                      <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defs.map((d) => {
                      const c = checks[d.id]!
                      const expanded = open === d.id
                      const inUse = applied.nets.includes(d.id) || applied.classification === d.id
                      return (
                        <Fragment key={d.id}>
                          <tr className={`cursor-pointer border-b border-border hover:bg-muted/30 ${expanded ? 'bg-muted/20' : ''}`} onClick={() => setOpen(expanded ? null : d.id)}>
                            <td className="px-5 py-3">
                              <span className="mr-2 text-xs text-muted-foreground" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                              <span className="font-medium text-foreground">{d.name}</span>
                              {inUse && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">In use</span>}
                            </td>
                            <td className="px-3 py-3 text-foreground">{d.type === 'net' ? 'Net' : 'Classification'}</td>
                            <td className="px-3 py-3 text-muted-foreground">{d.variables.map(qLabel).join(', ')}</td>
                            <td className="max-w-[320px] px-3 py-3 text-muted-foreground"><span className="line-clamp-2">{describeDef(d)}</span></td>
                            <td className="px-3 py-3 text-right tabular-nums text-foreground">v{d.version}</td>
                            <td className="px-3 py-3">
                              {c.errs.length > 0 ? <span className="text-sig-low">✕ {c.errs.length} problem{c.errs.length > 1 ? 's' : ''}</span> : c.check.warnings.length > 0 ? <span className="text-[#B45309]">! {c.check.warnings.length} warning{c.check.warnings.length > 1 ? 's' : ''}</span> : <span className="text-sig-high">✓ All waves OK</span>}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button type="button" className={btn} onClick={() => useInCrossTabs(d)} disabled={c.errs.length > 0}>Use in Cross-tabs</button>
                                <button type="button" className={btn} onClick={() => setDraft(draftFromDef(d))}>Edit</button>
                                <button type="button" className={`${btn} text-sig-low`} onClick={() => remove(d)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-b border-border bg-muted/20">
                              <td colSpan={7} className="space-y-3 px-5 pb-4 pt-2">
                                {c.errs.length > 0 && (
                                  <ul className="space-y-1 rounded-[10px] bg-[#FDEEEC] px-3 py-2 text-sm text-[#C0362C]">{c.errs.map((e) => <li key={e}>✕ {e}</li>)}</ul>
                                )}
                                <WaveChecks check={c.check} />
                                {c.check.warnings.length > 0 && (
                                  <ul className="space-y-1 rounded-[10px] bg-[#FEF4E6] px-3 py-2 text-sm text-[#B45309]">{c.check.warnings.map((w) => <li key={w}>! {w}</li>)}</ul>
                                )}
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">Version history</p>
                                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                    {[...d.history].reverse().map((h) => (
                                      <li key={h.version}><span className="tabular-nums text-foreground">v{h.version}</span> · {dateText(h.updatedAt)} · {h.summary}</li>
                                    ))}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Templates */}
          <section className={`${card} p-5`}>
            <h2 className="text-sm font-semibold text-foreground">Start from a template</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Templates open in the editor for you to review. Nothing is saved until you click Save.</p>
            <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.map((t, i) => (
                <li key={t.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <button type="button" className={btn} onClick={() => setDraft(draftFromTemplate(i))}>Use</button>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Groupings are stored in this browser and apply to this study only. Members are stored by answer code, so renaming an option label never breaks a grouping. Applied in Cross-tabs; saved storyboard slides do not include groupings yet.
          </p>
        </div>
      </div>
    </div>
  )
}
