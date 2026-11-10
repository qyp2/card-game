import type { CSSProperties } from 'react';

/**
 * Purely decorative, deterministic table atmosphere.
 *
 * The embers are laid out from a fixed seed rather than Math.random so SSR
 * output stays stable and no hydration mismatch is possible. Every element is
 * aria-hidden and pointer-events: none; this layer must never take a click or
 * appear in the accessibility tree.
 */
const EMBERS = Array.from({ length: 24 }, (_, index) => {
  const left = (index * 37 + 11) % 100;
  const drift = ((index * 13) % 7) - 3;
  return {
    left: `${left}%`,
    delay: `${-((index * 1.7) % 18)}s`,
    duration: `${11 + (index % 8) * 1.6}s`,
    drift: `${drift * 5}vw`,
    size: `${1 + (index % 3)}px`,
    opacity: 0.18 + (index % 5) * 0.09,
  };
});

export default function AmbientStage() {
  return (
    <div className="ambient-stage" aria-hidden="true">
      <span className="ambient-orb ambient-orb-a" />
      <span className="ambient-orb ambient-orb-b" />
      <span className="ambient-orb ambient-orb-c" />
      <div className="ambient-embers">
        {EMBERS.map((ember, index) => (
          <i
            key={index}
            className="ambient-ember"
            style={{
              '--ember-left': ember.left,
              '--ember-delay': ember.delay,
              '--ember-duration': ember.duration,
              '--ember-drift': ember.drift,
              '--ember-size': ember.size,
              '--ember-opacity': ember.opacity,
            } as CSSProperties}
          />
        ))}
      </div>
      <span className="ambient-sweep" />
      <span className="ambient-vignette" />
    </div>
  );
}
