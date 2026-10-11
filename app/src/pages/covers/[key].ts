import type { APIRoute } from 'astro';

import { coverResponse } from '@/covers/runtime';

export const GET: APIRoute = async ({ params }) => coverResponse(params.key);
