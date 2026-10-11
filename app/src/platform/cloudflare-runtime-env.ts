// @ts-ignore -- virtual module supplied by the Cloudflare Workers runtime.
import { env } from 'cloudflare:workers';

import type { RuntimeEnvironment } from '@/platform/runtime-env-types';

export function runtimeEnvironment(): RuntimeEnvironment {
  return env as unknown as RuntimeEnvironment;
}
