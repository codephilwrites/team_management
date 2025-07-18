import { useState, useEffect } from 'react'
import './App.css'
import jsPDF from 'jspdf';

// Types
type ValueStream = {
  id: string
  name: string
  tasks: Task[]
  notes: Note[]
}
type Task = {
  id: string
  content: string
  done: boolean
  created: string
  closeComment?: string
  closeDate?: string
}
type Note = {
  id: string
  text: string
  created: string
}
type Action = {
  text: string;
  date: string;
  done: boolean;
  closeComment?: string;
  closeDate?: string;
};
type OneOnOneSession = {
  date: string
  notes: { text: string; date: string }[]
  actions: Action[]
  objectives: { text: string; date: string }[]
}
type OneOnOne = {
  id: string
  person: string
  sessions: OneOnOneSession[]
}
type Initiative = {
  id: string
  name: string
  emoji: string
  tasks: Task[]
  notes: Note[]
}

// IndexedDB helpers
function saveToIndexedDB(key: string, value: any) {
  return new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.open('team-manager', 1)
    request.onupgradeneeded = function () {
      const db = request.result
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data')
      }
    }
    request.onsuccess = function () {
      const db = request.result
      const tx = db.transaction('data', 'readwrite')
      const store = tx.objectStore('data')
      store.put(value, key)
      tx.oncomplete = function () {
        db.close()
        resolve()
      }
      tx.onerror = function (e) {
        db.close()
        reject(e)
      }
    }
    request.onerror = function (e) {
      reject(e)
    }
  })
}
function loadFromIndexedDB(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open('team-manager', 1)
    request.onupgradeneeded = function () {
      const db = request.result
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data')
      }
    }
    request.onsuccess = function () {
      const db = request.result
      const tx = db.transaction('data', 'readonly')
      const store = tx.objectStore('data')
      const getReq = store.get(key)
      getReq.onsuccess = function () {
        resolve(getReq.result)
        db.close()
      }
      getReq.onerror = function (e) {
        db.close()
        reject(e)
      }
    }
    request.onerror = function (e) {
      reject(e)
    }
  })
}

function App() {
  // Collapsible sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Delete handlers
  const deleteValueStream = (id: string) => {
    setValueStreams(vs => vs.filter(s => s.id !== id))
    if (selectedStream === id) setSelectedStream(null)
  }
  const deleteInitiative = (id: string) => {
    setInitiatives(is => is.filter(i => i.id !== id))
    if (selectedInitiative === id) setSelectedInitiative(null)
  }
  const deletePerson = (id: string) => {
    setOneOnOnes(oos => oos.filter(o => o.id !== id))
    if (selectedOneOnOne === id) setSelectedOneOnOne(null)
    if (runOneOnOne === id) setRunOneOnOne(null)
  }
  // State
  const [view, setView] = useState<'dashboard' | 'settings' | 'oneonone' | 'week' | 'initiative'>('dashboard')
  const [valueStreams, setValueStreams] = useState<ValueStream[]>([])
  const [initiatives, setInitiatives] = useState<Initiative[]>([])
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [selectedInitiative, setSelectedInitiative] = useState<string | null>(null)
  const [oneOnOnes, setOneOnOnes] = useState<OneOnOne[]>([])
  const [person, setPerson] = useState('')
  const [newStream, setNewStream] = useState('')
  const [newTask, setNewTask] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [modalSession, setModalSession] = useState<{ notes: { text: string, date: string }[], actions: { text: string, date: string, done: boolean }[], objectives: { text: string, date: string }[] } | null>(null)
  const [runOneOnOne, setRunOneOnOne] = useState<string | null>(null)
  const [selectedOneOnOne, setSelectedOneOnOne] = useState<string | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [closeActionModal, setCloseActionModal] = useState<null | { personId: string, sessionIdx: number, actionIdx: number }>(null)
  const [closeActionComment, setCloseActionComment] = useState('')
  const [inputType, setInputType] = useState<'task' | 'note'>('task')
  const [newNote, setNewNote] = useState('')
  const [closeTaskModal, setCloseTaskModal] = useState<null | { taskId: string, day: string }>(null)
  const [closeTaskComment, setCloseTaskComment] = useState('')
  const [valueStreamsLoaded, setValueStreamsLoaded] = useState(false)
  const [oneOnOnesLoaded, setOneOnOnesLoaded] = useState(false)
  const [initiativesLoaded, setInitiativesLoaded] = useState(false)
  const [viewClosureModal, setViewClosureModal] = useState<null | { comment: string, date: string }>(null)

  // Handlers
  const addValueStream = () => {
    if (!newStream.trim()) return
    setValueStreams([...valueStreams, { id: Date.now() + '', name: newStream, tasks: [], notes: [] }])
    setNewStream('')
  }
  const addTaskOrNote = () => {
    if (!selectedStream) return
    if (inputType === 'task') {
      if (!newTask.trim()) return
      setValueStreams(vs => vs.map(s => s.id === selectedStream ? {
        ...s,
        tasks: [...s.tasks, { id: Date.now() + '', content: newTask, done: false, created: new Date().toISOString() }]
      } : s))
      setNewTask('')
    } else {
      if (!newNote.trim()) return
      setValueStreams(vs => vs.map(s => s.id === selectedStream ? {
        ...s,
        notes: [...(s.notes || []), { id: Date.now() + '', text: newNote, created: new Date().toISOString() }]
      } : s))
      setNewNote('')
    }
  }
  const toggleTaskWithClosure = (taskId: string, day: string) => {
    const stream = valueStreams.find(s => s.id === selectedStream)
    const task = stream?.tasks.find(t => t.id === taskId)
    if (task && !task.done) {
      setCloseTaskModal({ taskId, day })
      setCloseTaskComment('')
    } else {
      setValueStreams(vs => vs.map(s => s.id === selectedStream ? {
        ...s,
        tasks: s.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
      } : s))
    }
  }
  const addOneOnOne = () => {
    if (!person.trim()) return
    setOneOnOnes([...oneOnOnes, { id: Date.now() + '', person, sessions: [] }])
    setPerson('')
  }
  const toggleActionDone = (personId: string, sessionIdx: number, actionIdx: number) => {
    setOneOnOnes(oos => oos.map(o => {
      if (o.id !== personId) return o
      const sessions = o.sessions.map((s, si) => {
        if (si !== sessionIdx) return s
        return {
          ...s,
          actions: s.actions.map((a, ai) => ai === actionIdx ? { ...a, done: !a.done } : a)
        }
      })
      return { ...o, sessions }
    }))
  }
  const startOneOnOne = (personId: string) => {
    setRunOneOnOne(personId)
    setMinimized(false)
    setModalSession({ notes: [], actions: [], objectives: [] })
  }
  const completeOneOnOne = () => {
    setOneOnOnes(oos => oos.map(o => {
      if (o.id !== runOneOnOne) return o
      const sessions = [...o.sessions, {
        date: new Date().toISOString(),
        notes: modalSession?.notes || [],
        actions: modalSession?.actions || [],
        objectives: modalSession?.objectives || []
      }]
      return { ...o, sessions }
    }))
    setRunOneOnOne(null)
    setModalSession(null)
    setMinimized(false)
  }
  const handleActionCheckbox = (personId: string, sessionIdx: number, actionIdx: number, isModal: boolean = false) => {
    const person = oneOnOnes.find(o => o.id === personId)
    const session = person?.sessions[sessionIdx]
    const action = session?.actions[actionIdx]
    if (action && !action.done) {
      setCloseActionModal({ personId, sessionIdx, actionIdx })
      setCloseActionComment('')
    } else {
      if (isModal) {
        setModalSession(s => s && { ...s, actions: s.actions.map((a, i) => i === actionIdx ? { ...a, done: !a.done } : a) })
      } else {
        toggleActionDone(personId, sessionIdx, actionIdx)
      }
    }
  }
  const confirmCloseAction = () => {
    if (!closeActionModal) return
    setOneOnOnes(oos => oos.map(o => {
      if (o.id !== closeActionModal.personId) return o
      const sessions = o.sessions.map((s, si) => {
        if (si !== closeActionModal.sessionIdx) return s
        return {
          ...s,
          actions: s.actions.map((a, ai) => ai === closeActionModal.actionIdx ? { ...a, done: true, closeComment: closeActionComment, closeDate: new Date().toISOString() } : a)
        }
      })
      return { ...o, sessions }
    }))
    setCloseActionModal(null)
    setCloseActionComment('')
  }
  const confirmCloseTask = () => {
    if (!closeTaskModal) return
    setValueStreams(vs => vs.map(s => s.id === selectedStream ? {
      ...s,
      tasks: s.tasks.map(t => t.id === closeTaskModal.taskId ? { ...t, done: true, closeComment: closeTaskComment, closeDate: new Date().toISOString() } : t)
    } : s))
    setCloseTaskModal(null)
    setCloseTaskComment('')
  }
  // Auto-load from IndexedDB on mount
  useEffect(() => {
    loadFromIndexedDB('valueStreams').then(data => {
      if (data) setValueStreams(data)
      setValueStreamsLoaded(true)
    })
    loadFromIndexedDB('oneOnOnes').then(data => {
      if (data) setOneOnOnes(data)
      setOneOnOnesLoaded(true)
    })
    loadFromIndexedDB('initiatives').then(data => {
      if (data) setInitiatives(data)
      setInitiativesLoaded(true)
    })
  }, [])
  // Auto-save to IndexedDB on change, but only after initial load
  useEffect(() => {
    if (valueStreamsLoaded) {
      saveToIndexedDB('valueStreams', valueStreams)
    }
  }, [valueStreams, valueStreamsLoaded])
  useEffect(() => {
    if (oneOnOnesLoaded) {
      saveToIndexedDB('oneOnOnes', oneOnOnes)
    }
  }, [oneOnOnes, oneOnOnesLoaded])
  useEffect(() => {
    if (initiativesLoaded) {
      saveToIndexedDB('initiatives', initiatives)
    }
  }, [initiatives, initiativesLoaded])

  // Initiative state/handlers
  const [newInitiative, setNewInitiative] = useState('')
  const [newInitiativeEmoji, setNewInitiativeEmoji] = useState('')
  const initiativeEmojis = ['🚀','🎯','💡','📈','🛠️','🔬','🧩','🌟','📦','🧭','🦾','🧠','🗺️','🏆','⚡','🔗','🛡️','🎉','🧪','📊']
  const addInitiative = () => {
    if (!newInitiative.trim() || !newInitiativeEmoji) return
    setInitiatives([
      ...initiatives,
      { id: Date.now() + '', name: newInitiative, emoji: newInitiativeEmoji, tasks: [], notes: [] }
    ])
    setNewInitiative('')
    setNewInitiativeEmoji('')
  }

  // Add task/note to initiative
  const addTaskOrNoteToInitiative = () => {
    if (!selectedInitiative) return
    if (inputType === 'task') {
      if (!newTask.trim()) return
      setInitiatives(is => is.map(s => s.id === selectedInitiative ? {
        ...s,
        tasks: [...s.tasks, { id: Date.now() + '', content: newTask, done: false, created: new Date().toISOString() }]
      } : s))
      setNewTask('')
    } else {
      if (!newNote.trim()) return
      setInitiatives(is => is.map(s => s.id === selectedInitiative ? {
        ...s,
        notes: [...(s.notes || []), { id: Date.now() + '', text: newNote, created: new Date().toISOString() }]
      } : s))
      setNewNote('')
    }
  }
  // Auto-load from IndexedDB on mount
  useEffect(() => {
    loadFromIndexedDB('valueStreams').then(data => {
      if (data) setValueStreams(data)
      setValueStreamsLoaded(true)
    })
    loadFromIndexedDB('oneOnOnes').then(data => {
      if (data) setOneOnOnes(data)
      setOneOnOnesLoaded(true)
    })
    loadFromIndexedDB('initiatives').then(data => {
      if (data) {
        // Migrate legacy initiatives with emoji in name
        const migrated = data.map((i: any) => {
          if (typeof i.emoji === 'string') return i;
          // Try to extract emoji from name (if present)
          const match = /^([\p{Emoji_Presentation}\p{Extended_Pictographic}])\s*(.*)$/u.exec(i.name || '');
          if (match) {
            return { ...i, emoji: match[1], name: match[2] };
          } else {
            return { ...i, emoji: '', name: i.name };
          }
        });
        setInitiatives(migrated);
      }
      setInitiativesLoaded(true)
    })
  }, [])
  // Auto-save to IndexedDB on change, but only after initial load
  useEffect(() => {
    if (valueStreamsLoaded) {
      saveToIndexedDB('valueStreams', valueStreams)
    }
  }, [valueStreams, valueStreamsLoaded])
  useEffect(() => {
    if (oneOnOnesLoaded) {
      saveToIndexedDB('oneOnOnes', oneOnOnes)
    }
  }, [oneOnOnes, oneOnOnesLoaded])
  useEffect(() => {
    if (initiativesLoaded) {
      saveToIndexedDB('initiatives', initiatives)
    }
  }, [initiatives, initiativesLoaded])

  // Helper functions
  const getSessionCount = (personId: string) => {
    const person = oneOnOnes.find(o => o.id === personId)
    return person ? person.sessions.length : 0
  }

  // UI
  return (
    <div className="admin-portal" style={{ display: 'flex', height: '100vh' }}>
      <aside className="sidebar" style={{ width: sidebarCollapsed ? 64 : 220, transition: 'width 0.2s', overflow: 'hidden', position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src="/SE_logo_1.svg" alt="SE Logo" style={{ display: 'block', margin: sidebarCollapsed ? '1rem auto' : '2rem auto 1rem auto', maxWidth: sidebarCollapsed ? '40px' : '80%', height: 'auto', transition: 'all 0.2s' }} />
          <nav style={{ display: 'flex', flexDirection: 'column', alignItems: sidebarCollapsed ? 'center' : 'stretch', gap: '0.2em', width: '100%', flex: 1, minHeight: 0, justifyContent: 'flex-start' }}>
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => { setView('dashboard'); setSelectedInitiative(null); }} style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '0.7em 0' : undefined, width: '100%' }}>
            <span role="img" aria-label="dashboard">📋</span>
            {!sidebarCollapsed && <span style={{ marginLeft: 10 }}>Value Streams</span>}
          </button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => { setView('week'); setSelectedInitiative(null); }} style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '0.7em 0' : undefined, width: '100%' }}>
            <span role="img" aria-label="week">🗓️</span>
            {!sidebarCollapsed && <span style={{ marginLeft: 10 }}>Week Management</span>}
          </button>
          <button className={view === 'oneonone' ? 'active' : ''} onClick={() => { setView('oneonone'); setSelectedInitiative(null); }} style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '0.7em 0' : undefined, width: '100%' }}>
            <span role="img" aria-label="1:1">👥</span>
            {!sidebarCollapsed && <span style={{ marginLeft: 10 }}>Team Management</span>}
          </button>
          <div style={{  width: sidebarCollapsed ? 40 : '100%' }} />
          {initiatives.map(i => (
            <button
              key={i.id}
              className={view === 'initiative' && selectedInitiative === i.id ? 'active' : ''}
              onClick={() => { setView('initiative'); setSelectedInitiative(i.id); }}
              style={{
               
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '1.2em', margin: sidebarCollapsed ? '0 auto' : undefined }}>{i.emoji}</span>
              {!sidebarCollapsed && <span style={{ marginLeft: 10 }}>{i.name}</span>}
            </button>
          ))}
          </nav>
        </div>
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 30,
            transform: 'translate(-50%, 50%)',
            width: 32,
            height: 32,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: 'white',
            borderRadius: '50%',
            boxShadow: '0 1px 3px #0001',
            transition: 'background 0.2s',
            zIndex: 10,
            color: '#016c42'
          }}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <span>	&#62;&#62;</span> : <span>	&#60;&#60;</span>}
        </button>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <header className="navbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1.2rem' }}>Software Engineering Admin Portal</span>
            <button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); setSelectedInitiative(null); }} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: view === 'settings' ? 'var(--primary)' : '#333', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5em' }}>
              <span role="img" aria-label="settings">⚙️</span> 
            </button>
          </div>
        </header>
        <main className="main-content">
          {view === 'settings' && (
            <section className="card">
              <h2>Value Streams</h2>
              <input value={newStream} onChange={e => setNewStream(e.target.value)} placeholder="Add value stream" />
              <button onClick={addValueStream}>Add</button>
              <ul>
                {valueStreams.map(s => (
                  <li key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5em' }}>
                    <span>{s.name}</span>
                    <button onClick={() => deleteValueStream(s.id)} style={{ background: 'none', border: 'none', color: '#c00', fontWeight: 700, fontSize: '1.1em', cursor: 'pointer' }} title="Delete value stream" aria-label="Delete">✕</button>
                  </li>
                ))}
              </ul>
              <hr style={{ margin: '2rem 0' }} />
              <h2>Initiatives</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap', marginBottom: '0.5em' }}>
                <input value={newInitiative} onChange={e => setNewInitiative(e.target.value)} placeholder="Add initiative" style={{ flex: 1 }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2em', maxWidth: '320px' }}>
                  {initiativeEmojis.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      style={{
                        fontSize: '1.2em',
                        padding: '0.2em 0.4em',
                        background: newInitiativeEmoji === emoji ? '#e6f7f1' : '#fff',
                        cursor: 'pointer',
                        border: 'none',                        margin: '0 0.1em',
                        outline: 'none',
                      }}
                      onClick={() => setNewInitiativeEmoji(emoji)}
                      aria-label={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button onClick={addInitiative} disabled={!newInitiative.trim() || !newInitiativeEmoji} style={{ background: 'var(--primary)', color: '#fff', borderRadius: '5px', padding: '0.5rem 1rem', marginLeft: '0.5em' }}>Add</button>
              </div>
              <ul>
                {initiatives.map(i => (
                  <li key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5em' }}>
                    <span>{i.name}</span>
                    <button onClick={() => deleteInitiative(i.id)} style={{ background: 'none', border: 'none', color: '#c00', fontWeight: 700, fontSize: '1.1em', cursor: 'pointer' }} title="Delete initiative" aria-label="Delete">✕</button>
                  </li>
                ))}
              </ul>
              <hr style={{ margin: '2rem 0' }} />
              <h2>Team Members</h2>
              <input value={person} onChange={e => setPerson(e.target.value)} placeholder="Add team member" />
              <button onClick={addOneOnOne}>Add</button>
              <ul>
                {oneOnOnes.map(o => (
                  <li key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5em' }}>
                    <span>{o.person}</span>
                    <button onClick={() => deletePerson(o.id)} style={{ background: 'none', border: 'none', color: '#c00', fontWeight: 700, fontSize: '1.1em', cursor: 'pointer' }} title="Delete person" aria-label="Delete">✕</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {view === 'dashboard' && (
            <section className="card">
              <h2>Value Streams</h2>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                {valueStreams.map(s => (
                  <button
                    key={s.id}
                    className={selectedStream === s.id ? 'selected' : ''}
                    style={{
                      minWidth: '120px',
                      background: selectedStream === s.id ? 'var(--primary)' : '',
                      color: selectedStream === s.id ? '#fff' : '',
                      borderRadius: '5px',
                      padding: '0.5rem 1rem',
                      marginBottom: '0.5rem',
                      border: '1px solid #ccc',
                      fontWeight: selectedStream === s.id ? 700 : 400
                    }}
                    onClick={() => setSelectedStream(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              {selectedStream ? (
                <>
                  <div className="card" style={{ marginTop: '1rem', background: '#f8f8f8' }}>
                    <h3 style={{ marginTop: 0 }}>Add Task/Note for {valueStreams.find(s => s.id === selectedStream)?.name}</h3>
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ display: 'flex', gap: '1em', marginBottom: '1em' }}>
                          <button onClick={() => setInputType('task')} style={{ background: inputType === 'task' ? 'var(--primary)' : '#eee', color: inputType === 'task' ? '#fff' : '#222', borderRadius: '5px', padding: '0.5rem 1rem', border: 'none' }}>Task</button>
                          <button onClick={() => setInputType('note')} style={{ background: inputType === 'note' ? 'var(--primary)' : '#eee', color: inputType === 'note' ? '#fff' : '#222', borderRadius: '5px', padding: '0.5rem 1rem', border: 'none' }}>Note</button>
                        </div>
                        {inputType === 'task' ? (
                          <>
                            <textarea value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add task" rows={3} style={{ width: '100%', marginBottom: '0.5rem', resize: 'vertical' }} />
                          </>
                        ) : (
                          <>
                            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add note" rows={3} style={{ width: '100%', marginBottom: '0.5rem', resize: 'vertical' }} />
                          </>
                        )}
                        <button onClick={addTaskOrNote} style={{ background: 'var(--primary)', color: '#fff', borderRadius: '5px', padding: '0.5rem 1rem' }}>Add</button>
                      </div>
                    </div>
                  </div>
                  {/* Group tasks and notes by date and show a card for each day */}
                  {(() => {
                    const stream = valueStreams.find(s => s.id === selectedStream)
                    if (!stream || (!stream.tasks.length && !(stream.notes && stream.notes.length))) return <p style={{ color: '#888', marginTop: '2em' }}>No tasks or notes yet.</p>
                    // Group tasks and notes by date (YYYY-MM-DD)
                    const grouped: { [date: string]: { tasks: Task[], notes: Note[] } } = {}
                    stream.tasks.forEach(t => {
                      const day = new Date(t.created).toISOString().slice(0, 10)
                      if (!grouped[day]) grouped[day] = { tasks: [], notes: [] }
                      grouped[day].tasks.push(t)
                    })
                      ; (stream.notes || []).forEach(n => {
                        const day = new Date(n.created).toISOString().slice(0, 10)
                        if (!grouped[day]) grouped[day] = { tasks: [], notes: [] }
                        grouped[day].notes.push(n)
                      })
                    // Sort dates descending
                    const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
                    return days.map(day => (
                      <div key={day} className="card" style={{ marginTop: '1.5rem', background: '#fff' }}>
                        <h4 style={{ marginTop: 0 }}>{new Date(day).toLocaleDateString()}</h4>
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '220px' }}>
                            <h5>Tasks</h5>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                              {grouped[day].tasks.map(t => (
                                <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '1em', marginBottom: '0.5em', background: '#f8f8f8', borderRadius: '6px', boxShadow: '0 1px 4px #0001', padding: '0.5em 1em' }}>
                                  <input type="checkbox" checked={t.done} onChange={() => toggleTaskWithClosure(t.id, day)} />
                                  <span style={{ textDecoration: t.done ? 'line-through' : 'none', flex: 1 }}>{t.content}</span>
                                  <span style={{ color: '#888', fontSize: '0.9em' }}>{new Date(t.created).toLocaleTimeString()}</span>
                                  {t.done && t.closeComment && (
                                    <button
                                      style={{ marginLeft: '0.5em', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                                      title="View closure comment"
                                      onClick={() => setViewClosureModal({ comment: t.closeComment!, date: t.closeDate || '' })}
                                    >
                                      💬
                                    </button>
                                  )}
                                </li>
                              ))}
                              {grouped[day].tasks.length === 0 && <li style={{ color: '#888' }}>No tasks.</li>}
                            </ul>
                          </div>
                          <div style={{ flex: 1, minWidth: '220px' }}>
                            <h5>Notes</h5>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                              {grouped[day].notes.map(n => (
                                <li key={n.id} style={{ background: '#f8f8f8', borderRadius: '6px', boxShadow: '0 1px 4px #0001', padding: '0.5em 1em', marginBottom: '0.5em' }}>
                                  <span>{n.text}</span>
                                  <span style={{ color: '#888', fontSize: '0.9em', marginLeft: '0.5em' }}>{new Date(n.created).toLocaleTimeString()}</span>
                                </li>
                              ))}
                              {grouped[day].notes.length === 0 && <li style={{ color: '#888' }}>No notes.</li>}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))
                  })()}
                  {closeTaskModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ background: '#fff', padding: '2rem', borderRadius: '10px', minWidth: '320px', maxWidth: '90vw', boxShadow: '0 2px 16px #0004', textAlign: 'center' }}>
                        <h3>Close Task</h3>
                        <p>Please add a comment for closing this task:</p>
                        <textarea value={closeTaskComment} onChange={e => setCloseTaskComment(e.target.value)} rows={4} style={{ width: '100%', marginBottom: '1rem', resize: 'vertical' }} autoFocus />
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                          <button onClick={() => { setCloseTaskModal(null); setCloseTaskComment('') }}>Cancel</button>
                          <button onClick={confirmCloseTask} disabled={!closeTaskComment.trim()}>Confirm Close</button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : <p style={{ color: '#888' }}>Select a value stream to view tasks/notes.</p>}
            </section>
          )}
          {view === 'initiative' && selectedInitiative && (() => {
            const initiative = initiatives.find(i => i.id === selectedInitiative)
            if (!initiative) return <p style={{ color: '#888' }}>Initiative not found.</p>
            return (
              <section className="card">
                <h2>Initiative: {initiative.name}</h2>
                <div className="card" style={{ marginTop: '1rem', background: '#f8f8f8' }}>
                  <h3 style={{ marginTop: 0 }}>Add Task/Note for {initiative.name}</h3>
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                      <div style={{ display: 'flex', gap: '1em', marginBottom: '1em' }}>
                        <button onClick={() => setInputType('task')} style={{ background: inputType === 'task' ? 'var(--primary)' : '#eee', color: inputType === 'task' ? '#fff' : '#222', borderRadius: '5px', padding: '0.5rem 1rem', border: 'none' }}>Task</button>
                        <button onClick={() => setInputType('note')} style={{ background: inputType === 'note' ? 'var(--primary)' : '#eee', color: inputType === 'note' ? '#fff' : '#222', borderRadius: '5px', padding: '0.5rem 1rem', border: 'none' }}>Note</button>
                      </div>
                      {inputType === 'task' ? (
                        <>
                          <textarea value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add task" rows={3} style={{ width: '100%', marginBottom: '0.5rem', resize: 'vertical' }} />
                        </>
                      ) : (
                        <>
                          <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add note" rows={3} style={{ width: '100%', marginBottom: '0.5rem', resize: 'vertical' }} />
                        </>
                      )}
                      <button onClick={addTaskOrNoteToInitiative} style={{ background: 'var(--primary)', color: '#fff', borderRadius: '5px', padding: '0.5rem 1rem' }}>Add</button>
                    </div>
                  </div>
                </div>
                {/* Group tasks and notes by date and show a card for each day */}
                {(() => {
                  if (!initiative.tasks.length && !(initiative.notes && initiative.notes.length)) return <p style={{ color: '#888', marginTop: '2em' }}>No tasks or notes yet.</p>
                  // Group tasks and notes by date (YYYY-MM-DD)
                  const grouped: { [date: string]: { tasks: Task[], notes: Note[] } } = {}
                  initiative.tasks.forEach(t => {
                    const day = new Date(t.created).toISOString().slice(0, 10)
                    if (!grouped[day]) grouped[day] = { tasks: [], notes: [] }
                    grouped[day].tasks.push(t)
                  })
                    ; (initiative.notes || []).forEach(n => {
                      const day = new Date(n.created).toISOString().slice(0, 10)
                      if (!grouped[day]) grouped[day] = { tasks: [], notes: [] }
                      grouped[day].notes.push(n)
                    })
                  // Sort dates descending
                  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
                  return days.map(day => (
                    <div key={day} className="card" style={{ marginTop: '1.5rem', background: '#fff' }}>
                      <h4 style={{ marginTop: 0 }}>{new Date(day).toLocaleDateString()}</h4>
                      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Tasks</h5>
                          <ul style={{ listStyle: 'none', padding: 0 }}>
                            {grouped[day].tasks.map(t => (
                              <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '1em', marginBottom: '0.5em', background: '#f8f8f8', borderRadius: '6px', boxShadow: '0 1px 4px #0001', padding: '0.5em 1em' }}>
                                <input type="checkbox" checked={t.done} onChange={() => {
                                  setInitiatives(is => is.map(i => i.id === selectedInitiative ? {
                                    ...i,
                                    tasks: i.tasks.map(task => task.id === t.id ? { ...task, done: !task.done } : task)
                                  } : i))
                                }} />
                                <span style={{ textDecoration: t.done ? 'line-through' : 'none', flex: 1 }}>{t.content}</span>
                                <span style={{ color: '#888', fontSize: '0.9em' }}>{new Date(t.created).toLocaleTimeString()}</span>
                                {t.done && t.closeComment && (
                                  <button
                                    style={{ marginLeft: '0.5em', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                                    title="View closure comment"
                                    onClick={() => setViewClosureModal({ comment: t.closeComment!, date: t.closeDate || '' })}
                                  >
                                    💬
                                  </button>
                                )}
                              </li>
                            ))}
                            {grouped[day].tasks.length === 0 && <li style={{ color: '#888' }}>No tasks.</li>}
                          </ul>
                        </div>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Notes</h5>
                          <ul style={{ listStyle: 'none', padding: 0 }}>
                            {grouped[day].notes.map(n => (
                              <li key={n.id} style={{ background: '#f8f8f8', borderRadius: '6px', boxShadow: '0 1px 4px #0001', padding: '0.5em 1em', marginBottom: '0.5em' }}>
                                <span>{n.text}</span>
                                <span style={{ color: '#888', fontSize: '0.9em', marginLeft: '0.5em' }}>{new Date(n.created).toLocaleTimeString()}</span>
                              </li>
                            ))}
                            {grouped[day].notes.length === 0 && <li style={{ color: '#888' }}>No notes.</li>}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))
                })()}
              </section>
            )
          })()}
          {view === 'oneonone' && (
            <>
              <section className="card">
                <h2>Team Management</h2>
                <h3>Choose Team Member</h3>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {oneOnOnes.map(o => (
                    <button key={o.id} style={{ minWidth: '120px', background: selectedOneOnOne === o.id ? 'var(--primary)' : '', color: selectedOneOnOne === o.id ? '#fff' : '', borderRadius: '5px', padding: '0.5rem 1rem', marginBottom: '0.5rem' }} onClick={() => setSelectedOneOnOne(o.id)}>{o.person}</button>
                  ))}
                </div>
              </section>

              {selectedOneOnOne && (
                <>
                  <section className="card" style={{ marginTop: '1.5rem' }}>
                    <h3>Overview for {oneOnOnes.find(o => o.id === selectedOneOnOne)?.person}</h3>
                    <button onClick={() => startOneOnOne(selectedOneOnOne)} style={{ marginBottom: '1rem' }}>Start 1:1</button>
                    <ul>
                      {oneOnOnes.find(o => o.id === selectedOneOnOne)?.sessions.flatMap(s => s.actions.map(a => a)).filter(a => !a.done).map((a, i) => (
                        <li key={i}>{a.text} <span style={{ color: '#888', fontSize: '0.9em' }}>({new Date(a.date).toLocaleDateString()})</span></li>
                      )) || <li>No open actions</li>}
                    </ul>
                  </section>
                  {oneOnOnes.find(o => o.id === selectedOneOnOne)?.sessions.slice().reverse().map((session, idx) => (
                    <section className="card" key={session.date} style={{ marginTop: '1.5rem' }}>
                      <h4>Session: {new Date(session.date).toLocaleDateString()}</h4>
                      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Notes</h5>
                          <ul>
                            {session.notes.map((n, i) => <li key={i}>{n.text} <span style={{ color: '#888', fontSize: '0.9em' }}>({new Date(n.date).toLocaleDateString()})</span></li>)}
                          </ul>
                        </div>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Actions</h5>
                          <ul>
                            {session.actions.map((a, i) => (
                              <li key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                                <input type="checkbox" checked={a.done} onChange={() => handleActionCheckbox(selectedOneOnOne, getSessionCount(selectedOneOnOne) - 1 - idx, i)} />
                                <span style={{ textDecoration: a.done ? 'line-through' : 'none' }}>{a.text}</span> <span style={{ color: '#888', fontSize: '0.9em' }}>({new Date(a.date).toLocaleDateString()})</span>
                                {/* Show info icon for closed actions with a comment */}
                                {a.done && a.closeComment && (
                                  <button
                                    style={{ marginLeft: '0.5em', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                                    title="View closure comment"
                                    onClick={() => setViewClosureModal({ comment: a.closeComment!, date: a.closeDate || '' })}
                                  >
                                    💬
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Objectives</h5>
                          <ul>
                            {session.objectives.map((o, i) => (
                              <li key={i}>{o.text} <span style={{ color: '#888', fontSize: '0.9em' }}>({new Date(o.date).toLocaleDateString()})</span></li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </section>
                  ))}
                </>
              )}
              {runOneOnOne && (
                <>
                  <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: minimized ? 'transparent' : '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '2rem', borderRadius: '10px', minWidth: '340px', maxWidth: '95vw', boxShadow: '0 2px 16px #0004', position: 'relative', display: minimized ? 'none' : 'block' }}>
                      <button onClick={() => setMinimized(true)} style={{ position: 'absolute', top: 10, right: 60, fontSize: '1.5rem', background: 'none', border: 'none', cursor: 'pointer' }} title="Minimize" aria-label="Minimize"><svg width="20" height="20" viewBox="0 0 20 20"><rect x="4" y="9" width="12" height="2" fill="#333" /></svg></button>
                      <button onClick={() => setShowCloseConfirm(true)} style={{ position: 'absolute', top: 10, right: 10, fontSize: '1.5rem', background: 'none', border: 'none', cursor: 'pointer' }} title="Close without saving" aria-label="Close"><svg width="20" height="20" viewBox="0 0 20 20"><line x1="5" y1="5" x2="15" y2="15" stroke="#c00" strokeWidth="2" /><line x1="15" y1="5" x2="5" y2="15" stroke="#c00" strokeWidth="2" /></svg></button>
                      <h3>Running 1:1 for {oneOnOnes.find(o => o.id === runOneOnOne)?.person}</h3>
                      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Notes</h5>
                          <textarea value={modalSession?.notes.map(n => n.text).join('\n')} onChange={e => setModalSession(s => s && { ...s, notes: e.target.value.split('\n').map(text => ({ text, date: new Date().toISOString() })) })} rows={5} style={{ width: '100%', marginBottom: '1rem', resize: 'vertical' }} placeholder="Add note..." />
                          <ul>
                            {modalSession?.notes.map((n, i) => (
                              <li key={i}>{n.text} <span style={{ color: '#888', fontSize: '0.9em' }}>({new Date(n.date).toLocaleDateString()})</span></li>
                            ))}
                          </ul>
                        </div>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Actions</h5>
                          <textarea value={modalSession?.actions.map(a => a.text).join('\n')} onChange={e => setModalSession(s => s && { ...s, actions: e.target.value.split('\n').map(text => ({ text, date: new Date().toISOString(), done: false })) })} rows={5} style={{ width: '100%', marginBottom: '1rem', resize: 'vertical' }} placeholder="Add action..." />
                          <ul>
                            {modalSession?.actions.map((a, i) => (
                              <li key={i}>
                                <input type="checkbox" checked={a.done} onChange={() => handleActionCheckbox(runOneOnOne!, 0, i, true)} />
                                <span style={{ textDecoration: a.done ? 'line-through' : 'none' }}>{a.text}</span> <span style={{ color: '#888', fontSize: '0.9em' }}>({new Date(a.date).toLocaleDateString()})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <h5>Objectives</h5>
                          <textarea value={modalSession?.objectives.map(o => o.text).join('\n')} onChange={e => setModalSession(s => s && { ...s, objectives: e.target.value.split('\n').map(text => ({ text, date: new Date().toISOString() })) })} rows={5} style={{ width: '100%', marginBottom: '1rem', resize: 'vertical' }} placeholder="Add objective..." />
                          <ul>
                            {modalSession?.objectives.map((o, i) => <li key={i}>{o.text} <span style={{ color: '#888', fontSize: '0.9em' }}>({new Date(o.date).toLocaleDateString()})</span></li>)}
                          </ul>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginTop: '2rem' }}>
                        <button onClick={completeOneOnOne} style={{ background: 'var(--primary)', color: '#fff', fontWeight: 700, padding: '0.7rem 2rem', borderRadius: '8px' }}>Complete 1:1</button>
                      </div>
                    </div>
                    {minimized && (
                      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1100 }}>
                        <button onClick={() => setMinimized(false)} style={{ padding: '1rem 2rem', borderRadius: '10px', background: 'var(--primary)', color: '#fff', fontWeight: 700, boxShadow: '0 2px 8px #0004' }}>Resume 1:1</button>
                      </div>
                    )}
                    {showCloseConfirm && (
                      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0007', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#fff', padding: '2rem', borderRadius: '10px', minWidth: '320px', maxWidth: '90vw', boxShadow: '0 2px 16px #0004', textAlign: 'center' }}>
                          <p>Are you sure you want to close this 1:1 without saving?</p>
                          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                            <button onClick={() => setShowCloseConfirm(false)}>Cancel</button>
                            <button onClick={() => { setRunOneOnOne(null); setModalSession(null); setMinimized(false); setShowCloseConfirm(false) }} style={{ background: '#c00', color: '#fff' }}>Close without saving</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {closeActionModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: '#fff', padding: '2rem', borderRadius: '10px', minWidth: '320px', maxWidth: '90vw', boxShadow: '0 2px 16px #0004', textAlign: 'center' }}>
                    <h3>Close Action</h3>
                    <p>Please add a comment for closing this action:</p>
                    <textarea value={closeActionComment} onChange={e => setCloseActionComment(e.target.value)} rows={4} style={{ width: '100%', marginBottom: '1rem', resize: 'vertical' }} autoFocus />
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                      <button onClick={() => { setCloseActionModal(null); setCloseActionComment('') }}>Cancel</button>
                      <button onClick={confirmCloseAction} disabled={!closeActionComment.trim()}>Confirm Close</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {view === 'week' && (
            <section className="card">
              <h2>Week Management</h2>
              <button onClick={() => {
                // Get start and end of current week (Monday to Sunday)
                const now = new Date()
                const dayOfWeek = now.getDay() || 7
                const monday = new Date(now)
                monday.setDate(now.getDate() - dayOfWeek + 1)
                monday.setHours(0, 0, 0, 0)
                const sunday = new Date(monday)
                sunday.setDate(monday.getDate() + 6)
                sunday.setHours(23, 59, 59, 999)
                // Gather closed tasks from value streams and initiatives
                const closed: { type: 'vs' | 'in', name: string, task: Task }[] = []
                valueStreams.forEach(stream => {
                  stream.tasks.forEach(task => {
                    const created = new Date(task.created)
                    if (task.done && created >= monday && created <= sunday) {
                      closed.push({ type: 'vs', name: stream.name, task })
                    }
                  })
                })
                initiatives.forEach(initiative => {
                  initiative.tasks.forEach(task => {
                    const created = new Date(task.created)
                    if (task.done && created >= monday && created <= sunday) {
                      closed.push({ type: 'in', name: initiative.name, task })
                    }
                  })
                })
                // Generate PDF               
                const doc = new jsPDF()
                // Load SE_logo_2.png and add to PDF
                const img = new Image();
                img.src = '/SE_logo_2.png';
                img.onload = function() {
                  // Add image at the top, centered, width 50mm
                  const pageWidth = doc.internal.pageSize.getWidth();
                  const pageHeight = doc.internal.pageSize.getHeight();
                  const imgWidth = 50;
                  const imgHeight = img.height * (imgWidth / img.width);
                  const x = (pageWidth - imgWidth) / 2;
                  doc.addImage(img, 'PNG', x, 8, imgWidth, imgHeight);
                  let y = 8 + imgHeight + 6;
                  doc.setFontSize(16)
                  doc.text('Software Engineering Weekly Report', 10, y)
                  doc.setFontSize(12)
                  doc.text(`Week: ${monday.toLocaleDateString()} - ${sunday.toLocaleDateString()}`, 10, y + 10)
                  y = y + 20;
                  if (closed.length === 0) {
                    doc.text('No closed tasks for this week.', 10, y)
                  } else {
                    let lastGroup = ''
                    closed.sort((a, b) => a.name.localeCompare(b.name))
                    closed.forEach(({ type, name, task }) => {
                      if (name !== lastGroup) {
                        y += 8
                        doc.setFontSize(13)
                        doc.text(`${name} (${type === 'vs' ? 'Value Stream' : 'Initiative'})`, 10, y)
                        y += 6
                        lastGroup = name
                      }
                      doc.setFontSize(11)
                      doc.text(`- ${task.content}`, 14, y)
                      y += 5
                      if (task.closeComment) {
                        doc.setFontSize(10)
                        doc.text(`  Closure Note: ${task.closeComment}`, 18, y)
                        y += 5
                      }
                      if (y > 270) { doc.addPage(); y = 20 }
                    })
                  }
                  // Add footer to all pages
                  const pageCount = doc.getNumberOfPages();
                  for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(9);
                    doc.setTextColor(150);
                    doc.text('Private and Confidential', pageWidth / 2, pageHeight - 8, { align: 'center' });
                  }
                  doc.save(`Weekly-Report-${monday.toISOString().slice(0, 10)}.pdf`)
                }
              }} style={{ marginBottom: '1rem', background: 'var(--primary)', color: '#fff', borderRadius: '5px', padding: '0.5rem 1.5rem', fontWeight: 600 }}>Generate Weekly Report PDF</button>
              <div className="card" style={{ marginTop: '1rem', background: '#f8f8f8' }}>
                <h3 style={{ marginTop: 0 }}>Add Task/Note</h3>
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', gap: '1em', marginBottom: '1em' }}>
                      <select value={selectedStream || selectedInitiative || selectedOneOnOne || ''} onChange={e => {
                        const val = e.target.value
                        if (val.startsWith('vs-')) {
                          setSelectedStream(val.slice(3)); setSelectedInitiative(null); setSelectedOneOnOne(null)
                        } else if (val.startsWith('in-')) {
                          setSelectedInitiative(val.slice(3)); setSelectedStream(null); setSelectedOneOnOne(null)
                        } else if (val.startsWith('tm-')) {
                          setSelectedOneOnOne(val.slice(3)); setSelectedStream(null); setSelectedInitiative(null)
                        }
                      }} style={{ padding: '0.5rem', borderRadius: '5px', border: '1px solid #ccc' }}>
                        <option value="" disabled>Select value stream, initiative, or team member</option>
                        {valueStreams.map(s => <option key={'vs-' + s.id} value={'vs-' + s.id}>{s.name} (Value Stream)</option>)}
                        {initiatives.map(i => <option key={'in-' + i.id} value={'in-' + i.id}>{i.name} (Initiative)</option>)}
                        {oneOnOnes.map(o => <option key={'tm-' + o.id} value={'tm-' + o.id}>{o.person} (Team Member)</option>)}
                      </select>
                      <button onClick={() => setInputType('task')} style={{ background: inputType === 'task' ? 'var(--primary)' : '#eee', color: inputType === 'task' ? '#fff' : '#222', borderRadius: '5px', padding: '0.5rem 1rem', border: 'none' }}>Task</button>
                      <button onClick={() => setInputType('note')} style={{ background: inputType === 'note' ? 'var(--primary)' : '#eee', color: inputType === 'note' ? '#fff' : '#222', borderRadius: '5px', padding: '0.5rem 1rem', border: 'none' }}>Note</button>
                    </div>
                    {inputType === 'task' ? (
                      <>
                        <textarea value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add task" rows={3} style={{ width: '100%', marginBottom: '0.5rem', resize: 'vertical' }} />
                      </>
                    ) : (
                      <>
                        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add note" rows={3} style={{ width: '100%', marginBottom: '0.5rem', resize: 'vertical' }} />
                      </>
                    )}
                    <button onClick={() => {
                      if (selectedStream) { addTaskOrNote(); }
                      else if (selectedInitiative) { addTaskOrNoteToInitiative(); }
                      else if (selectedOneOnOne && inputType === 'task' && newTask.trim()) {
                        setOneOnOnes(oos => oos.map(o => o.id === selectedOneOnOne ? {
                          ...o,
                          sessions: o.sessions.length === 0 ? [{ date: new Date().toISOString(), notes: [], actions: [{ text: newTask, date: new Date().toISOString(), done: false }], objectives: [] }] : o.sessions.map((s, i, arr) => i === arr.length - 1 ? { ...s, actions: [...s.actions, { text: newTask, date: new Date().toISOString(), done: false }] } : s)
                        } : o))
                        setNewTask('')
                      }
                    }} style={{ background: 'var(--primary)', color: '#fff', borderRadius: '5px', padding: '0.5rem 1rem' }}>Add</button>
                  </div>
                </div>
              </div>
              {/* All actions from all value streams and initiatives for this week. */}
              {(() => {
                // Get start and end of current week (Monday to Sunday)
                const now = new Date()
                const dayOfWeek = now.getDay() || 7 // Sunday=0, so set to 7
                const monday = new Date(now)
                monday.setDate(now.getDate() - dayOfWeek + 1)
                monday.setHours(0, 0, 0, 0)
                const sunday = new Date(monday)
                sunday.setDate(monday.getDate() + 6)
                sunday.setHours(23, 59, 59, 999)
                // Collect all actions from all value streams and initiatives for this week
                const allActions: { type: 'vs' | 'in', name: string, task: Task }[] = []
                valueStreams.forEach(stream => {
                  stream.tasks.forEach(task => {
                    const created = new Date(task.created)
                    if (created >= monday && created <= sunday) {
                      allActions.push({ type: 'vs', name: stream.name, task })
                    }
                  })
                })
                initiatives.forEach(initiative => {
                  initiative.tasks.forEach(task => {
                    const created = new Date(task.created)
                    if (created >= monday && created <= sunday) {
                      allActions.push({ type: 'in', name: initiative.name, task })
                    }
                  })
                })
                if (allActions.length === 0) return <p style={{ color: '#888' }}>No actions for this week.</p>;
                // Group by day
                const grouped: { [date: string]: { type: 'vs' | 'in', name: string, task: Task }[] } = {}
                allActions.forEach(({ type, name, task }) => {
                  const day = new Date(task.created).toISOString().slice(0, 10)
                  if (!grouped[day]) grouped[day] = []
                  grouped[day].push({ type, name, task })
                })
                const days = Object.keys(grouped).sort()
                return (
                  <>
                    {days.map(day => (
                      <div key={day} className="card" style={{ marginTop: '1.5rem', background: '#fff' }}>
                        <h4 style={{ marginTop: 0 }}>{new Date(day).toLocaleDateString()}</h4>
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                          {grouped[day].map(({ type, name, task }) => (
                            <li key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '1em', marginBottom: '0.5em', background: '#f8f8f8', borderRadius: '6px', boxShadow: '0 1px 4px #0001', padding: '0.5em 1em' }}>
                              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{name} {type === 'vs' ? '(Value Stream)' : '(Initiative)'}</span>
                              <span style={{ textDecoration: task.done ? 'line-through' : 'none', flex: 1 }}>{task.content}</span>
                              <span style={{ color: '#888', fontSize: '0.9em' }}>{new Date(task.created).toLocaleTimeString()}</span>
                              {task.done && task.closeComment && (
                                <button
                                  style={{ marginLeft: '0.5em', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                                  title="View closure comment"
                                  onClick={() => setViewClosureModal({ comment: task.closeComment!, date: task.closeDate || '' })}
                                >
                                  💬
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                );
              })()}
            </section>
          )}
        </main>
        {viewClosureModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', padding: '2rem', borderRadius: '10px', minWidth: '320px', maxWidth: '90vw', boxShadow: '0 2px 16px #0004', textAlign: 'center' }}>
              <h3>Closure Comment</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: '1.5em 0', color: '#222' }}>{viewClosureModal.comment}</p>
              {viewClosureModal.date && <div style={{ color: '#888', fontSize: '0.95em' }}>Closed on: {new Date(viewClosureModal.date).toLocaleString()}</div>}
              <div style={{ marginTop: '2em' }}>
                <button onClick={() => setViewClosureModal(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
