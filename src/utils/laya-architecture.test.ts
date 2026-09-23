// @vitest-environment node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('has no misleading server-side Laya loopback proxy in the deployed app', () => {
  expect(existsSync(resolve('src/app/api/laya/score/route.ts'))).toBe(false);
});
