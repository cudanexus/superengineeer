import { getLocalNetworkAddresses, formatAccessibleUrls } from '../../../src/utils/network';

// Mock os.networkInterfaces
jest.mock('os', () => ({
  networkInterfaces: jest.fn(),
}));

import { networkInterfaces } from 'os';

describe('network utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLocalNetworkAddresses', () => {
    it('should return IPv4 addresses from non-internal interfaces', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
          { address: 'fe80::1', family: 'IPv6', internal: false },
        ],
        lo: [
          { address: '127.0.0.1', family: 'IPv4', internal: true },
        ],
      });

      const addresses = getLocalNetworkAddresses();

      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toEqual({
        interface: 'eth0',
        address: '192.168.1.100',
        family: 'IPv4',
      });
    });

    it('should return empty array when no external interfaces', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({
        lo: [
          { address: '127.0.0.1', family: 'IPv4', internal: true },
        ],
      });

      const addresses = getLocalNetworkAddresses();

      expect(addresses).toHaveLength(0);
    });

    it('should handle undefined interface entries', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({
        eth0: undefined,
        eth1: [
          { address: '192.168.1.101', family: 'IPv4', internal: false },
        ],
      });

      const addresses = getLocalNetworkAddresses();

      expect(addresses).toHaveLength(1);
      expect(addresses[0]?.address).toBe('192.168.1.101');
    });

    it('should return multiple addresses from different interfaces', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
        ],
        wlan0: [
          { address: '192.168.1.200', family: 'IPv4', internal: false },
        ],
      });

      const addresses = getLocalNetworkAddresses();

      expect(addresses).toHaveLength(2);
    });

    it('should return empty array when no interfaces', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({});

      const addresses = getLocalNetworkAddresses();

      expect(addresses).toHaveLength(0);
    });

    it('should skip IPv6 addresses', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({
        eth0: [
          { address: 'fe80::1', family: 'IPv6', internal: false },
          { address: '2001:db8::1', family: 'IPv6', internal: false },
        ],
      });

      const addresses = getLocalNetworkAddresses();

      expect(addresses).toHaveLength(0);
    });
  });

  describe('formatAccessibleUrls', () => {
    it('should return localhost URL for 0.0.0.0 host', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({});

      const urls = formatAccessibleUrls('0.0.0.0', 3000);

      expect(urls).toContain('http://localhost:3000');
    });

    it('should return localhost URL for :: host', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({});

      const urls = formatAccessibleUrls('::', 3000);

      expect(urls).toContain('http://localhost:3000');
    });

    it('should include network addresses for 0.0.0.0 host', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
        ],
      });

      const urls = formatAccessibleUrls('0.0.0.0', 3000);

      expect(urls).toHaveLength(2);
      expect(urls).toContain('http://localhost:3000');
      expect(urls).toContain('http://192.168.1.100:3000');
    });

    it('should return only localhost URL for localhost host', () => {
      const urls = formatAccessibleUrls('localhost', 3000);

      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('http://localhost:3000');
    });

    it('should return only localhost URL for 127.0.0.1 host', () => {
      const urls = formatAccessibleUrls('127.0.0.1', 3000);

      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('http://localhost:3000');
    });

    it('should return specific host URL for custom host', () => {
      const urls = formatAccessibleUrls('192.168.1.50', 8080);

      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('http://192.168.1.50:8080');
    });

    it('should handle different port numbers', () => {
      const urls = formatAccessibleUrls('localhost', 8080);

      expect(urls[0]).toBe('http://localhost:8080');
    });
  });
});
