export function sameOriginWrite(
  request: Request,
  url: URL,
  multipart = false,
): boolean {
  const type = request.headers.get('content-type')?.split(';')[0].trim();
  return (
    request.headers.get('origin') === url.origin &&
    request.headers.get('sec-fetch-site') !== 'cross-site' &&
    type ===
      (multipart ? 'multipart/form-data' : 'application/x-www-form-urlencoded')
  );
}

export async function limitedForm(
  request: Request,
  limit: number,
): Promise<FormData> {
  if (Number(request.headers.get('content-length')) > limit)
    throw new Error('This form is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing form.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error('This form is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new Response(body, {
    headers: { 'content-type': request.headers.get('content-type')! },
  }).formData();
}

export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== 'string') throw new Error(`Missing ${name}.`);
  return value.trim();
}
export function formInteger(data: FormData, name: string, minimum = 0): number {
  const text = formText(data, name);
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < minimum)
    throw new Error(`Invalid ${name}.`);
  return number;
}
export function validRequestId(id: string) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id))
    throw new Error('Invalid save request.');
}
