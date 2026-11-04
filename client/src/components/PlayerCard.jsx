export default function PlayerCard({ profile }) {
  const p = profile;
  return (
    <section className="player card" aria-label="Player stats">
      <div className="level-badge" title={`Level ${p.level}`}>
        <span className="level-num">{p.level}</span>
        <span className="level-label">LVL</span>
      </div>
      <div className="player-main">
        <div className="player-title">
          <strong>{p.title}</strong>
          <span className="muted">{p.xp} XP total</span>
        </div>
        <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.progress}>
          <div className="xp-fill" style={{ width: `${p.progress}%` }} />
        </div>
        <div className="muted small">{p.xpIntoLevel} / {p.xpForNextLevel} XP to level {p.level + 1}</div>
      </div>
      <dl className="stats">
        <div><dt>Streak</dt><dd>{p.currentStreak > 0 ? '🔥' : '🌑'} {p.currentStreak}d</dd></div>
        <div><dt>Best</dt><dd>{p.longestStreak}d</dd></div>
        <div><dt>Done</dt><dd>{p.totalCompleted}</dd></div>
      </dl>
    </section>
  );
}
