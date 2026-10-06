import { describe, expect, it } from 'vitest';
import { fetchPublicPage, isPublicAddress, UnsafeUrlError } from './safe-fetch';

describe('isPublicAddress', () => {
  it('rejects loopback, private, link-local and reserved ranges', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('accepts ordinary public addresses', () => {
    for (const address of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '203.150.1.1', '2606:4700:4700::1111']) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('rejects anything that is not an address', () => {
    expect(isPublicAddress('localhost')).toBe(false);
  });
});

describe('fetchPublicPage', () => {
  it('refuses unsafe links before making any request', async () => {
    for (const link of ['file:///etc/passwd', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'https://user:pw@example.com/', 'https://example.com:8443/', 'nope']) {
      await expect(fetchPublicPage(link), link).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });
});
