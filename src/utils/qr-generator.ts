/**
 * QR Code Generator
 * Displays login credentials and QR code in terminal
 */

import * as qrcode from 'qrcode-terminal';
import { networkInterfaces } from 'os';

export interface LoginDisplayOptions {
  host: string;
  port: number;
  credentials: {
    username: string;
    password: string;
  };
}

/**
 * Get the first non-localhost IPv4 address for LAN access
 */
function getLocalIpAddress(): string | null {
  const interfaces = networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name];

    if (!netInterface) continue;

    for (const net of netInterface) {
      // Skip internal (localhost) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return null;
}

/**
 * Display login credentials and QR code in terminal
 */
export function displayLoginCredentials(options: LoginDisplayOptions): void {
  const { host, port, credentials } = options;
  const { username, password } = credentials;

  // Use LAN IP if available, otherwise fall back to provided host
  const lanIp = getLocalIpAddress();
  const displayHost = lanIp || (host === '0.0.0.0' ? 'localhost' : host);

  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  const loginUrl = `http://${displayHost}:${port}/login?u=${encodedUser}&p=${encodedPass}`;

  const separator = '═'.repeat(60);
  const thinSeparator = '─'.repeat(60);

  console.log('');
  console.log(separator);
  console.log('  🔐 LOGIN CREDENTIALS');
  console.log(separator);
  console.log('');
  console.log(`  Username:  ${username}`);
  console.log(`  Password:  ${password}`);
  console.log('');
  console.log(thinSeparator);
  console.log('  📱 Scan QR code for mobile login:');
  console.log('');

  // Generate QR code (small format for terminal)
  qrcode.generate(loginUrl, { small: true }, (qr: string) => {
    // Indent the QR code for better alignment
    const indentedQr = qr
      .split('\n')
      .map(line => '  ' + line)
      .join('\n');
    console.log(indentedQr);
  });

  console.log('');
  console.log(`  URL: ${loginUrl}`);
  console.log('');
  console.log(separator);
  console.log('');
}
