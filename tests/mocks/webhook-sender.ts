// Webhook sentence payload interface (matches the one in src/lib/types.ts)
export interface WebhookSentencePayload {
  session_id: string;
  sentence: string;
  index: number;
  is_final: boolean;
}

/**
 * Send webhook sentences to target URL with configurable delay between sentences
 * @param targetUrl - The URL to POST sentences to
 * @param sessionId - The session ID to include in each payload
 * @param sentences - Array of sentences to send
 * @param delayMs - Delay between sentences in milliseconds (default: 100)
 */
export async function sendWebhookSentences(
  targetUrl: string,
  sessionId: string,
  sentences: string[],
  delayMs: number = 100
): Promise<void> {
  console.log(`[Mock Webhook Sender] Starting to send ${sentences.length} sentences to ${targetUrl}`);
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const isFinal = i === sentences.length - 1;
    
    const payload: WebhookSentencePayload = {
      session_id: sessionId,
      sentence: sentence,
      index: i,
      is_final: isFinal
    };
    
    try {
      console.log(`[Mock Webhook Sender] Sending sentence ${i + 1}/${sentences.length}: "${sentence}" (is_final: ${isFinal})`);
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Delay between sentences (except after the last one)
      if (i < sentences.length - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`[Mock Webhook Sender] Error sending sentence ${i + 1}:`, error);
      throw error;
    }
  }
  
  console.log(`[Mock Webhook Sender] Finished sending all sentences`);
}