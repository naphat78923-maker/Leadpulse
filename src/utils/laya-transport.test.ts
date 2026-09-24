import { afterEach, describe, expect, it, vi } from 'vitest';
import { layaEndpoint, requestLocalLaya } from './laya-transport';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('layaEndpoint', () => {
  it.each([
    ['http://127.0.0.1', 'http://127.0.0.1'],
    ['http://127.0.0.1/', 'http://127.0.0.1'],
    ['http://127.0.0.1:1/', 'http://127.0.0.1:1'],
    ['http://127.0.0.1:80', 'http://127.0.0.1:80'],
    ['http://127.0.0.1:65535/', 'http://127.0.0.1:65535'],
  ])('accepts only an explicit loopback origin: %s', (input, expected) => {
    vi.stubEnv('NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL', input);
    expect(layaEndpoint()).toBe(expected);
  });

  it.each([
    '', ' http://127.0.0.1', 'http://127.0.0.1\n', 'HTTP://127.0.0.1',
    'https://127.0.0.1:8765', 'http://localhost:8765', 'http://[::1]:8765',
    'http://192.168.1.2:8765', 'http://10.0.0.1', 'https://example.com',
    'http://127.0.0.1.evil.test', 'http://127.0.0.2', 'http://127.1',
    'http://2130706433', 'http://0x7f000001', 'http://127.000.000.001',
    'http://user@127.0.0.1', 'http://user:pass@127.0.0.1',
    'http://127.0.0.1/path', 'http://127.0.0.1//', 'http://127.0.0.1/..',
    'http://127.0.0.1?', 'http://127.0.0.1/#', 'http://127.0.0.1?x=1',
    'http://127.0.0.1#fragment', 'http://127.0.0.1:', 'http://127.0.0.1:0',
    'http://127.0.0.1:01', 'http://127.0.0.1:65536', 'http://127.0.0.1:-1',
    'http://127.0.0.1:8765\\\\evil.test',
  ])('rejects a noncanonical or nonlocal endpoint: %j', input => {
    vi.stubEnv('NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL', input);
    expect(() => layaEndpoint()).toThrow(/NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL.*http:\/\/127\.0\.0\.1/);
  });

  it('defaults to the explicit IPv4 worker on this device', () => {
    vi.stubEnv('NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL', undefined);
    expect(layaEndpoint()).toBe('http://127.0.0.1:8765');
  });
  it('pins private phone access to the one HTTPS Tailscale host', () => {
    expect(layaEndpoint('tailnet')).toBe('https://phats-macbook-air.tailc9beb9.ts.net');
    expect(() => layaEndpoint('https://evil.example' as never)).toThrow(/Unsupported Laya connection/);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function mockFetch(payload: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(payload),
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('requestLocalLaya', () => {
  it.each([200, 503])('distinguishes invalid JSON in HTTP %i from network failure', async status => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response('not JSON', { status }));
    vi.stubGlobal('fetch', fetcher);
    const parent = new AbortController();
    const add = vi.spyOn(parent.signal, 'addEventListener');
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const result = requestLocalLaya('/health', { signal: parent.signal });
    await expect(result).rejects.toThrow(/local Laya.*invalid JSON/i);
    await expect(result).rejects.not.toThrow(/cannot reach/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['sync', 'async'] as const)('explains %s network failures without claiming the worker stopped or retrying', async mode => {
    vi.useFakeTimers();
    const fetcher = mockFetch({});
    const error = new TypeError('Failed to fetch');
    if (mode === 'sync') fetcher.mockImplementation(() => { throw error; });
    else fetcher.mockRejectedValue(error);
    const parent = new AbortController();
    const add = vi.spyOn(parent.signal, 'addEventListener');
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const result = requestLocalLaya('/health', { signal: parent.signal });
    await expect(result).rejects.toThrow(/cannot reach Laya.*Mac worker.*Tailscale.*browser network permissions/i);
    await expect(result).rejects.not.toThrow(/stopped|not running/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an already-aborted caller with AbortError before fetch or timers', async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    parent.abort(new Error('custom parent reason'));
    const fetcher = mockFetch({});
    const add = vi.spyOn(parent.signal, 'addEventListener');
    await expect(requestLocalLaya('/health', { signal: parent.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['fetch', 'resolve'], ['fetch', 'reject'], ['body', 'resolve'], ['body', 'reject'],
  ] as const)('immediately cancels pending %s despite ignored abort and late %s', async (stage, late) => {
    vi.useFakeTimers();
    const pending = deferred<unknown>();
    const response = { ok: true, status: 200, json: vi.fn().mockResolvedValue({}) };
    const fetcher = vi.fn().mockImplementation(() => pending.promise);
    if (stage === 'body') {
      response.json.mockImplementation(() => pending.promise);
      fetcher.mockResolvedValue(response);
    }
    vi.stubGlobal('fetch', fetcher);
    const parent = new AbortController();
    const add = vi.spyOn(parent.signal, 'addEventListener');
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const rejected = vi.fn();
    const fulfilled = vi.fn();
    const result = requestLocalLaya('/score', { signal: parent.signal }).then(fulfilled, rejected);
    await vi.advanceTimersByTimeAsync(0);
    parent.abort('custom reason');
    await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'AbortError' }));
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
    if (late === 'resolve') pending.resolve(stage === 'fetch' ? response : { late: true });
    else pending.reject(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(60000);
    await result;
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(fulfilled).not.toHaveBeenCalled();
    if (stage === 'fetch') expect(response.json).not.toHaveBeenCalled();
  });

  it.each([
    ['/health', 5000, 'fetch', 'resolve'], ['/health', 5000, 'fetch', 'reject'],
    ['/score', 30000, 'fetch', 'resolve'], ['/score', 30000, 'fetch', 'reject'],
    ['/health', 5000, 'body', 'resolve'], ['/health', 5000, 'body', 'reject'],
    ['/score', 30000, 'body', 'resolve'], ['/score', 30000, 'body', 'reject'],
  ] as const)('bounds %s at %i ms including %s despite ignored abort and late %s', async (path, deadline, stage, late) => {
    vi.useFakeTimers();
    const pending = deferred<unknown>();
    const response = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ ready: true }) };
    const fetcher = vi.fn().mockImplementation(() => pending.promise);
    if (stage === 'body') {
      response.json.mockImplementation(() => pending.promise);
      // Fetch spends part of the same deadline before the body starts.
      fetcher.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(response), 1000)));
    }
    vi.stubGlobal('fetch', fetcher);
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const fulfilled = vi.fn();
    const rejected = vi.fn();
    const result = requestLocalLaya(path, { signal: parent.signal }).then(fulfilled, rejected);
    await vi.advanceTimersByTimeAsync(deadline - 1);
    expect(rejected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(rejected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      name: 'TimeoutError', message: expect.stringMatching(/timed out.*(?:5|30).*check.*worker/i),
    }));
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    if (late === 'resolve') pending.resolve(stage === 'fetch' ? response : { late: true });
    else pending.reject(new Error('late transport failure'));
    await vi.advanceTimersByTimeAsync(60000);
    await result;
    expect(fulfilled).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (stage === 'fetch') expect(response.json).not.toHaveBeenCalled();
  });

  it.each(['/health', '/score'] as const)('sends %s only to the validated local origin without credentials, caches, or redirects', async path => {
    vi.stubEnv('NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL', 'http://127.0.0.1:9000/');
    const payload = { status: 'ready' };
    const fetcher = mockFetch(payload);
    const parent = new AbortController();
    await expect(requestLocalLaya(path, { signal: parent.signal, body: '{"state":"test"}' }))
      .resolves.toEqual({ ok: true, status: 200, payload });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:9000' + path, {
      method: path === '/health' ? 'GET' : 'POST',
      ...(path === '/score' ? { headers: { 'Content-Type': 'application/json' }, body: '{"state":"test"}' } : {}),
      signal: expect.any(AbortSignal), credentials: 'omit', cache: 'no-store', redirect: 'error',
    });
  });

  it('sends private phone requests only to the pinned HTTPS host without credentials or redirects', async () => {
    const fetcher = mockFetch({ status: 'ready' });
    await requestLocalLaya('/health', { signal: new AbortController().signal, connection: 'tailnet' });
    expect(fetcher).toHaveBeenCalledWith('https://phats-macbook-air.tailc9beb9.ts.net/health',
      expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error' }));
  });

  it('rejects a remote environment value before fetching', async () => {
    vi.stubEnv('NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL', 'https://example.com');
    const fetcher = mockFetch({});
    await expect(requestLocalLaya('/score', { signal: new AbortController().signal, body: 'private' }))
      .rejects.toThrow(/NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns HTTP refusal payloads unchanged without retrying', async () => {
    const payload = { error: 'input_too_long', reason: 'Refused' };
    const fetcher = mockFetch(payload, 422);
    await expect(requestLocalLaya('/score', { signal: new AbortController().signal }))
      .resolves.toEqual({ ok: false, status: 422, payload });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
