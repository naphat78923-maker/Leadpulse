export function layaEndpoint(): string {
  const endpoint = process.env.NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL ?? 'http://127.0.0.1:8765';
  // Check the literal spelling before URL parsing can normalize unsafe aliases.
  const match = /^http:\/\/127\.0\.0\.1(?::([1-9]\d{0,4}))?\/?$/.exec(endpoint);
  if (!match || match[0] !== endpoint || (match[1] && Number(match[1]) > 65535)) {
    throw new Error('NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL must be http://127.0.0.1 with an optional port (1–65535) and trailing slash; no credentials, path, query, or fragment.');
  }
  return endpoint.replace(/\/$/, '');
}

export async function requestLocalLaya(
  path: '/health' | '/score',
  options: { signal: AbortSignal; body?: string },
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  if (options.signal.aborted) throw new DOMException('Local Laya request cancelled.', 'AbortError');
  const endpoint = layaEndpoint();
  const controller = new AbortController();
  const deadline = path === '/health' ? 5000 : 30000;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown, abort = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
      if (abort) controller.abort();
    };
    const onAbort = () => fail(new DOMException('Local Laya request cancelled.', 'AbortError'), true);
    const timer = setTimeout(() => {
      const error = new Error(`Local Laya ${path === '/health' ? 'health check' : 'scoring'} timed out after ${deadline / 1000} seconds. Check the local worker and browser local-network permissions, then try again.`);
      error.name = 'TimeoutError';
      fail(error, true);
    }, deadline);
    options.signal.addEventListener('abort', onAbort, { once: true });

    // Own settlement rather than relying on fetch/body implementations honoring abort.
    void (async () => {
      try {
        const response = await fetch(endpoint + path, {
          method: path === '/health' ? 'GET' : 'POST',
          ...(path === '/score' ? { headers: { 'Content-Type': 'application/json' }, body: options.body } : {}),
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
        });
        if (settled) return;
        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error) {
          if (error instanceof SyntaxError) {
            fail(new Error('Local Laya returned invalid JSON. Check the local worker response and try again.'));
            return;
          }
          throw error;
        }
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ ok: response.ok, status: response.status, payload });
      } catch {
        fail(new Error('Cannot reach local Laya on this device. Check the local worker and browser local-network permissions, then try again.'));
      }
    })();
  });
}
