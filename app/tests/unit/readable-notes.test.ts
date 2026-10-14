import { describe, expect, it } from 'vitest';
import { readableNotes } from '@/features/collection/readable-notes';
describe('readable legacy and provider notes', () => {
  it('preserves paragraph breaks, lists and decoded entities as text', () => {
    expect(
      readableNotes(
        '<p>A &amp; B</p><p><em>Second</em><br>line</p><ul><li>One</li><li>Two &#x2014; &#169;</li></ul>',
      ),
    ).toBe('A & B\n\nSecond\nline\n\n• One\n\n• Two — ©');
  });
  it('discards executable and hidden content without trusting encoded markup', () => {
    expect(
      readableNotes(
        '<p>Visible</p><script>alert(1)</script><style>bad</style><iframe>hidden</iframe><!-- secret --><img src=x onerror=bad>&lt;script&gt;literal&lt;/script&gt;',
      ),
    ).toBe(
      'Visible\n&lt;script&gt;literal&lt;/script&gt;'
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>'),
    );
    expect(readableNotes('<p>Visible</p><script>unclosed')).toBe('Visible');
  });
  it('keeps plain text and treats legacy NULL as absent', () => {
    expect(readableNotes('One\nTwo; 1 < 2 and 3 > 2')).toBe(
      'One\nTwo; 1 < 2 and 3 > 2',
    );
    expect(readableNotes('NULL')).toBeNull();
    expect(readableNotes(null)).toBeNull();
    expect(readableNotes('&#0;&#xD800;&#1114112;')).toBeNull();
  });
});
