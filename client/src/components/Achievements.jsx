export default function Achievements({ achievements }) {
  const unlocked = achievements.filter((a) => a.unlocked).length;
  return (
    <section className="achievements card">
      <h2>Achievements <span className="muted small">{unlocked}/{achievements.length}</span></h2>
      <ul className="badge-grid">
        {achievements.map((a) => (
          <li key={a.key} className={a.unlocked ? 'badge unlocked' : 'badge'} title={a.description}>
            <span className="badge-icon" aria-hidden>{a.unlocked ? a.icon : '🔒'}</span>
            <span className="badge-name">{a.name}</span>
            <span className="badge-desc">{a.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
