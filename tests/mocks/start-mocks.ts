import express from 'express';
import * as http from 'http';
import langflowRouter from './langflow-server';
import titleGenRouter from './title-gen-server';

// Configuration from environment variables
const MOCK_LANGFLOW_PORT = parseInt(process.env.MOCK_LANGFLOW_PORT || '7860', 10);
const MOCK_TITLE_GEN_PORT = parseInt(process.env.MOCK_TITLE_GEN_PORT || '30001', 10);

// Create express apps
const langflowApp = express();
const titleGenApp = express();

// Middleware
langflowApp.use(express.json());
titleGenApp.use(express.json());

// Use routers
langflowApp.use('/', langflowRouter);
titleGenApp.use('/', titleGenRouter);

// Create HTTP servers
const langflowServer = http.createServer(langflowApp);
const titleGenServer = http.createServer(titleGenApp);

// Track server readiness
let langflowReady = false;
let titleGenReady = false;

// Start Langflow mock server
langflowServer.listen(MOCK_LANGFLOW_PORT, () => {
  langflowReady = true;
  console.log(`[Mock Server] Langflow mock server running on port ${MOCK_LANGFLOW_PORT}`);

  // Check if both servers are ready
  if (titleGenReady) {
    console.log('[Mock Server] All mock servers are ready!');
  }
});

// Start Title Gen mock server
titleGenServer.listen(MOCK_TITLE_GEN_PORT, () => {
  titleGenReady = true;
  console.log(`[Mock Server] Title Gen mock server running on port ${MOCK_TITLE_GEN_PORT}`);

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

  titleGenServer.close(() => {
    console.log('[Mock Server] Title Gen mock server closed');
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

export { langflowServer, titleGenServer };