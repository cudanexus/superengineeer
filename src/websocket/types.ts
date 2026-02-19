/**
 * Type definitions for WebSocket resource events and client data
 */

export interface ResourceStats {
  total: number;
  loaded: number;
  failed: number;
  pending: number;
  resources: ResourceInfo[];
  runtime: number;
  clientInfo: ClientInfo;
}

export interface ResourceInfo {
  url: string;
  type: 'script' | 'style' | 'image' | 'fetch' | 'xhr';
  startTime: number;
  timestamp: string;
  status: 'loaded' | 'failed' | 'pending';
  duration: number | null;
  error: string | null;
  httpStatus?: number;
  clientInfo: ClientInfo;
}

export interface ClientInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenResolution: string;
  viewport: string;
  cookiesEnabled: boolean;
  online: boolean;
  clientId: string;
}

export type ResourceEventData =
  | ResourceStatsBroadcast
  | IndividualResourceEvent;

export interface ResourceStatsBroadcast {
  clientId: string;
  stats: ResourceStats;
  timestamp: string;
}

export interface IndividualResourceEvent {
  type: string;
  url: string;
  status: string;
  duration?: number;
  error?: string;
  method?: string;
  statusCode?: number;
  timestamp: string;
  clientId: string;
  userAgent: string;
  hostname: string;
}