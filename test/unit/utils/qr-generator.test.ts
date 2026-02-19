import { displayLoginCredentials, LoginDisplayOptions } from '../../../src/utils/qr-generator';
import * as qrcode from 'qrcode-terminal';
import { networkInterfaces } from 'os';

// Mock dependencies
jest.mock('qrcode-terminal');
jest.mock('os');

const mockQRCode = qrcode as jest.Mocked<typeof qrcode>;
const mockNetworkInterfaces = networkInterfaces as jest.MockedFunction<typeof networkInterfaces>;

// Mock console.log to capture output
const originalConsoleLog = console.log;
let consoleOutput: string[] = [];

describe('QR Generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleOutput = [];
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  const defaultOptions: LoginDisplayOptions = {
    host: 'localhost',
    port: 3000,
    credentials: {
      username: 'admin',
      password: 'test123',
    },
  };

  describe('displayLoginCredentials', () => {
    beforeEach(() => {
      // Mock QR code generation
      mockQRCode.generate.mockImplementation((text: string, options: any, callback?: (qr: string) => void) => {
        callback && callback('█▀▀▀▀▀█ █ ▀█  █▀▀▀▀▀█\n█ ███ █ ▀▀▀▀▀ █ ███ █\n█ ▀▀▀ █ ▄▄▄▄▄ █ ▀▀▀ █');
      });
    });

    it('should display login credentials with localhost when no LAN IP available', () => {
      mockNetworkInterfaces.mockReturnValue({});

      displayLoginCredentials(defaultOptions);

      // Check that credentials are displayed
      expect(consoleOutput.some(line => line.includes('Username:  admin'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Password:  test123'))).toBe(true);

      // Check that URL is generated correctly
      const expectedUrl = 'http://localhost:3000/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);

      // Check that QR code was generated
      expect(mockQRCode.generate).toHaveBeenCalledWith(
        expectedUrl,
        { small: true },
        expect.any(Function)
      );
    });

    it('should use LAN IP when available', () => {
      mockNetworkInterfaces.mockReturnValue({
        eth0: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
      });

      displayLoginCredentials(defaultOptions);

      const expectedUrl = 'http://192.168.1.100:3000/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);
    });

    it('should handle 0.0.0.0 host correctly', () => {
      mockNetworkInterfaces.mockReturnValue({});

      const options: LoginDisplayOptions = {
        ...defaultOptions,
        host: '0.0.0.0',
      };

      displayLoginCredentials(options);

      const expectedUrl = 'http://localhost:3000/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);
    });

    it('should handle special characters in credentials', () => {
      mockNetworkInterfaces.mockReturnValue({});

      const options: LoginDisplayOptions = {
        ...defaultOptions,
        credentials: {
          username: 'user@example.com',
          password: 'pass+with/special=chars',
        },
      };

      displayLoginCredentials(options);

      // Check URL encoding
      const expectedUrl = 'http://localhost:3000/login?u=user%40example.com&p=pass%2Bwith%2Fspecial%3Dchars';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);

      // Check that raw credentials are displayed (not encoded)
      expect(consoleOutput.some(line => line.includes('Username:  user@example.com'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Password:  pass+with/special=chars'))).toBe(true);
    });

    it('should ignore internal and non-IPv4 network interfaces', () => {
      mockNetworkInterfaces.mockReturnValue({
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true, // Internal interface should be ignored
            cidr: '127.0.0.1/8',
          },
        ],
        eth0: [
          {
            address: '2001:db8::1',
            netmask: 'ffff:ffff:ffff:ffff::',
            family: 'IPv6', // IPv6 should be ignored
            mac: '00:00:00:00:00:00',
            internal: false,
            cidr: '2001:db8::1/64',
            scopeid: 0,
          },
        ],
        eth1: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: false, // This should be used
            cidr: '192.168.1.100/24',
          },
        ],
      });

      displayLoginCredentials(defaultOptions);

      const expectedUrl = 'http://192.168.1.100:3000/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);
    });

    it('should handle empty network interfaces', () => {
      mockNetworkInterfaces.mockReturnValue({
        eth0: [], // Empty interface array
        eth1: undefined, // Undefined interface
      });

      displayLoginCredentials(defaultOptions);

      const expectedUrl = 'http://localhost:3000/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);
    });

    it('should format console output correctly', () => {
      mockNetworkInterfaces.mockReturnValue({});

      displayLoginCredentials(defaultOptions);

      // Check for visual separators
      expect(consoleOutput.some(line => line.includes('═'.repeat(60)))).toBe(true);
      expect(consoleOutput.some(line => line.includes('─'.repeat(60)))).toBe(true);

      // Check for header
      expect(consoleOutput.some(line => line.includes('🔐 LOGIN CREDENTIALS'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('📱 Scan QR code for mobile login:'))).toBe(true);
    });

    it('should use custom host when provided and no LAN IP available', () => {
      mockNetworkInterfaces.mockReturnValue({});

      const options: LoginDisplayOptions = {
        ...defaultOptions,
        host: 'example.com',
      };

      displayLoginCredentials(options);

      const expectedUrl = 'http://example.com:3000/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);
    });

    it('should handle different port numbers', () => {
      mockNetworkInterfaces.mockReturnValue({});

      const options: LoginDisplayOptions = {
        ...defaultOptions,
        port: 8080,
      };

      displayLoginCredentials(options);

      const expectedUrl = 'http://localhost:8080/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);
    });

    it('should indent QR code properly', () => {
      mockNetworkInterfaces.mockReturnValue({});

      displayLoginCredentials(defaultOptions);

      // Check that QR callback function indents the QR code
      const qrCallback = mockQRCode.generate.mock.calls[0]?.[2];
      expect(typeof qrCallback).toBe('function');
    });
  });

  describe('Network interface detection', () => {
    it('should handle undefined network interfaces gracefully', () => {
      mockNetworkInterfaces.mockReturnValue({
        eth0: undefined,
        wifi0: null as any,
      });

      expect(() => displayLoginCredentials(defaultOptions)).not.toThrow();
    });

    it('should prefer first valid IPv4 interface', () => {
      mockNetworkInterfaces.mockReturnValue({
        eth0: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
        eth1: [
          {
            address: '10.0.0.50',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:01',
            internal: false,
            cidr: '10.0.0.50/24',
          },
        ],
      });

      displayLoginCredentials(defaultOptions);

      // Should use first valid IP
      const expectedUrl = 'http://192.168.1.100:3000/login?u=admin&p=test123';
      expect(consoleOutput.some(line => line.includes(expectedUrl))).toBe(true);
    });
  });
});