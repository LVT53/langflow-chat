// src/lib/server/services/title-generator.ts
import { getConfig } from '../config-store';

function fallbackTitle(userMessage: string): string {
  const normalized = userMessage.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'New Conversation';
  }

  const words = normalized.split(' ').slice(0, 8);
  return words.join(' ');
}

/**
 * Generate a conversation title using nemotron-nano
 * @param userMessage The user's message
 * @param assistantResponse The assistant's response
 * @returns A generated title string
 */
export async function generateTitle(userMessage: string, assistantResponse: string): Promise<string> {
  const config = getConfig();
  // Truncate assistantResponse to 200 chars
  const truncatedResponse = assistantResponse.slice(0, 200);

  // Construct the prompt
  const prompt = `Summarize this conversation in 5-8 words as a title. Output only the title, nothing else.\n\nUser: ${userMessage}\nAssistant: ${truncatedResponse}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.titleGenApiKey) {
    headers.Authorization = `Bearer ${config.titleGenApiKey}`;
  }

  // Make POST request to title generation service
  const response = await fetch(`${config.titleGenUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.titleGenModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30,
      temperature: 0.3,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Title generation failed: ${response.status}`);
  }
  
  const json = await response.json();
  const message = json.choices?.[0]?.message;
  const title = (
    typeof message?.content === 'string' && message.content.trim()
      ? message.content.trim()
      : typeof message?.reasoning === 'string' && message.reasoning.trim()
        ? message.reasoning.trim()
        : ''
  );
  
  if (!title) {
    return fallbackTitle(userMessage);
  }
  
  // Remove surrounding quotes
  return title.replace(/^["']|["']$/g, '');
}
