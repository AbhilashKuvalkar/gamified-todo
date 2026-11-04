'use strict';

const BASE_XP = { easy: 10, medium: 25, hard: 50 };

// Cumulative XP needed to reach a level: L1=0, L2=100, L3=300, L4=600, L5=1000 ...
const xpForLevel = (level) => 50 * level * (level - 1);

function levelInfo(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: levelTitle(level),
    xpIntoLevel: xp - floor,
    xpForNextLevel: next - floor,
    progress: Math.round(((xp - floor) / (next - floor)) * 100),
  };
}

function levelTitle(level) {
  if (level >= 15) return 'Legend';
  if (level >= 10) return 'Grandmaster';
  if (level >= 7) return 'Champion';
  if (level >= 5) return 'Achiever';
  if (level >= 3) return 'Apprentice';
  return 'Rookie';
}

// Streak bonus: +10% per consecutive day after the first, capped at +50%.
function xpForCompletion(difficulty, streak) {
  const base = BASE_XP[difficulty] ?? BASE_XP.medium;
  const multiplier = 1 + Math.min(Math.max(streak - 1, 0), 5) * 0.1;
  return Math.round(base * multiplier);
}

const ACHIEVEMENTS = [
  { key: 'first_blood',   icon: '🎯', name: 'First Step',      description: 'Complete your first task',          test: (p) => p.total_completed >= 1 },
  { key: 'ten_down',      icon: '🔟', name: 'Getting Things Done', description: 'Complete 10 tasks',             test: (p) => p.total_completed >= 10 },
  { key: 'fifty_down',    icon: '🏆', name: 'Productivity Machine', description: 'Complete 50 tasks',            test: (p) => p.total_completed >= 50 },
  { key: 'hard_five',     icon: '💪', name: 'Boss Slayer',     description: 'Complete 5 hard tasks',             test: (p) => p.hard_completed >= 5 },
  { key: 'streak_3',      icon: '🔥', name: 'On Fire',         description: 'Keep a 3-day streak',               test: (p) => p.current_streak >= 3 },
  { key: 'streak_7',      icon: '⚡', name: 'Unstoppable',     description: 'Keep a 7-day streak',               test: (p) => p.current_streak >= 7 },
  { key: 'level_5',       icon: '⭐', name: 'Rising Star',     description: 'Reach level 5',                     test: (p) => levelInfo(p.xp).level >= 5 },
  { key: 'clean_sweep',   icon: '🧹', name: 'Clean Sweep',     description: 'Clear a board of 5+ tasks',         test: (p, ctx) => ctx.boardCleared },
];

// Local calendar date (server time zone) as YYYY-MM-DD
function today(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

module.exports = { BASE_XP, levelInfo, xpForCompletion, ACHIEVEMENTS, today, daysBetween };
