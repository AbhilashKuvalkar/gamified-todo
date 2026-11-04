'use strict';

// Uses Node's built-in SQLite driver (node:sqlite, Node >= 22.13).
// No native npm modules -> nothing to compile on the Windows/IIS server.
const fs = require('fs');
const path = require('path');

// Silence only the "SQLite is experimental" warning so it doesn't spam the service logs.
const originalEmit = process.emit;
process.emit = function (name, data, ...args) {
  if (name === 'warning' && data && data.name === 'ExperimentalWarning' && /SQLite/i.test(data.message)) {
    return false;
  }
  return originalEmit.call(process, name, data, ...args);
};

const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'todo.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS todos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    difficulty    TEXT    NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
    due_date      TEXT,
    completed     INTEGER NOT NULL DEFAULT 0,
    completed_at  TEXT,
    xp_awarded    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profile (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    xp                   INTEGER NOT NULL DEFAULT 0,
    total_completed      INTEGER NOT NULL DEFAULT 0,
    hard_completed       INTEGER NOT NULL DEFAULT 0,
    current_streak       INTEGER NOT NULL DEFAULT 0,
    longest_streak       INTEGER NOT NULL DEFAULT 0,
    last_completed_date  TEXT
  );

  CREATE TABLE IF NOT EXISTS achievements (
    key          TEXT PRIMARY KEY,
    unlocked_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO profile (id) VALUES (1);
`);

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, transaction, DB_PATH };
