import { coverPlaceholder } from '@/covers/placeholder';

export async function coverResponse(_key?: string): Promise<Response> {
  return coverPlaceholder();
}
