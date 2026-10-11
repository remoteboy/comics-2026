import type { RuntimeEnvironment } from '@/platform/runtime-env-types';

export function runtimeEnvironment(): RuntimeEnvironment {
  return import.meta.env;
}
