import { useState } from 'react';

const LEVELS = [
  { key: 'easy', label: 'Easy', xp: 10 },
  { key: 'medium', label: 'Medium', xp: 25 },
  { key: 'hard', label: 'Hard', xp: 50 },
];

export default function AddTodo({ onAdd }) {
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd({ title: title.trim(), difficulty, dueDate: dueDate || null });
    setBusy(false);
    if (ok) { setTitle(''); setDueDate(''); }
  };

  return (
    <form className="add-form card" onSubmit={submit}>
      <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="What's your next quest?" maxLength={200} aria-label="Task title" />
      <div className="add-row">
        <div className="difficulty-picker" role="radiogroup" aria-label="Difficulty">
          {LEVELS.map((l) => (
            <button type="button" key={l.key} role="radio" aria-checked={difficulty === l.key}
              className={`pill ${l.key} ${difficulty === l.key ? 'selected' : ''}`}
              onClick={() => setDifficulty(l.key)}>
              {l.label} <small>+{l.xp}</small>
            </button>
          ))}
        </div>
        <input type="date" className="date-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        <button className="primary" type="submit" disabled={!title.trim() || busy}>Add quest</button>
      </div>
    </form>
  );
}
