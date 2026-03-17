// src/lib/server/services/title-generator.ts
import { config } from '../env';

/**
 * Generate a conversation title using nemotron-nano
 * @param userMessage The user's message
 * @param assistantResponse The assistant's response
 * @returns A generated title string
 */
export async function generateTitle(userMessage: string, assistantResponse: string): Promise<string> {
  // Truncate assistantResponse to 200 chars
  const truncatedResponse = assistantResponse.slice(0, 200);
  
  // Construct the prompt
  const prompt = `Summarize this conversation in 5-8 words as a title. Output only the title, nothing else.\n\nUser: ${userMessage}\nAssistant: ${truncatedResponse}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.nemotronApiKey) {
    headers.Authorization = `Bearer ${config.nemotronApiKey}`;
  }
  
  // Make POST request to nemotron-nano
  const response = await fetch(`${config.nemotronUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.nemotronModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30,
      temperature: 0.3,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Title generation failed: ${response.status}`);
  }
  
  const json = await response.json();
   const title = json.choices?.[0]?.message?.content?.trim();
  
  if (!title) {
    throw new Error('Empty title generated');
  }
  
  // Remove surrounding quotes
  return title.replace(/^["']|["']$/g, '');
}
