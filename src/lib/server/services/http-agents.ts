import http from 'node:http';
import https from 'node:https';

// Agent for Langflow API calls - enables connection reuse
// Using a singleton pattern for connection pooling

interface HttpAgentOptions {
  keepAlive?: boolean;
  maxSockets?: number;
  maxFreeSockets?: number;
  scheduling?: 'fifo' | 'lifo';
  timeout?: number;
}

export function createHttpAgent(options: HttpAgentOptions = {}): http.Agent | https.Agent {
  const isHttps = options as unknown as { https?: boolean };
  const AgentClass = isHttps ? https.Agent : http.Agent;

  return new AgentClass({
    keepAlive: options.keepAlive ?? true,
    maxSockets: options.maxSockets ?? 50,
    maxFreeSockets: options.maxFreeSockets ?? 20,
    scheduling: options.scheduling ?? 'lifo',
    timeout: options.timeout ?? 30000,
  });
}

// Singleton instance for Langflow API calls
let _langflowAgent: http.Agent | https.Agent | null = null;

export function getLangflowAgent(): http.Agent | https.Agent {
  if (!_langflowAgent) {
    _langflowAgent = createHttpAgent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 20,
      scheduling: 'lifo', // LIFO to reuse most recent connections (better for streaming)
      timeout: 30000,
    });
  }
  return _langflowAgent;
}

// Cleanup function for graceful shutdown
export function closeLangflowAgent(): void {
  if (_langflowAgent) {
    _langflowAgent.destroy();
    _langflowAgent = null;
  }
}