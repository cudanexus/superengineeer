import { networkInterfaces } from 'os';

export interface NetworkAddress {
  interface: string;
  address: string;
  family: 'IPv4' | 'IPv6';
}

export function getLocalNetworkAddresses(): NetworkAddress[] {
  const interfaces = networkInterfaces();
  const addresses: NetworkAddress[] = [];

  for (const [name, netInterfaces] of Object.entries(interfaces)) {
    if (!netInterfaces) {
      continue;
    }

    for (const net of netInterfaces) {
      if (net.internal) {
        continue;
      }

      if (net.family === 'IPv4') {
        addresses.push({
          interface: name,
          address: net.address,
          family: 'IPv4',
        });
      }
    }
  }

  return addresses;
}

export function formatAccessibleUrls(host: string, port: number): string[] {
  const urls: string[] = [];

  if (host === '0.0.0.0' || host === '::') {
    urls.push(`http://localhost:${port}`);

    const networkAddresses = getLocalNetworkAddresses();

    for (const addr of networkAddresses) {
      urls.push(`http://${addr.address}:${port}`);
    }
  } else if (host === 'localhost' || host === '127.0.0.1') {
    urls.push(`http://localhost:${port}`);
  } else {
    urls.push(`http://${host}:${port}`);
  }

  return urls;
}
