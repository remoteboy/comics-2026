export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export interface UploadedCover {
  bytes: Uint8Array;
  extension: 'jpg' | 'png' | 'webp' | 'gif';
  contentType: string;
  digest: string;
}
export interface CoverStorage {
  put(key: string, cover: UploadedCover): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Inspect bytes rather than trusting the filename or browser MIME label. SVG is not accepted. */
export async function validateCover(file: File): Promise<UploadedCover> {
  if (!file.size || file.size > MAX_COVER_BYTES)
    throw new Error('Choose a cover image no larger than 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  const view = new DataView(bytes.buffer);
  let extension: UploadedCover['extension'];
  let width = 0,
    height = 0;
  if (
    bytes.length >= 33 &&
    bytes
      .slice(0, 8)
      .every(
        (byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index],
      ) &&
    ascii(12, 4) === 'IHDR'
  ) {
    let offset = 8;
    let ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > bytes.length) break;
      const chunk = ascii(offset + 4, 4);
      offset += length + 12;
      if (chunk === 'IEND') {
        ended = length === 0 && offset === bytes.length;
        break;
      }
    }
    if (!ended) throw new Error('The PNG cover is incomplete or invalid.');
    extension = 'png';
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    if (bytes[bytes.length - 1] !== 59)
      throw new Error('The GIF cover is incomplete or invalid.');
    extension = 'gif';
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (
    bytes.length >= 30 &&
    ascii(0, 4) === 'RIFF' &&
    ascii(8, 4) === 'WEBP' &&
    view.getUint32(4, true) + 8 === bytes.length
  ) {
    extension = 'webp';
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (
      chunk === 'VP8 ' &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    ) {
      width = view.getUint16(26, true) & 16383;
      height = view.getUint16(28, true) & 16383;
    } else if (chunk === 'VP8L' && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height =
        1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    }
  } else if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  ) {
    extension = 'jpg';
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else throw new Error('Choose a JPEG, PNG, WebP or GIF cover image.');
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 40_000_000
  )
    throw new Error('The cover image has invalid or excessive dimensions.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const digest = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    bytes,
    extension,
    contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    digest,
  };
}
