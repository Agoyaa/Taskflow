import { useEffect, useState } from 'react'

const STATUS_OPTIONS = [
  { value: 'Todo', label: 'To do' },
  { value: 'In Progress', label: 'In progress' },
  { value: 'Done', label: 'Done' },
]
const PRIORITY_OPTIONS = ['Urgent', 'High', 'Medium', 'Low']

function localDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addCalendarDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return localDateString(next)
}

function getShortcuts() {
  const now = new Date()
  const daysUntilSunday = (7 - now.getDay()) % 7
  return [
    { label: 'Today', value: localDateString(now) },
    { label: 'Tomorrow', value: addCalendarDays(now, 1) },
    { label: 'This week', value: addCalendarDays(now, daysUntilSunday) },
    { label: 'More flexible', value: addCalendarDays(now, 7) },
  ]
}

function TaskModal({ task, onClose, onSave }) {
  const isEditing = Boolean(task)
  const [form, setForm] = useState(() => task ? {
    title: task.title || '',
    description: task.description || '',
    status: task.status || 'Todo',
    priority: task.priority || 'Medium',
    due_date: task.due_date || '',
  } : emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const shortcuts = getShortcuts()

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    if (error) setError('')
  }

  async function submit(event) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setError('Enter a task title to continue.')
      return
    }
    if (title.length > 200) {
      setError('Task titles must be 200 characters or fewer.')
      return
    }
    if (form.description.length > 5000) {
      setError('Descriptions must be 5,000 characters or fewer.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave({
        title,
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
      })
    } catch (saveError) {
      setError(saveError.message || 'Could not save this task. Your changes are still here.')
    } finally {
      setSaving(false)
    }
  }

  const selectedShortcut = shortcuts.find((shortcut) => shortcut.value === form.due_date)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="task-modal-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <form onSubmit={submit}>
          <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <h2 id="task-modal-title" className="text-lg font-semibold text-slate-900">{isEditing ? 'Edit Task' : 'Create Task'}</h2>
              <p className="mt-1 text-sm text-slate-500">{isEditing ? 'Update the details for this task.' : 'Add a task to your workspace.'}</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close dialog" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </button>
          </header>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div>
              <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-slate-700">Title <span className="text-rose-600">*</span></label>
              <input autoFocus id="task-title" name="title" value={form.title} onChange={updateField} maxLength={200} required placeholder="e.g. Prepare project proposal" className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
            </div>

            <div>
              <label htmlFor="task-description" className="mb-1.5 block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-500">(optional)</span></label>
              <textarea id="task-description" name="description" value={form.description} onChange={updateField} maxLength={5000} rows={3} placeholder="Add context or notes..." className="w-full resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="task-status" className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
                <select id="task-status" name="status" value={form.status} onChange={updateField} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20">
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="task-priority" className="mb-1.5 block text-sm font-medium text-slate-700">Priority</label>
                <select id="task-priority" name="priority" value={form.priority} onChange={updateField} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20">
                  {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-slate-700">Deadline <span className="font-normal text-slate-500">(optional)</span></legend>
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((shortcut) => {
                  const active = selectedShortcut?.label === shortcut.label
                  return <button key={shortcut.label} type="button" onClick={() => setForm((current) => ({ ...current, due_date: shortcut.value }))} aria-pressed={active} className={`min-h-9 rounded-lg border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${active ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{shortcut.label}</button>
                })}
                <button type="button" onClick={() => setForm((current) => ({ ...current, due_date: '' }))} aria-pressed={!form.due_date} className={`min-h-9 rounded-lg border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${!form.due_date ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>No deadline</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label htmlFor="task-deadline" className="text-sm text-slate-600">Or choose a date</label>
                <input id="task-deadline" type="date" name="due_date" value={form.due_date} onChange={updateField} className="min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
                {form.due_date && <span className="text-xs text-slate-600">{selectedShortcut ? selectedShortcut.label : 'Custom date selected'}</span>}
              </div>
            </fieldset>

            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3.5 py-3 text-sm text-rose-800">{error}</p>}
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Task'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function emptyForm() {
  return { title: '', description: '', status: 'Todo', priority: 'Medium', due_date: '' }
}

export default TaskModal
