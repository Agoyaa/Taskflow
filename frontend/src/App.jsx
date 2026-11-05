import { useEffect, useMemo, useState } from 'react'
import TaskModal from './TaskModal.jsx'

const STATUS_STYLES = {
  Done: 'bg-emerald-100 text-emerald-800',
  'In Progress': 'bg-amber-100 text-amber-900',
  Todo: 'bg-slate-100 text-slate-700',
}
const PRIORITY_STYLES = {
  Urgent: 'bg-rose-100 text-rose-800',
  High: 'bg-orange-100 text-orange-800',
  Medium: 'bg-blue-100 text-blue-800',
  Low: 'bg-emerald-100 text-emerald-800',
}
const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDueDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day))
}

function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalTask, setModalTask] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [page, setPage] = useState('Dashboard')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [deadlineFilter, setDeadlineFilter] = useState('Any deadline')
  const [sortBy, setSortBy] = useState('deadline')

  async function loadTasks() {
    setLoading(true)
    try {
      const response = await fetch('/api/tasks')
      if (!response.ok) throw new Error('Could not load tasks. Check your connection and try again.')
      const data = await response.json()
      setTasks(Array.isArray(data) ? data : [])
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/tasks', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load tasks. Check your connection and try again.')
        return response.json()
      })
      .then((data) => {
        setTasks(Array.isArray(data) ? data : [])
        setError('')
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load tasks.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const today = localDateString(new Date())
  const completed = tasks.filter((task) => task.status === 'Done').length
  const inProgress = tasks.filter((task) => task.status === 'In Progress').length
  const todo = tasks.filter((task) => task.status === 'Todo').length
  const unfinishedTasks = tasks.filter((task) => task.status !== 'Done')
  const overdueTasks = unfinishedTasks.filter((task) => task.due_date && task.due_date < today)
  const dueTodayTasks = unfinishedTasks.filter((task) => task.due_date === today)
  const upcomingTasks = unfinishedTasks.filter((task) => task.due_date && task.due_date > today).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const urgentTasks = unfinishedTasks.filter((task) => task.priority === 'Urgent')

  const filteredTasks = useMemo(() => {
    const result = tasks.filter((task) => {
      const query = search.trim().toLowerCase()
      const matchesSearch = `${task.title} ${task.description || ''}`.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'All statuses' || task.status === statusFilter
      const matchesPriority = priorityFilter === 'All priorities' || task.priority === priorityFilter
      const matchesDeadline = deadlineFilter === 'Any deadline'
        || (deadlineFilter === 'Overdue' && task.status !== 'Done' && task.due_date && task.due_date < today)
        || (deadlineFilter === 'Due today' && task.status !== 'Done' && task.due_date === today)
        || (deadlineFilter === 'Upcoming' && task.status !== 'Done' && task.due_date && task.due_date > today)
        || (deadlineFilter === 'No deadline' && !task.due_date)
      return matchesSearch && matchesStatus && matchesPriority && matchesDeadline
    })
    return result.sort((a, b) => {
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4)
      if (sortBy === 'created') return (b.created_at || '').localeCompare(a.created_at || '')
      if (sortBy === 'updated') return (b.updated_at || '').localeCompare(a.updated_at || '')
      if (!a.due_date) return b.due_date ? 1 : 0
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
  }, [tasks, search, statusFilter, priorityFilter, deadlineFilter, sortBy, today])

  function openCreateModal() {
    setModalTask(null)
    setIsModalOpen(true)
    setError('')
  }

  function openEditModal(task) {
    setModalTask(task)
    setIsModalOpen(true)
    setError('')
  }

  function closeModal() {
    setIsModalOpen(false)
    setModalTask(null)
  }

  async function saveTask(values) {
    const editing = Boolean(modalTask)
    const response = await fetch(editing ? `/api/tasks/${modalTask.id}` : '/api/tasks', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.error || (editing ? 'Could not update task.' : 'Could not create task.'))
    }
    const savedTask = await response.json()
    setTasks((current) => editing
      ? current.map((task) => task.id === savedTask.id ? savedTask : task)
      : [...current, savedTask])
    setError('')
    closeModal()
  }

  async function updateStatus(task, status) {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload.error || 'Could not update task status.')
      return
    }
    const updatedTask = await response.json()
    setTasks((current) => current.map((item) => item.id === updatedTask.id ? updatedTask : item))
    setError('')
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete “${task.title}”? This action cannot be undone.`)) return
    const response = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    if (!response.ok) {
      setError('Could not delete task. Please try again.')
      return
    }
    setTasks((current) => current.filter((item) => item.id !== task.id))
    setError('')
  }

  const stats = [
    { label: 'All tasks', value: tasks.length, marker: 'bg-slate-500' },
    { label: 'To do', value: todo, marker: 'bg-slate-500' },
    { label: 'In progress', value: inProgress, marker: 'bg-amber-600' },
    { label: 'Completed', value: completed, marker: 'bg-emerald-700' },
  ]

  function renderTaskRow(task, editable = true) {
    return (
      <article key={task.id} className="grid min-w-0 grid-cols-1 items-center gap-x-3 gap-y-2.5 border-b border-slate-100 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_132px_112px_132px_44px] lg:gap-3">
        <button type="button" onClick={() => editable && openEditModal(task)} disabled={!editable} className={`flex min-h-11 min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ${editable ? 'cursor-pointer rounded-md' : 'cursor-default'}`}>
          <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${task.status === 'Done' ? 'border-emerald-700 bg-emerald-700 text-white' : task.status === 'In Progress' ? 'border-amber-600 text-amber-800' : 'border-slate-400 text-slate-500'}`}>
            {task.status === 'Done' && <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {task.status === 'In Progress' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </span>
          <span className="min-w-0">
            <span title={task.title} className={`block line-clamp-2 text-sm font-medium leading-5 ${task.status === 'Done' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{task.title}</span>
            {task.description && <span title={task.description} className="mt-0.5 block line-clamp-1 text-xs text-slate-600">{task.description}</span>}
          </span>
        </button>

        {editable ? (
          <div className="grid w-full max-w-[420px] justify-self-end grid-cols-[minmax(0,1fr)_minmax(76px,88px)_minmax(88px,112px)_44px] items-center gap-2 lg:contents">
            <select value={task.status} onChange={(event) => updateStatus(task, event.target.value)} aria-label={`Status for ${task.title}`} className={`h-11 w-full cursor-pointer rounded-md border border-transparent px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${STATUS_STYLES[task.status] || STATUS_STYLES.Todo}`}>
              <option value="Todo">To do</option><option value="In Progress">In progress</option><option value="Done">Done</option>
            </select>
            <span className={`inline-flex h-11 w-full min-w-[76px] items-center justify-center rounded-md px-2 text-xs font-semibold ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.Medium}`}>{task.priority || 'Medium'}</span>
            <DeadlineBadge dueDate={task.due_date} today={today} />
            <button type="button" onClick={() => deleteTask(task)} aria-label={`Delete ${task.title}`} title="Delete task" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]"><path d="M4.5 6h11M8 6V4.5h4V6m2.5 0-.6 9.1a1 1 0 0 1-1 .9H7.1a1 1 0 0 1-1-.9L5.5 6m2.5 3v4m4-4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        ) : (
          <div className="grid w-full max-w-[360px] grid-cols-[minmax(0,1fr)_minmax(76px,88px)_minmax(88px,112px)] items-center gap-2 justify-self-end lg:contents">
            <span className={`inline-flex h-9 w-full items-center justify-center rounded-md px-2 text-xs font-semibold ${STATUS_STYLES[task.status] || STATUS_STYLES.Todo}`}>{task.status}</span>
            <span className={`inline-flex h-9 w-full items-center justify-center rounded-md px-2 text-xs font-semibold ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.Medium}`}>{task.priority || 'Medium'}</span>
            <DeadlineBadge dueDate={task.due_date} today={today} />
          </div>
        )}
      </article>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-full flex-col bg-slate-950 px-5 py-4 text-white md:flex-row md:items-center md:justify-between md:py-3 lg:fixed lg:inset-y-0 lg:w-60 lg:flex-col lg:items-stretch lg:justify-start lg:px-6 lg:py-7">
        <a href="#dashboard" onClick={() => setPage('Dashboard')} aria-label="TaskFlow dashboard" className="flex min-h-11 items-center gap-3 text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-base font-black text-slate-950">T</span><span>TaskFlow<span className="text-emerald-400">.</span></span>
        </a>
        <p className="mb-3 mt-9 hidden text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 lg:block">Workspace</p>
        <nav aria-label="Main navigation" className="mt-4 flex gap-2 overflow-x-auto md:mt-0 lg:flex-col">
          {['Dashboard', 'My Tasks'].map((item) => <button key={item} type="button" onClick={() => setPage(item)} aria-current={page === item ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${page === item ? 'bg-emerald-400/10 font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/15' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            {item === 'Dashboard' ? <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]"><rect x="2.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/></svg> : <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]"><path d="M6 5h11M6 10h11M6 15h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="2.5" cy="5" r=".8" fill="currentColor"/><circle cx="2.5" cy="10" r=".8" fill="currentColor"/><circle cx="2.5" cy="15" r=".8" fill="currentColor"/></svg>}
            {item}{item === 'My Tasks' && <span className="ml-auto hidden rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300 md:inline-flex">{tasks.length}</span>}
          </button>)}
        </nav>
        <div className="mt-6 hidden items-center gap-3 border-t border-slate-800 pt-5 lg:mt-auto lg:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">TF</div><div><p className="text-sm font-medium">TaskFlow User</p><p className="mt-0.5 text-xs text-slate-400">Personal workspace</p></div>
        </div>
      </aside>

      <main id="dashboard" className="min-w-0 px-5 pb-10 md:px-8 md:py-7 lg:ml-60 lg:px-9 xl:px-12">
        <div className="mx-auto max-w-7xl">
          <header className="flex h-14 items-center justify-between border-b border-slate-200/80 md:h-12">
            <p className="text-xs font-medium text-slate-600 sm:text-sm">Workspace <span className="mx-2 text-slate-400">/</span><span className="text-slate-900">{page}</span></p>
            <span className="text-xs font-medium text-slate-600 sm:text-sm">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</span>
          </header>

          {page === 'Dashboard' ? (
            <>
              <section className="mb-7 mt-8 flex flex-wrap items-end justify-between gap-3 sm:mb-8 sm:mt-10">
                <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dashboard</h1><p className="mt-1.5 text-sm text-slate-600">Your workload, priorities, and deadlines at a glance.</p></div>
                <button type="button" onClick={() => setPage('My Tasks')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">Manage tasks</button>
              </section>
              <section aria-label="Task statistics" className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                {stats.map((stat) => <article key={stat.label} className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5"><div className="flex items-center gap-2 text-xs font-medium text-slate-700 sm:text-sm"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${stat.marker}`} />{stat.label}</div><p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{stat.value}</p></article>)}
              </section>
              {error && <ErrorNotice message={error} onRetry={loadTasks} />}
              {loading ? <p role="status" className="py-8 text-sm text-slate-600">Loading your tasks…</p> : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {overdueTasks.length > 0 &&                  <DashboardTaskList title="Overdue" tasks={overdueTasks} tone="rose" />}
                  {dueTodayTasks.length > 0 &&                  <DashboardTaskList title="Due today" tasks={dueTodayTasks} tone="amber" />}
                  <DashboardTaskList title="Upcoming deadlines" tasks={upcomingTasks} tone="slate" emptyText="No upcoming deadlines." />
                  <DashboardTaskList title="Urgent tasks" tasks={urgentTasks} tone="rose" emptyText="No unfinished urgent tasks." />
                </div>
              )}
            </>
          ) : (
            <>
              <section className="mb-6 mt-8 flex flex-wrap items-end justify-between gap-3 sm:mt-10">
                <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">My Tasks</h1><p className="mt-1.5 text-sm text-slate-600">Create, find, and organize your tasks.</p></div>
                <button type="button" onClick={openCreateModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>New Task
                </button>
              </section>
            {error && <ErrorNotice message={error} onRetry={loadTasks} />}
            <section aria-label="Task filters" className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1.5fr)_repeat(4,minmax(130px,1fr))]">
                <label className="sr-only" htmlFor="task-search">Search tasks</label>
                <input id="task-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks..." className="min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
                <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['All statuses', 'Todo', 'In Progress', 'Done']} />
                <FilterSelect label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={['All priorities', 'Urgent', 'High', 'Medium', 'Low']} />
                <FilterSelect label="Deadline" value={deadlineFilter} onChange={setDeadlineFilter} options={['Any deadline', 'Overdue', 'Due today', 'Upcoming', 'No deadline']} />
                <FilterSelect label="Sort tasks" value={sortBy} onChange={setSortBy} options={[['deadline', 'Deadline'], ['priority', 'Priority'], ['created', 'Date created'], ['updated', 'Last updated']]} />
              </section>
              <section id="tasks" aria-labelledby="task-list-heading" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_-24px_rgba(15,23,42,0.4)]">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6"><h2 id="task-list-heading" className="text-base font-semibold text-slate-900">Tasks</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-700">{filteredTasks.length}</span></div>
                <div className="px-4 sm:px-6">
                  {!loading && filteredTasks.length > 0 && <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_132px_112px_132px_44px] gap-3 border-b border-slate-100 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 lg:grid"><span>Task</span><span>Status</span><span>Priority</span><span>Deadline</span><span /> </div>}
                  {loading ? <p role="status" className="py-7 text-sm text-slate-600">Loading tasks…</p> : filteredTasks.length ? filteredTasks.map((task) => renderTaskRow(task)) : <div className="py-12 text-center"><p className="text-sm font-semibold text-slate-800">{tasks.length ? 'No matching tasks' : 'No tasks yet'}</p><p className="mt-1 text-sm text-slate-600">{tasks.length ? 'Try changing or clearing your filters.' : 'Select New Task to create your first task.'}</p></div>}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {isModalOpen && <TaskModal key={modalTask?.id || 'new'} task={modalTask} onClose={closeModal} onSave={saveTask} />}
    </div>
  )
}

function DeadlineBadge({ dueDate, today }) {
  if (!dueDate) return <span className="inline-flex h-11 w-full min-w-[88px] items-center justify-center rounded-md bg-slate-50 px-2 text-xs font-medium text-slate-600">No deadline</span>
  const overdue = dueDate < today
  const isToday = dueDate === today
  return <span className={`inline-flex h-11 w-full min-w-[88px] items-center justify-center gap-1 rounded-md px-2 text-center text-xs font-semibold ${overdue ? 'bg-rose-100 text-rose-800' : isToday ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
    {overdue ? 'Overdue' : isToday ? 'Today' : formatDueDate(dueDate)}
  </span>
}

function DashboardTaskList({ title, tasks, tone, emptyText }) {
  const toneStyles = tone === 'rose' ? 'text-rose-800' : tone === 'amber' ? 'text-amber-900' : 'text-slate-900'
  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="mb-2 flex items-center justify-between gap-3"><h2 className={`text-sm font-semibold ${toneStyles}`}>{title}</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-700">{tasks.length}</span></div>
    {tasks.length ? tasks.slice(0, 5).map((task) => <div key={task.id} className="grid w-full min-w-0 grid-cols-1 items-center gap-2 border-b border-slate-100 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_88px_112px] sm:gap-3">
      <span title={task.title} className="min-w-0 line-clamp-2 text-sm font-medium leading-5 text-slate-800">{task.title}</span>
      <span className={`inline-flex h-9 w-full items-center justify-center rounded-md px-2 text-xs font-semibold ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.Medium}`}>{task.priority || 'Medium'}</span>
      <DeadlineBadge dueDate={task.due_date} today={localDateString(new Date())} />
    </div>) : <p className="py-5 text-sm text-slate-600">{emptyText}</p>}
  </section>
}

function FilterSelect({ label, value, onChange, options }) {
  const normalizedOptions = options.map((option) => Array.isArray(option) ? option : [option, option])
  return <label className="block"><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20">{normalizedOptions.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select></label>
}

function ErrorNotice({ message, onRetry }) {
  return <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><span>{message}</span><button type="button" onClick={onRetry} className="min-h-10 rounded-md px-3 font-semibold text-rose-900 underline underline-offset-2 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">Try again</button></div>
}

export default App
