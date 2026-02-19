import { EventEmitter } from 'events';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_BUFFER_SIZE = 100;

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(name: string): Logger;
  withProject(projectId: string): Logger;
}

export interface LoggerConfig {
  level: LogLevel;
  name?: string;
  projectId?: string;
}

export interface LogOutput {
  write(entry: LogEntry): void;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  name?: string;
  projectId?: string;
  context?: Record<string, unknown>;
}

export class ConsoleLogOutput implements LogOutput {
  write(entry: LogEntry): void {
    const prefix = entry.name ? `[${entry.name}]` : '';
    const projectPrefix = entry.projectId ? `[project:${entry.projectId}]` : '';
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const timePart = entry.timestamp.split('T')[1] || '';
    const timestamp = timePart.split('.')[0] || '';

    const message = `${timestamp} ${entry.level.toUpperCase().padEnd(5)} ${prefix}${projectPrefix} ${entry.message}${contextStr}`;

    switch (entry.level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
    }
  }
}

class CircularBuffer<T> {
  private buffer: T[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    this.buffer.push(item);

    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  getLast(count: number): T[] {
    const start = Math.max(0, this.buffer.length - count);
    return this.buffer.slice(start);
  }

  clear(): void {
    this.buffer = [];
  }
}

class LogStore extends EventEmitter {
  private static instance: LogStore | null = null;
  private readonly projectBuffers: Map<string, CircularBuffer<LogEntry>> = new Map();
  private readonly globalBuffer: CircularBuffer<LogEntry>;
  private readonly bufferSize: number;

  constructor(bufferSize: number = DEFAULT_BUFFER_SIZE) {
    super();
    this.bufferSize = bufferSize;
    this.globalBuffer = new CircularBuffer<LogEntry>(bufferSize * 2); // Global buffer is larger
  }

  static getInstance(): LogStore {
    if (!LogStore.instance) {
      LogStore.instance = new LogStore();
    }

    return LogStore.instance;
  }

  addEntry(entry: LogEntry): void {
    // Always add to global buffer
    this.globalBuffer.push(entry);

    // Also add to project-specific buffer if projectId is present
    if (entry.projectId) {
      let buffer = this.projectBuffers.get(entry.projectId);

      if (!buffer) {
        buffer = new CircularBuffer<LogEntry>(this.bufferSize);
        this.projectBuffers.set(entry.projectId, buffer);
      }

      buffer.push(entry);
    }

    // Emit event for frontend errors so WebSocket can broadcast them
    if (entry.context && entry.context.type === 'frontend') {
      this.emit('frontend_error', entry);
    }
  }

  getProjectLogs(projectId: string, limit?: number): LogEntry[] {
    const buffer = this.projectBuffers.get(projectId);

    if (!buffer) {
      return [];
    }

    if (limit) {
      return buffer.getLast(limit);
    }

    return buffer.getAll();
  }

  getGlobalLogs(limit?: number): LogEntry[] {
    if (limit) {
      return this.globalBuffer.getLast(limit);
    }

    return this.globalBuffer.getAll();
  }

  clearProjectLogs(projectId: string): void {
    const buffer = this.projectBuffers.get(projectId);

    if (buffer) {
      buffer.clear();
    }
  }

  clearGlobalLogs(): void {
    this.globalBuffer.clear();
  }
}

export class DefaultLogger implements Logger {
  private readonly level: LogLevel;
  private readonly name?: string;
  private readonly projectId?: string;
  private readonly output: LogOutput;
  private readonly logStore: LogStore;

  constructor(config: LoggerConfig, output?: LogOutput) {
    this.level = config.level;
    this.name = config.name;
    this.projectId = config.projectId;
    this.output = output || new ConsoleLogOutput();
    this.logStore = LogStore.getInstance();
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  child(name: string): Logger {
    const childName = this.name ? `${this.name}:${name}` : name;
    return new DefaultLogger(
      { level: this.level, name: childName, projectId: this.projectId },
      this.output
    );
  }

  withProject(projectId: string): Logger {
    return new DefaultLogger(
      { level: this.level, name: this.name, projectId },
      this.output
    );
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      name: this.name,
      projectId: this.projectId,
      context,
    };

    this.output.write(entry);

    // Always store logs in the log store (both global and project-specific if applicable)
    this.logStore.addEntry(entry);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }
}

let globalLogger: Logger | null = null;

export function initializeLogger(config: LoggerConfig): Logger {
  globalLogger = new DefaultLogger(config);
  return globalLogger;
}

export function getLogger(name?: string): Logger {
  if (!globalLogger) {
    globalLogger = new DefaultLogger({ level: 'info' });
  }

  return name ? globalLogger.child(name) : globalLogger;
}

export function getProjectLogs(projectId: string, limit?: number): LogEntry[] {
  return LogStore.getInstance().getProjectLogs(projectId, limit);
}

export function getGlobalLogs(limit?: number): LogEntry[] {
  return LogStore.getInstance().getGlobalLogs(limit);
}

export function clearProjectLogs(projectId: string): void {
  LogStore.getInstance().clearProjectLogs(projectId);
}

export function clearGlobalLogs(): void {
  LogStore.getInstance().clearGlobalLogs();
}

export function getLogStore(): LogStore {
  return LogStore.getInstance();
}
