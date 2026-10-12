import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { metadataFromForm } from '@/features/collection/metadata-edit';
import { limitedForm, sameOriginWrite } from '@/features/collection/write-form';
import { validateCover } from '@/covers/upload';

const data = () => {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    requestId: crypto.randomUUID(),
    expectedVersion: '0',
    variantName: 'Regular',
    storyTitle: '',
    firstAppearanceOf: '',
    details: '',
    publisherName: '',
    coverPrice: '3.99',
  }))
    form.set(name, value);
  form.append('creatorName', 'Jane Writer');
  form.append('creatorRole', 'writer');
  form.append('creatorName', '');
  form.append('creatorRole', '');
  return form;
};
describe('collection edit forms and cover validation', () => {
  it('parses creator rows and optional values without exposing catalogue IDs', () => {
    expect(metadataFromForm(data(), 1)).toMatchObject({
      coverPriceCents: 399,
      publisherName: null,
      credits: [{ name: 'Jane Writer', role: 'writer' }],
    });
    const invalid = data();
    invalid.set('coverPrice', '-2');
    expect(() => metadataFromForm(invalid, 1)).toThrow('Cover price');
    invalid.set('coverPrice', '0');
    invalid.delete('creatorRole');
    expect(() => metadataFromForm(invalid, 1)).toThrow('creator');
  });
  it('checks same-origin and content type for both edit form kinds', () => {
    const url = new URL('https://comics.example/comics/1/edit');
    const request = (origin: string, type: string) =>
      new Request(url, {
        method: 'POST',
        headers: { origin, 'content-type': type },
        body: 'x=1',
      });
    expect(
      sameOriginWrite(
        request(url.origin, 'multipart/form-data; boundary=test'),
        url,
        true,
      ),
    ).toBe(true);
    expect(
      sameOriginWrite(
        request('https://other.example', 'multipart/form-data'),
        url,
        true,
      ),
    ).toBe(false);
    expect(
      sameOriginWrite(
        request(url.origin, 'application/x-www-form-urlencoded'),
        url,
      ),
    ).toBe(true);
    expect(sameOriginWrite(request(url.origin, 'application/json'), url)).toBe(
      false,
    );
  });
  it('bounds the body even when content length is absent or misleading', async () => {
    const req = new Request('https://comics.example', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=Jane',
    });
    expect((await limitedForm(req, 100)).get('name')).toBe('Jane');
    const oversized = new Request('https://comics.example', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=' + 'x'.repeat(100),
    });
    await expect(limitedForm(oversized, 20)).rejects.toThrow('too large');
  });
  it('identifies a PNG from bytes, not its name or claimed MIME type', async () => {
    const bytes = readFileSync(
      new URL('../fixtures/covers/tiny.png', import.meta.url),
    );
    const cover = await validateCover(
      new File([bytes], 'wrong.jpg', { type: 'text/html' }),
    );
    expect(cover).toMatchObject({ extension: 'png', contentType: 'image/png' });
    expect(cover.digest).toMatch(/^[a-f0-9]{64}$/);
  });
  it('accepts each supported image encoding and rejects truncated PNG/GIF files', async () => {
    for (const extension of ['png', 'jpg', 'gif', 'webp']) {
      const bytes = readFileSync(
        new URL(`../fixtures/covers/tiny.${extension}`, import.meta.url),
      );
      expect(
        (await validateCover(new File([bytes], `tiny.${extension}`))).extension,
      ).toBe(extension);
      if (extension === 'png' || extension === 'gif')
        await expect(
          validateCover(
            new File(
              [bytes.subarray(0, bytes.length - 1)],
              `broken.${extension}`,
            ),
          ),
        ).rejects.toThrow('incomplete');
    }
  });

  it('rejects active content, empty files, oversized files and invalid image dimensions', async () => {
    for (const file of [
      new File(['<svg onload="alert(1)"></svg>'], 'cover.svg'),
      new File(['<html>fake</html>'], 'cover.jpg', { type: 'image/jpeg' }),
      new File([], 'empty.png'),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg'),
    ])
      await expect(validateCover(file)).rejects.toThrow();
    const bytes = readFileSync(
      new URL('../fixtures/covers/tiny.png', import.meta.url),
    );
    bytes.writeUInt32BE(99999, 16);
    await expect(validateCover(new File([bytes], 'huge.png'))).rejects.toThrow(
      'dimensions',
    );
  });
});
