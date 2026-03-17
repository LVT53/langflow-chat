import express from 'express';
import * as http from 'http';
import langflowRouter from './langflow-server';
import nemotronRouter from './nemotron-server';

// Configuration from environment variables
const MOCK_LANGFLOW_PORT = parseInt(process.env.MOCK_LANGFLOW_PORT || '7860', 10);
const MOCK_NEMOTRON_PORT = parseInt(process.env.MOCK_NEMOTRON_PORT || '30001', 10);

// Create express apps
const langflowApp = express();
const nemotronApp = express();

// Middleware
langflowApp.use(express.json());
nemotronApp.use(express.json());

// Use routers
langflowApp.use('/', langflowRouter);
nemotronApp.use('/', nemotronRouter);

// Create HTTP servers
const langflowServer = http.createServer(langflowApp);
const nemotronServer = http.createServer(nemotronApp);

// Track server readiness
let langflowReady = false;
let nemotronReady = false;

// Start Langflow mock server
langflowServer.listen(MOCK_LANGFLOW_PORT, () => {
  langflowReady = true;
  console.log(`[Mock Server] Langflow mock server running on port ${MOCK_LANGFLOW_PORT}`);
  
  // Check if both servers are ready
  if (nemotronReady) {
    console.log('[Mock Server] All mock servers are ready!');
  }
});

// Start Nemotron mock server
nemotronServer.listen(MOCK_NEMOTRON_PORT, () => {
  nemotronReady = true;
  console.log(`[Mock Server] Nemotron mock server running on port ${MOCK_NEMOTRON_PORT}`);
  
  // Check if both servers are ready
  if (langflowReady) {
    console.log('[Mock Server] All mock servers are ready!');
  }
});

// Handle shutdown signals
function shutdown() {
  console.log('[Mock Server] Shutting down mock servers...');
  
  langflowServer.close(() => {
    console.log('[Mock Server] Langflow mock server closed');
  });
  
  nemotronServer.close(() => {
    console.log('[Mock Server] Nemotron mock server closed');
  });
  
  process.exit(0);
}

// Listen for termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle unexpected errors
process.on('uncaughtException', (err) => {
  console.error('[Mock Server] Uncaught exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Mock Server] Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});

export { langflowServer, nemotronServer };