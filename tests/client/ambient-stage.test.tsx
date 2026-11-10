import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AmbientStage from '@client/components/AmbientStage';

describe('ambient stage', () => {
  it('renders a deterministic, decorative atmosphere', () => {
    const html = renderToStaticMarkup(<AmbientStage />);

    expect(html).toContain('class="ambient-stage" aria-hidden="true"');
    expect(html.match(/class="ambient-orb /g)).toHaveLength(3);
    expect(html.match(/class="ambient-ember"/g)).toHaveLength(24);
    expect(html).toContain('--ember-left:96%');
    expect(html).toContain('--ember-delay:-8.5s');
  });
});
