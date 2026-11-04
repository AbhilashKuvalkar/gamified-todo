import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import PlayerCard from './components/PlayerCard.jsx';
import AddTodo from './components/AddTodo.jsx';
import TodoItem from './components/TodoItem.jsx';
import Achievements from './components/Achievements.jsx';
import Toasts from './components/Toasts.jsx';

const FILTERS = { active: 'Active', done: 'Completed', all: 'All' };

export default function App() {
  const [todos, setTodos] = useState([]);
  const [profile, setProfile] = useState(null);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, kind = 'info') => {
    const id = crypto.randomUUID?.() ?? String(Math.random());
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const fail = useCallback((err) => toast(err.message || 'Something went wrong', 'error'), [toast]);

  useEffect(() => {
    Promise.all([api.getTodos(), api.getProfile()])
      .then(([t, p]) => { setTodos(t); setProfile(p); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const replace = (todo) => setTodos((list) => list.map((t) => (t.id === todo.id ? todo : t)));

  const handleAdd = async (draft) => {
    try {
      const created = await api.addTodo(draft);
      setTodos((list) => [created, ...list]);
      return true;
    } catch (err) { fail(err); return false; }
  };

  const handleToggle = async (todo) => {
    try {
      if (todo.completed) {
        const res = await api.uncomplete(todo.id);
        replace(res.todo); setProfile(res.profile);
        toast(`−${res.xpLost} XP · quest reopened`, 'muted');
      } else {
        const res = await api.complete(todo.id);
        replace(res.todo); setProfile(res.profile);
        toast(`+${res.xpGained} XP`, 'xp');
        if (res.leveledUp) toast(`🎉 Level up! You are now level ${res.profile.level} · ${res.profile.title}`, 'level');
        res.newAchievements.forEach((a) => toast(`${a.icon} Achievement unlocked: ${a.name}`, 'achievement'));
      }
    } catch (err) { fail(err); }
  };

  const handleRename = async (todo, title) => {
    try { replace(await api.updateTodo(todo.id, { title })); } catch (err) { fail(err); }
  };

  const handleDelete = async (todo) => {
    try {
      await api.deleteTodo(todo.id);
      setTodos((list) => list.filter((t) => t.id !== todo.id));
    } catch (err) { fail(err); }
  };

  const visible = useMemo(() => todos.filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.completed : !t.completed), [todos, filter]);

  const counts = useMemo(() => ({
    active: todos.filter((t) => !t.completed).length,
    done: todos.filter((t) => t.completed).length,
    all: todos.length,
  }), [todos]);

  if (loading) return <div className="center muted">Loading your quest log…</div>;
  if (error) return (
    <div className="center">
      <p className="error-box">Couldn't reach the server: {error}</p>
    </div>
  );

  return (
    <div className="app">
      <header className="masthead">
        <h1><span aria-hidden>⚔️</span> Quest Log</h1>
        <p className="muted">Turn your to-dos into XP.</p>
      </header>

      <PlayerCard profile={profile} />

      <main className="board">
        <AddTodo onAdd={handleAdd} />

        <div className="tabs" role="tablist">
          {Object.entries(FILTERS).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={filter === key}
              className={filter === key ? 'tab active' : 'tab'} onClick={() => setFilter(key)}>
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="empty">
            {filter === 'active' ? 'No open quests. Add one above and earn some XP!' : 'Nothing here yet.'}
          </p>
        ) : (
          <ul className="todo-list">
            {visible.map((t) => (
              <TodoItem key={t.id} todo={t} onToggle={handleToggle} onRename={handleRename} onDelete={handleDelete} />
            ))}
          </ul>
        )}
      </main>

      <Achievements achievements={profile.achievements} />
      <Toasts toasts={toasts} />
    </div>
  );
}
