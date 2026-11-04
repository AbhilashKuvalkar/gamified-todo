import { useState } from 'react';

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

export default function TodoItem({ todo, onToggle, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const overdue = !todo.completed && todo.dueDate && todo.dueDate < todayStr();

  const save = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== todo.title) onRename(todo, t); else setDraft(todo.title);
  };

  return (
    <li className={`todo ${todo.completed ? 'completed' : ''}`}>
      <button className="check" onClick={() => onToggle(todo)}
        aria-label={todo.completed ? 'Mark as not done' : 'Mark as done'}>
        {todo.completed ? '✓' : ''}
      </button>

      <div className="todo-body">
        {editing ? (
          <input className="edit-input" autoFocus value={draft} maxLength={200}
            onChange={(e) => setDraft(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(todo.title); setEditing(false); } }} />
        ) : (
          <span className="todo-title" onDoubleClick={() => !todo.completed && setEditing(true)}
            title={todo.completed ? '' : 'Double-click to edit'}>{todo.title}</span>
        )}
        <div className="meta">
          <span className={`tag ${todo.difficulty}`}>{todo.difficulty}</span>
          {todo.dueDate && <span className={overdue ? 'due overdue' : 'due'}>📅 {todo.dueDate}{overdue ? ' · overdue' : ''}</span>}
          {todo.completed && <span className="earned">+{todo.xpAwarded} XP</span>}
        </div>
      </div>

      <button className="icon-btn" onClick={() => onDelete(todo)} aria-label="Delete task" title="Delete">✕</button>
    </li>
  );
}
