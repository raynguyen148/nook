import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, ArrowUpDown, BookOpen, Check, ChevronDown, Clock3, Code2, FileText, Folder, LayoutGrid, List, MoreHorizontal, PanelLeftClose, Pin, Plus, Search, Settings2, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import './App.css'

type Note = { id: number; title: string; type: string; tags: string[]; content: string; updated: string; pinned?: boolean }
type Mode = 'edit' | 'preview'

const seedNotes: Note[] = [
  { id: 1, title: 'Code review checklist for risky changes', type: 'Coding', tags: ['dev', 'code-review'], updated: 'Sep 16', pinned: true, content: '# Code review checklist for risky changes\n\nBefore approving a change, follow the data through the whole path.\n\n## Questions to ask\n\n- [x] Are inputs validated at the boundary?\n- [ ] Can a stale request overwrite newer state?\n- [ ] What happens when storage is unavailable?\n\n> Keep the review focused on observable behavior and the blast radius of failure.\n\n| Area | Check |\n| --- | --- |\n| Data | Migration and backup compatibility |\n| UI | Keyboard and narrow screen behavior |\n| Release | Rollback path |' },
  { id: 2, title: 'TypeScript narrowing at the boundary', type: 'Coding', tags: ['dev', 'security'], updated: 'Sep 09', content: '# TypeScript narrowing at the boundary\n\nValidate unknown input once, then pass a useful domain type deeper into the application.\n\n```ts\ntype User = { id: string; displayName: string }\n```\n\n## Review questions\n\n- Is the runtime check stricter than the TypeScript type?\n- Can an invalid value cross the module boundary?' },
  { id: 3, title: 'A quiet Sunday reading list', type: 'General', tags: ['books', 'ideas'], updated: 'Sep 08', pinned: true, content: '# A quiet Sunday reading list\n\nA small list of things worth returning to.\n\n- Read a chapter slowly\n- Take notes in my own words\n- Keep one useful idea' },
  { id: 4, title: 'Better questions for project kickoff', type: 'Work', tags: ['planning'], updated: 'Sep 06', content: '# Better questions for project kickoff\n\nWhat problem is this solving? Who sees the benefit? How will we know it works?\n\n## Constraints\n\n- Timeline\n- Dependencies\n- Failure modes' },
  { id: 5, title: 'Quick recipe: ginger chicken rice', type: 'Cooking', tags: ['recipe'], updated: 'Sep 04', content: '# Ginger chicken rice\n\n## Ingredients\n\n- Chicken\n- Ginger\n- Rice\n\nCook gently and finish with scallions.' },
  { id: 6, title: 'Useful CSS layout patterns', type: 'Coding', tags: ['dev', 'design'], updated: 'Sep 02', content: '# Useful CSS layout patterns\n\nUse grid for the page shell and flex for small controls. Start at the narrowest width.' },
  { id: 7, title: 'Ideas for a weekend walk', type: 'Journal', tags: ['ideas'], updated: 'Aug 31', content: '# Ideas for a weekend walk\n\nFind a quiet route, bring water, and leave some time unplanned.' },
  { id: 8, title: 'Markdown notes and small habits', type: 'General', tags: ['writing'], updated: 'Aug 27', content: '# Markdown notes and small habits\n\nWrite the rough version first. Make it useful before making it polished.' },
  { id: 9, title: 'API error handling notes', type: 'Coding', tags: ['dev', 'security'], updated: 'Aug 24', content: '# API error handling notes\n\nReturn an error that helps the user recover, but keep private details out of logs.' },
  { id: 10, title: 'Books to revisit later', type: 'Reading', tags: ['books'], updated: 'Aug 21', content: '# Books to revisit later\n\n- Design of Everyday Things\n- A Pattern Language' },
  { id: 11, title: 'Small improvements for my workspace', type: 'Journal', tags: ['ideas'], updated: 'Aug 18', content: '# Small improvements\n\nA better lamp. Fewer open tabs. A place to capture passing thoughts.' },
  { id: 12, title: 'Monthly planning notes', type: 'Work', tags: ['planning'], updated: 'Aug 15', content: '# Monthly planning notes\n\nPick fewer priorities and finish them.' },
]

const typeColors: Record<string, string> = { Coding: 'coding', General: 'general', Work: 'work', Cooking: 'cooking', Journal: 'journal', Reading: 'reading' }
const types = ['All notes', 'Coding', 'General', 'Work', 'Cooking', 'Journal', 'Reading']

function App() {
  const [notes, setNotes] = useState(seedNotes)
  const [selected, setSelected] = useState<Note | null>(null)
  const [draft, setDraft] = useState<Note | null>(null)
  const [mode, setMode] = useState<Mode>('preview')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All notes')
  const [sort, setSort] = useState<'recent' | 'title'>('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const visibleNotes = useMemo(() => notes.filter(note => (filter === 'All notes' || filter === 'Pinned' && note.pinned || note.type === filter) && `${note.title} ${note.content} ${note.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.id - b.id), [notes, filter, query, sort])
  const dirty = Boolean(selected && draft && (selected.title !== draft.title || selected.content !== draft.content || selected.type !== draft.type || selected.tags.join(',') !== draft.tags.join(',')))

  function openNote(note: Note, nextMode: Mode = 'preview') { setSelected(note); setDraft({ ...note, tags: [...note.tags] }); setMode(nextMode); setSidebarOpen(false) }
  function newNote() { const note = { id: Date.now(), title: '', content: '', type: 'General', tags: [], updated: 'Just now' }; setSelected(note); setDraft(note); setMode('edit'); setSidebarOpen(false) }
  function goHome() { if (dirty && !window.confirm('Discard unsaved changes in this prototype?')) return; setSelected(null); setDraft(null) }
  function save() { if (!draft) return; const saved = { ...draft, title: draft.title.trim() || 'Untitled note', updated: 'Just now' }; setNotes(current => [saved, ...current.filter(note => note.id !== saved.id)]); setSelected(saved); setDraft(saved) }
  function togglePin(note: Note) { const updated = { ...note, pinned: !note.pinned }; setNotes(current => current.map(item => item.id === note.id ? updated : item)); if (selected?.id === note.id) { setSelected(updated); setDraft(updated) } }

  return (
    <div className="app-shell">
      {!selected && <>
        <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} aria-label="Library navigation">
          <div className="brand"><div className="brand-mark"><BookOpen size={18} strokeWidth={1.8} /></div><div><strong>Nook</strong><span>Your private space</span></div><Button variant="ghost" size="icon-sm" className="sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X /></Button></div>
          <div className="sidebar-label">LIBRARY</div>
          <nav className="sidebar-nav"><button className={filter === 'All notes' ? 'nav-item active' : 'nav-item'} onClick={() => { setFilter('All notes'); setSidebarOpen(false) }}><FileText size={16} /> All notes <span>{notes.length}</span></button><button className={filter === 'Pinned' ? 'nav-item active' : 'nav-item'} onClick={() => { setFilter('Pinned'); setSidebarOpen(false) }}><Pin size={16} /> Pinned <span>{notes.filter(note => note.pinned).length}</span></button></nav>
          <div className="sidebar-divider" />
          <div className="sidebar-label sidebar-label--row">NOTE TYPES <MoreHorizontal size={16} /></div>
          <nav className="sidebar-nav">{types.slice(1).map(type => <button key={type} className={filter === type ? 'nav-item active' : 'nav-item'} onClick={() => { setFilter(type); setSidebarOpen(false) }}><span className={`type-dot type-dot--${typeColors[type]}`} /> {type} <span>{notes.filter(note => note.type === type).length}</span></button>)}</nav>
          <div className="sidebar-divider" />
          <div className="sidebar-label sidebar-label--row">TAGS <MoreHorizontal size={16} /></div>
          <div className="sidebar-tags"><span># dev</span><span># ideas</span><span># planning</span><span># books</span></div>
          <div className="sidebar-bottom"><div className="local-note"><span className="local-dot" /> Offline & private</div><button className="settings-link" onClick={() => window.alert('Settings are outside this UI prototype.')}><Settings2 size={16} /> Settings</button></div>
        </aside>
        {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
        <main className="home-main">
          <header className="home-header"><div className="home-title"><Button variant="ghost" size="icon" className="menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><PanelLeftClose size={18} /></Button><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Personal Notes</h1><p>A calm place for everything worth keeping.</p></div></div><div className="header-actions"><span className="demo-label">UI prototype · sample data</span><Button className="new-button" onClick={newNote}><Plus size={16} /> New note</Button></div></header>
          <section className="browse-panel" aria-label="Browse notes"><div className="browse-heading"><div><div className="browse-title-row"><h2>Browse notes</h2><Badge variant="secondary">{visibleNotes.length}</Badge></div><p>Find and revisit your notes</p></div><Button variant="outline" size="sm" onClick={() => setFilter('All notes')}><Folder size={15} /> All notes <ChevronDown size={14} /></Button></div>
            <div className="toolbar"><div className="search-wrap"><Search size={17} /><Input aria-label="Search notes" placeholder="Search notes..." value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</div><div className="toolbar-right"><button className="sort-button" onClick={() => setSort(sort === 'recent' ? 'title' : 'recent')}><ArrowUpDown size={15} /> {sort === 'recent' ? 'Recently updated' : 'Title A–Z'} <ChevronDown size={14} /></button><div className="view-switch" aria-label="Note layout"><button aria-label="Grid view" aria-pressed={view === 'grid'} className={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')}><LayoutGrid size={16} /></button><button aria-label="List view" aria-pressed={view === 'list'} className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}><List size={16} /></button></div></div></div>
            <div className={`note-grid ${view === 'list' ? 'note-grid--list' : ''}`}>{visibleNotes.map(note => <Card key={note.id} className={`note-card ${note.pinned ? 'note-card--pinned' : ''}`}><button className="card-body" onClick={() => openNote(note)}><div className="card-top"><span className={`type-pill type-pill--${typeColors[note.type]}`}>{note.type}</span>{note.pinned && <Pin size={14} className="pin-indicator" fill="currentColor" />}</div><h3>{note.title}</h3><p>{note.content.replace(/[#*`>|[\]-]/g, '').slice(0, 135)}</p></button><div className="card-footer"><span><Clock3 size={13} /> {note.updated}</span><div><Button variant="ghost" size="icon-xs" aria-label={`Pin ${note.title}`} onClick={() => togglePin(note)}><Pin size={14} /></Button><Button variant="ghost" size="icon-xs" aria-label={`Edit ${note.title}`} onClick={() => openNote(note, 'edit')}><MoreHorizontal size={16} /></Button></div></div></Card>)}</div>
            {visibleNotes.length === 0 && <div className="empty-state"><Search size={24} /><h3>No notes found</h3><p>Try another search or note type.</p></div>}
          </section>
          <footer className="home-footer">Prototype UI only. Changes are kept in memory until you reload.</footer>
        </main>
      </>}
      {selected && draft && <main className="detail-shell"><header className="detail-header"><div className="detail-header-left"><Button variant="ghost" size="sm" onClick={goHome}><ArrowLeft size={17} /> All notes</Button><span className="header-divider" /><span className="detail-header-title">{mode === 'edit' ? 'Edit note' : 'Preview note'}</span><span className="saved-state"><Check size={13} /> {dirty ? 'Unsaved' : 'Sample data'}</span></div><div className="detail-header-right"><div className="mode-switch" role="group" aria-label="Note mode"><button className={mode === 'edit' ? 'selected' : ''} onClick={() => setMode('edit')}>Edit</button><button className={mode === 'preview' ? 'selected' : ''} onClick={() => setMode('preview')}>Preview</button></div><Button className="detail-save" onClick={save} disabled={!dirty && notes.some(note => note.id === draft.id)}><Check size={16} /> Save note</Button></div></header>
        <div className="detail-content"><div className="detail-intro">{mode === 'edit' ? <Input className="title-input" aria-label="Note title" placeholder="Untitled note" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /> : <h1>{draft.title || 'Untitled note'}</h1>}<div className="detail-meta"><span className="meta-label">TYPE</span>{mode === 'edit' ? <select className="type-select" aria-label="Note type" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}>{types.slice(1).map(type => <option key={type}>{type}</option>)}</select> : <span className={`type-pill type-pill--${typeColors[draft.type]}`}>{draft.type}</span>}<span className="meta-separator" /><span className="meta-label">TAGS</span><Tag size={14} className="meta-tag-icon" />{draft.tags.length ? draft.tags.map(tag => <span className="tag-pill" key={tag}>#{tag}</span>) : <span className="no-tags">No tags</span>}</div></div>
          {mode === 'edit' ? <div className="editor-area"><div className="format-toolbar"><div className="format-group"><button title="Heading" onClick={() => setDraft({ ...draft, content: draft.content + '\n## Heading' })}>H</button><button title="Bold" onClick={() => setDraft({ ...draft, content: draft.content + '**bold**' })}><strong>B</strong></button><button title="Italic" onClick={() => setDraft({ ...draft, content: draft.content + '*italic*' })}><em>I</em></button></div><span className="format-divider" /><div className="format-group"><button title="Insert list" onClick={() => setDraft({ ...draft, content: draft.content + '\n- Item' })}>☷</button><button title="Insert code" onClick={() => setDraft({ ...draft, content: draft.content + '`code`' })}><Code2 size={16} /></button></div><span className="format-help">Markdown supported</span></div><Textarea className="markdown-input" aria-label="Markdown content" placeholder="Start writing your note in Markdown..." value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} /></div> : <article className="preview-area"><div className="preview-label">PREVIEW</div><div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span role="img" aria-label={alt || 'Image'}>[Image: {alt || 'no description'}]</span>, a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}>{draft.content || '*Nothing to preview yet.*'}</ReactMarkdown></div></article>}
        </div><footer className="detail-footer"><span><Clock3 size={14} /> Updated {draft.updated} <span className="footer-dot">·</span> Demo data resets on reload</span><div><Button variant="ghost" size="sm" onClick={() => togglePin(draft)}><Pin size={15} /> {draft.pinned ? 'Unpin' : 'Pin'}</Button><Button variant="ghost" size="sm" onClick={() => window.alert('Trash is outside this UI prototype.')}><Trash2 size={15} /> Delete</Button></div></footer>
      </main>}
    </div>
  )
}

export default App
