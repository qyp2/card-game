/**
 * Shown instead of the board when the viewport cannot hold a landscape table.
 *
 * The board is a table: it needs width. Rather than squeeze a 5/7 card into a
 * portrait window until the rules text is unreadable, the client says so
 * plainly and tells the player what to do about it.
 */
export default function RotateGate() {
  return (
    <div className="rotate-gate" role="status">
      <div className="rotate-gate-card">
        <p className="rotate-gate-eyebrow">Landscape required</p>
        <h1>Turn your device sideways</h1>
        <p>
          The table needs a landscape screen. Rotate your device, or widen this window past
          900&nbsp;px wide and 520&nbsp;px tall.
        </p>
      </div>
    </div>
  );
}
