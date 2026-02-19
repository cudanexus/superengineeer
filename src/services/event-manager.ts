import { EventEmitter } from 'events';

export type AgentEvent =
  | 'user_sent_message'
  | 'tool_use_started'
  | 'tool_use_completed'
  | 'assistant_response_completed'
  | 'agent_started'
  | 'agent_stopped';

export interface EventManager {
  emit(event: AgentEvent, projectId: string, data?: unknown): void;
  on(event: AgentEvent, listener: (projectId: string, data?: unknown) => void): void;
  off(event: AgentEvent, listener: (projectId: string, data?: unknown) => void): void;
}

class DefaultEventManager implements EventManager {
  private emitter = new EventEmitter();

  emit(event: AgentEvent, projectId: string, data?: unknown): void {
    this.emitter.emit(event, projectId, data);
  }

  on(event: AgentEvent, listener: (projectId: string, data?: unknown) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: AgentEvent, listener: (projectId: string, data?: unknown) => void): void {
    this.emitter.off(event, listener);
  }
}

export function createEventManager(): EventManager {
  return new DefaultEventManager();
}
