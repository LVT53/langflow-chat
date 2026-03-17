import express from 'express';
import type { Request, Response, NextFunction } from 'express';

// Define the LangflowRunResponse type based on expected structure
interface LangflowRunResponse {
  session_id: string;
  outputs: {
    outputs: {
      results: {
        message: {
          text: string;
        };
      };
    }[];
  }[];
}

// Create express router
const router = express.Router();

// Configuration from environment variables
const RESPONSE_DELAY_MS = parseInt(process.env.MOCK_RESPONSE_DELAY_MS || '100', 10);
const CHUNK_DELAY_MS = parseInt(process.env.MOCK_CHUNK_DELAY_MS || '50', 10);
const ERROR_MODE = process.env.MOCK_ERROR_MODE || 'none';
const RESPONSE_TEXT = process.env.MOCK_RESPONSE_TEXT || 'Hello from mock Langflow server!';

/**
 * Simulate delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handle POST requests to /api/v1/run/{flow_id}
 */
router.post('/api/v1/run/:flow_id', async (req: Request, res: Response, next: NextFunction) => {
  // Log request for debugging
  console.log(`[Mock Langflow] Received request to ${req.path}`);
  console.log(`[Mock Langflow] Headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`[Mock Langflow] Body:`, JSON.stringify(req.body, null, 2));

  // Validate x-api-key header
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    console.log('[Mock Langflow] Missing x-api-key header');
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  // Handle error modes
  if (ERROR_MODE === '500') {
    console.log('[Mock Langflow] Simulating 500 error');
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (ERROR_MODE === 'timeout') {
    console.log('[Mock Langflow] Simulating timeout');
    // Never respond - simulate timeout
    return;
  }

  // Check if streaming is requested
  const stream = req.query.stream === 'true';

  if (stream) {
    // Streaming mode
    console.log('[Mock Langflow] Streaming mode activated');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Split response text into words for chunking
    const words = RESPONSE_TEXT.split(' ');
    let chunkIndex = 0;

    const sendChunk = async () => {
      if (chunkIndex < words.length) {
        const word = words[chunkIndex];
        const chunkData = {
          chunk: word + (chunkIndex < words.length - 1 ? ' ' : '')
        };
        
        res.write(`event: add_message\ndata: ${JSON.stringify(chunkData)}\n\n`);
        chunkIndex++;
        
        // Delay before next chunk
        setTimeout(sendChunk, CHUNK_DELAY_MS);
      } else {
        // Send done signal
        res.write('data: [DONE]\n\n');
        res.end();
      }
    };

    // Initial delay before starting stream
    setTimeout(() => {
      sendChunk();
    }, RESPONSE_DELAY_MS);
  } else {
    // Non-streaming mode
    console.log('[Mock Langflow] Non-streaming mode activated');
    
    // Simulate delay
    await delay(RESPONSE_DELAY_MS);
    
    // Construct response matching LangflowRunResponse shape
    const response: LangflowRunResponse = {
      session_id: `mock-session-${Date.now()}`,
      outputs: [
        {
          outputs: [
            {
              results: {
                message: {
                  text: RESPONSE_TEXT
                }
              }
            }
          ]
        }
      ]
    };
    
    res.json(response);
  }
});

export default router;