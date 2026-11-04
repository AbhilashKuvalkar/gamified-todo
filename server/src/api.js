'use strict';

const express = require('express');
const { db, transaction } = require('./db');
const { levelInfo, xpForCompletion, ACHIEVEMENTS, today, daysBetween } = require('./gamification');

const router = express.Router();
const DIFFICULTIES = ['easy', 'medium', 'hard'];

const q = {
  allTodos:     db.prepare('SELECT * FROM todos ORDER BY completed ASC, created_at DESC, id DESC'),
  todoById:     db.prepare('SELECT * FROM todos WHERE id = ?'),
  insertTodo:   db.prepare('INSERT INTO todos (title, difficulty, due_date) VALUES (?, ?, ?)'),
  updateTodo:   db.prepare('UPDATE todos SET title = ?, difficulty = ?, due_date = ? WHERE id = ?'),
  deleteTodo:   db.prepare('DELETE FROM todos WHERE id = ?'),
  completeTodo: db.prepare("UPDATE todos SET completed = 1, completed_at = datetime('now'), xp_awarded = ? WHERE id = ?"),
  reopenTodo:   db.prepare('UPDATE todos SET completed = 0, completed_at = NULL, xp_awarded = 0 WHERE id = ?'),
  boardCounts:  db.prepare('SELECT COUNT(*) AS total, SUM(completed) AS done FROM todos'),
  profile:      db.prepare('SELECT * FROM profile WHERE id = 1'),
  saveProfile:  db.prepare(`UPDATE profile SET xp = ?, total_completed = ?, hard_completed = ?,
                            current_streak = ?, longest_streak = ?, last_completed_date = ? WHERE id = 1`),
  unlocked:     db.prepare('SELECT key, unlocked_at FROM achievements'),
  unlock:       db.prepare('INSERT OR IGNORE INTO achievements (key) VALUES (?)'),
};

const toTodo = (row) => row && ({
  id: row.id,
  title: row.title,
  difficulty: row.difficulty,
  dueDate: row.due_date,
  completed: !!row.completed,
  completedAt: row.completed_at,
  xpAwarded: row.xp_awarded,
  createdAt: row.created_at,
});

// Streak is "alive" if the last completion was today or yesterday.
function effectiveStreak(p) {
  if (!p.last_completed_date) return 0;
  return daysBetween(p.last_completed_date, today()) <= 1 ? p.current_streak : 0;
}

function buildProfile() {
  const p = q.profile.get();
  const unlocked = new Map(q.unlocked.all().map((r) => [r.key, r.unlocked_at]));
  return {
    xp: p.xp,
    ...levelInfo(p.xp),
    totalCompleted: p.total_completed,
    hardCompleted: p.hard_completed,
    currentStreak: effectiveStreak(p),
    longestStreak: p.longest_streak,
    lastCompletedDate: p.last_completed_date,
    achievements: ACHIEVEMENTS.map(({ key, icon, name, description }) => ({
      key, icon, name, description,
      unlocked: unlocked.has(key),
      unlockedAt: unlocked.get(key) || null,
    })),
  };
}

function validate(body, partial = false) {
  const errors = [];
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) errors.push('title is required');
    else if (title.length > 200) errors.push('title must be 200 characters or fewer');
    out.title = title;
  }
  if (body.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(body.difficulty)) errors.push(`difficulty must be one of ${DIFFICULTIES.join(', ')}`);
    out.difficulty = body.difficulty;
  }
  if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) errors.push('dueDate must be YYYY-MM-DD');
    out.dueDate = body.dueDate;
  } else if (body.dueDate !== undefined) {
    out.dueDate = null;
  }
  return { errors, value: out };
}

const parseId = (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  return id;
};

// ---------- Routes ----------

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

router.get('/todos', (req, res) => res.json(q.allTodos.all().map(toTodo)));

router.post('/todos', (req, res) => {
  const { errors, value } = validate(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const info = q.insertTodo.run(value.title, value.difficulty || 'medium', value.dueDate ?? null);
  res.status(201).json(toTodo(q.todoById.get(info.lastInsertRowid)));
});

router.patch('/todos/:id', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const existing = q.todoById.get(id);
  if (!existing) return res.status(404).json({ error: 'Todo not found' });
  const { errors, value } = validate(req.body || {}, true);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  q.updateTodo.run(
    value.title ?? existing.title,
    existing.completed ? existing.difficulty : (value.difficulty ?? existing.difficulty), // lock difficulty once XP is awarded
    value.dueDate !== undefined ? value.dueDate : existing.due_date,
    id,
  );
  res.json(toTodo(q.todoById.get(id)));
});

router.delete('/todos/:id', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const info = q.deleteTodo.run(id);
  if (!info.changes) return res.status(404).json({ error: 'Todo not found' });
  res.status(204).end();
});

router.post('/todos/:id/complete', (req, res) => {
  const id = parseId(req, res); if (id === null) return;

  const result = transaction(() => {
    const todo = q.todoById.get(id);
    if (!todo) return { status: 404 };
    if (todo.completed) return { status: 409 };

    const p = q.profile.get();
    const levelBefore = levelInfo(p.xp).level;
    const date = today();

    let streak;
    if (!p.last_completed_date) streak = 1;
    else {
      const gap = daysBetween(p.last_completed_date, date);
      streak = gap === 0 ? Math.max(p.current_streak, 1) : gap === 1 ? p.current_streak + 1 : 1;
    }

    const xpGained = xpForCompletion(todo.difficulty, streak);
    const updated = {
      xp: p.xp + xpGained,
      total_completed: p.total_completed + 1,
      hard_completed: p.hard_completed + (todo.difficulty === 'hard' ? 1 : 0),
      current_streak: streak,
      longest_streak: Math.max(p.longest_streak, streak),
      last_completed_date: date,
    };

    q.completeTodo.run(xpGained, id);
    q.saveProfile.run(updated.xp, updated.total_completed, updated.hard_completed,
      updated.current_streak, updated.longest_streak, updated.last_completed_date);

    const counts = q.boardCounts.get();
    const ctx = { boardCleared: counts.total >= 5 && counts.done === counts.total };
    const already = new Set(q.unlocked.all().map((r) => r.key));
    const newAchievements = ACHIEVEMENTS
      .filter((a) => !already.has(a.key) && a.test(updated, ctx))
      .map(({ key, icon, name, description }) => {
        q.unlock.run(key);
        return { key, icon, name, description };
      });

    return {
      status: 200,
      body: {
        todo: toTodo(q.todoById.get(id)),
        xpGained,
        leveledUp: levelInfo(updated.xp).level > levelBefore,
        newAchievements,
        profile: buildProfile(),
      },
    };
  });

  if (result.status === 404) return res.status(404).json({ error: 'Todo not found' });
  if (result.status === 409) return res.status(409).json({ error: 'Todo already completed' });
  res.json(result.body);
});

router.post('/todos/:id/uncomplete', (req, res) => {
  const id = parseId(req, res); if (id === null) return;

  const result = transaction(() => {
    const todo = q.todoById.get(id);
    if (!todo) return { status: 404 };
    if (!todo.completed) return { status: 409 };
    const p = q.profile.get();
    // Take back exactly the XP that was awarded. Streaks and achievements are kept.
    q.saveProfile.run(
      Math.max(p.xp - todo.xp_awarded, 0),
      Math.max(p.total_completed - 1, 0),
      Math.max(p.hard_completed - (todo.difficulty === 'hard' ? 1 : 0), 0),
      p.current_streak, p.longest_streak, p.last_completed_date,
    );
    q.reopenTodo.run(id);
    return { status: 200, body: { todo: toTodo(q.todoById.get(id)), xpLost: todo.xp_awarded, profile: buildProfile() } };
  });

  if (result.status === 404) return res.status(404).json({ error: 'Todo not found' });
  if (result.status === 409) return res.status(409).json({ error: 'Todo is not completed' });
  res.json(result.body);
});

router.get('/profile', (req, res) => res.json(buildProfile()));

router.use((req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` }));

module.exports = router;
