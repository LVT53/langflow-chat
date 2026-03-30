// src/lib/server/services/title-generator.ts
import { getConfig } from '../config-store';

// Common misspellings dictionary for post-processing correction
const COMMON_MISSPELLINGS: Record<string, string> = {
  'humantizing': 'humanizing',
  'humantize': 'humanize',
  'humantized': 'humanized',
  'recieve': 'receive',
  'recieved': 'received',
  'seperate': 'separate',
  'seperated': 'separated',
  'occured': 'occurred',
  'occurance': 'occurrence',
  'definately': 'definitely',
  'accomodate': 'accommodate',
  'acheive': 'achieve',
  'beleive': 'believe',
  'calender': 'calendar',
  'collegue': 'colleague',
  'concious': 'conscious',
  'existance': 'existence',
  'goverment': 'government',
  'independant': 'independent',
  'maintainance': 'maintenance',
  'neccessary': 'necessary',
  'noticable': 'noticeable',
  'occassion': 'occasion',
  'paralell': 'parallel',
  'persistant': 'persistent',
  'posession': 'possession',
  'prefered': 'preferred',
  'proffesional': 'professional',
  'publically': 'publicly',
  'recomend': 'recommend',
  'refering': 'referring',
  'relevent': 'relevant',
  'succesful': 'successful',
  'supercede': 'supersede',
  'tommorow': 'tomorrow',
  'untill': 'until',
  'wich': 'which',
};

// Hungarian-specific characters and common words for language detection
const HUNGARIAN_CHARS = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
// Strong indicators - words that are distinctly Hungarian (not common English words)
const STRONG_HUNGARIAN_WORDS = /\b(és|hogy|nem|van|meg|ez|egy|kell|azt|volt)\b/i;

// Code-related keywords and patterns
const CODE_PATTERNS = [
  /```[\s\S]*?```/,  // Code blocks
  /`[^`]+`/,          // Inline code
  /\b(function|class|import|export|const|let|var|def|if|for|while|return)\b/,
  /\b(console|print|log|error|debug)\b/,
  /\b(html|css|javascript|python|java|typescript|react|vue|svelte)\b/i,
];

function detectLanguage(text: string): 'en' | 'hu' {
  if (HUNGARIAN_CHARS.test(text)) {
    return 'hu';
  }
  const strongMatches = text.match(STRONG_HUNGARIAN_WORDS);
  if (strongMatches && strongMatches.length >= 2) {
    return 'hu';
  }
  return 'en';
}

const EXPLICIT_ENGLISH_HINT_RE =
  /\b(in english|english title|respond in english|answer in english)\b|angolul/i;
const EXPLICIT_HUNGARIAN_HINT_RE =
  /\b(in hungarian|hungarian title|respond in hungarian|answer in hungarian)\b|magyarul/i;

function resolveTitleLanguage(userMessage: string): 'en' | 'hu' {
  if (EXPLICIT_ENGLISH_HINT_RE.test(userMessage)) return 'en';
  if (EXPLICIT_HUNGARIAN_HINT_RE.test(userMessage)) return 'hu';
  return detectLanguage(userMessage);
}

/**
 * Check if the conversation is code-related
 * @param userMessage The user's message
 * @param assistantResponse The assistant's response
 * @returns true if code-related
 */
function isCodeRelated(userMessage: string, assistantResponse: string): boolean {
  const combinedText = `${userMessage} ${assistantResponse}`;
  return CODE_PATTERNS.some(pattern => pattern.test(combinedText));
}

/**
 * Check if the message is very short (≤3 words)
 * @param message The message to check
 * @returns true if short message
 */
function isShortMessage(message: string): boolean {
  const words = message.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length <= 3;
}

/**
 * Correct common misspellings in the title
 * @param title The title to correct
 * @returns Title with corrected spellings
 */
function correctSpelling(title: string): string {
  if (!title || typeof title !== 'string') {
    return title;
  }

  // Split into words and correct each one
  return title
    .split(/\s+/)
    .map(word => {
      // Check for exact match (case-insensitive)
      const lowerWord = word.toLowerCase();
      if (COMMON_MISSPELLINGS[lowerWord]) {
        // Preserve original capitalization pattern
        if (word === word.toUpperCase()) {
          return COMMON_MISSPELLINGS[lowerWord].toUpperCase();
        } else if (word[0] === word[0]?.toUpperCase()) {
          return COMMON_MISSPELLINGS[lowerWord].charAt(0).toUpperCase() +
                 COMMON_MISSPELLINGS[lowerWord].slice(1);
        }
        return COMMON_MISSPELLINGS[lowerWord];
      }
      return word;
    })
    .join(' ');
}

/**
 * Clean and normalize the generated title
 * - Removes surrounding quotes
 * - Removes prefixes like "Title:" or "Conversation:"
 * - Removes trailing periods
 * - Corrects common misspellings
 * - Trims whitespace
 * @param title The raw title from the model
 * @returns Cleaned title
 */
function cleanTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  let cleaned = title.trim();

  // Remove surrounding quotes (single and double)
  cleaned = cleaned.replace(/^["']+|["']+$/g, '');

  // Remove common prefixes (case-insensitive)
  const prefixes = [
    /^title[:\s-]+/i,
    /^conversation[:\s-]+/i,
    /^chat[:\s-]+/i,
    /^topic[:\s-]+/i,
    /^subject[:\s-]+/i,
    /^cím[:\s-]+/i,
    /^beszélgetés[:\s-]+/i,
  ];
  
  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  // Remove trailing periods (but keep other punctuation)
  cleaned = cleaned.replace(/\.+$/, '');

  // Trim again after all replacements
  cleaned = cleaned.trim();

  // Apply spell correction
  cleaned = correctSpelling(cleaned);

  return cleaned;
}

/**
 * Generate a fallback title from the user message
 * @param userMessage The user's message
 * @returns A fallback title
 */
function fallbackTitle(userMessage: string): string {
  const normalized = userMessage.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'New Conversation';
  }

  const words = normalized.split(' ').slice(0, 8);
  return words.join(' ');
}

/**
 * Build few-shot examples for the prompt
 * @param language The detected language ('en' or 'hu')
 * @param isCodeRelated Whether the conversation is code-related
 * @returns Array of example messages
 */
function buildFewShotExamples(language: 'en' | 'hu', isCodeRelated: boolean): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (language === 'hu') {
    const examples = [
      {
        user: 'Hogyan tudok React komponenst létrehozni?',
        assistant: 'A React komponensek funkcionális komponensek vagy osztályok formájában hozhatók létre...',
        title: 'React komponens létrehozási alapok',
      },
      {
        user: 'Mi a különbség a let és const között?',
        assistant: 'A let változó deklarálására szolgál, amelynek értéke megváltoztatható...',
        title: 'Let és const használati különbségek',
      },
      {
        user: 'Segítség a Python függvényekkel',
        assistant: 'A Python függvények a def kulcsszóval definiálhatók...',
        title: 'Python függvények gyakorlati áttekintése',
      },
      {
        user: 'Szeretnék tanácsot adatbázis tervezéshez',
        assistant: 'Az adatbázis tervezésnél fontos a normalizálás és a kapcsolatok...',
        title: 'Adatbázis tervezési tanácsok kezdéshez',
      },
    ];

    return examples.flatMap(ex => [
      { role: 'user' as const, content: `User: ${ex.user}\nAssistant: ${ex.assistant}` },
      { role: 'assistant' as const, content: ex.title },
    ]);
  } else {
    const examples = [
      {
        user: 'How do I create a React component?',
        assistant: 'React components can be created as functional components or classes...',
        title: 'How to Create React Components',
      },
      {
        user: "What's the difference between let and const?",
        assistant: 'let is used for variable declarations that can be reassigned...',
        title: 'Key Differences Between Let and Const',
      },
      {
        user: 'Help with Python functions',
        assistant: 'Python functions are defined using the def keyword...',
        title: 'Help With Python Function Basics',
      },
      {
        user: 'I need advice on database design',
        assistant: 'Database design involves normalization and establishing relationships...',
        title: 'Practical Database Design Advice',
      },
    ];

    // Add code-specific example if code-related
    if (isCodeRelated) {
      examples.push({
        user: 'How do I fix this JavaScript error?',
        assistant: 'The error occurs because you are trying to access a property of undefined...',
        title: 'Debugging a JavaScript Undefined Error',
      });
    }

    return examples.flatMap(ex => [
      { role: 'user' as const, content: `User: ${ex.user}\nAssistant: ${ex.assistant}` },
      { role: 'assistant' as const, content: ex.title },
    ]);
  }
}

function buildTitleMessages(
  systemPrompt: string,
  language: 'en' | 'hu',
  isCodeRelated: boolean,
  userMessage: string,
  assistantResponse: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  if (systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  return [
    ...messages,
    ...buildFewShotExamples(language, isCodeRelated),
    {
      role: 'user',
      content: `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 200)}`
    },
  ];
}

/**
 * Internal function to generate title with specific temperature
 * @param userMessage The user's message
 * @param assistantResponse The assistant's response
 * @param temperature The temperature for generation
 * @returns Generated title or null on failure
 */
async function generateTitleWithTemperature(
  userMessage: string,
  assistantResponse: string,
  temperature: number
): Promise<string | null> {
  const config = getConfig();
  
  const language = resolveTitleLanguage(userMessage);
  const codeRelated = isCodeRelated(userMessage, assistantResponse);
  const messages = buildTitleMessages(
    config.titleGenSystemPrompt,
    language,
    codeRelated,
    userMessage,
    assistantResponse
  );

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
      messages,
      max_tokens: 60,
      temperature,
    }),
  });
  
  if (!response.ok) {
    return null;
  }
  
  const json = await response.json();
  const message = json.choices?.[0]?.message;
  const rawTitle = (
    typeof message?.content === 'string' && message.content.trim()
      ? message.content.trim()
      : typeof message?.reasoning === 'string' && message.reasoning.trim()
        ? message.reasoning.trim()
        : ''
  );
  
  if (!rawTitle) {
    return null;
  }
  
  // Apply post-processing
  const cleanedTitle = cleanTitle(rawTitle);
  
  return cleanedTitle || null;
}

/**
 * Generate title with retry logic and temperature escalation
 * Tries with temperatures: 0.1, 0.3, 0.5
 * @param userMessage The user's message
 * @param assistantResponse The assistant's response
 * @returns Generated title or null if all retries fail
 */
async function generateTitleWithRetry(
  userMessage: string,
  assistantResponse: string
): Promise<string | null> {
  const temperatures = [0.1, 0.3, 0.5];
  
  for (const temperature of temperatures) {
    try {
      const title = await generateTitleWithTemperature(
        userMessage,
        assistantResponse,
        temperature
      );
      
      if (title && title.length > 0) {
        return title;
      }
    } catch (error) {
      // Continue to next temperature
      console.warn(`Title generation failed with temperature ${temperature}:`, error);
    }
  }
  
  return null;
}

export async function generateTitle(userMessage: string, assistantResponse: string): Promise<string> {
  const config = getConfig();
  const language = resolveTitleLanguage(userMessage);
  const codeRelated = isCodeRelated(userMessage, assistantResponse);
  const messages = buildTitleMessages(
    config.titleGenSystemPrompt,
    language,
    codeRelated,
    userMessage,
    assistantResponse
  );

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.titleGenApiKey) headers.Authorization = `Bearer ${config.titleGenApiKey}`;

  const response = await fetch(`${config.titleGenUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.titleGenModel,
      messages,
      max_tokens: 60,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Title generation failed: ${response.status}`);
  }

  const json = await response.json();
  const message = json.choices?.[0]?.message;
  const rawTitle = message?.content?.trim() || message?.reasoning?.trim() || '';

  if (!rawTitle) {
    return fallbackTitle(userMessage);
  }
  const cleanedTitle = cleanTitle(rawTitle);
  if (!cleanedTitle) {
    return fallbackTitle(userMessage);
  }
  if (detectLanguage(cleanedTitle) !== language) {
    return fallbackTitle(userMessage);
  }

  return cleanedTitle;
}
