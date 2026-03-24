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
 * Build the system message for title generation
 * @param language The detected language ('en' or 'hu')
 * @param isCodeRelated Whether the conversation is code-related
 * @returns System message string
 */
function buildSystemMessage(language: 'en' | 'hu', isCodeRelated: boolean): string {
  const baseInstructions = language === 'hu'
    ? 'Te egy beszélgetés cím generátor vagy. A feladatod, hogy rövid, tömör, informatív címeket készíts a beszélgetésekhez.'
    : 'You are a conversation title generator. Your task is to create short, concise, informative titles for conversations.';

  const rules = language === 'hu'
    ? [
        'A cím legyen 3-6 szó hosszú',
        'Használj cselekvő vagy tárgyas formát',
        'Csak a címet add vissza, semmi mást',
        'Ne használj idézőjeleket',
        'Ne adj magyarázatot',
        'Használj helyes helyesírást és nyelvtant',
        'Csak szabványos magyar szavakat használj',
      ]
    : [
        'Titles should be 3-6 words long',
        'Use action or noun phrase format',
        'Return only the title, nothing else',
        'Do not use quotes',
        'Do not provide explanations',
        'Use correct spelling and grammar',
        'Use standard English words only',
      ];

  const codeInstruction = isCodeRelated
    ? (language === 'hu'
        ? 'Ez egy kódolási beszélgetés. A cím tartalmazzon programozási nyelvet vagy technológiát ha ismert.'
        : 'This is a coding conversation. Include the programming language or technology in the title if known.')
    : '';

  return [baseInstructions, ...rules, codeInstruction].filter(Boolean).join('\n');
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
        title: 'React komponens létrehozása',
      },
      {
        user: 'Mi a különbség a let és const között?',
        assistant: 'A let változó deklarálására szolgál, amelynek értéke megváltoztatható...',
        title: 'Let és const különbségei',
      },
      {
        user: 'Segítség a Python függvényekkel',
        assistant: 'A Python függvények a def kulcsszóval definiálhatók...',
        title: 'Python függvények segítség',
      },
      {
        user: 'Szeretnék tanácsot adatbázis tervezéshez',
        assistant: 'Az adatbázis tervezésnél fontos a normalizálás és a kapcsolatok...',
        title: 'Adatbázis tervezési tanácsok',
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
        title: 'Creating React Components',
      },
      {
        user: "What's the difference between let and const?",
        assistant: 'let is used for variable declarations that can be reassigned...',
        title: 'Let vs Const Differences',
      },
      {
        user: 'Help with Python functions',
        assistant: 'Python functions are defined using the def keyword...',
        title: 'Python Functions Help',
      },
      {
        user: 'I need advice on database design',
        assistant: 'Database design involves normalization and establishing relationships...',
        title: 'Database Design Advice',
      },
    ];

    // Add code-specific example if code-related
    if (isCodeRelated) {
      examples.push({
        user: 'How do I fix this JavaScript error?',
        assistant: 'The error occurs because you are trying to access a property of undefined...',
        title: 'JavaScript Error Debugging',
      });
    }

    return examples.flatMap(ex => [
      { role: 'user' as const, content: `User: ${ex.user}\nAssistant: ${ex.assistant}` },
      { role: 'assistant' as const, content: ex.title },
    ]);
  }
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
  
  // Detect language and code-related status
  const combinedText = `${userMessage} ${assistantResponse}`;
  const language = detectLanguage(combinedText);
  const codeRelated = isCodeRelated(userMessage, assistantResponse);
  
  // Truncate assistantResponse to 200 chars
  const truncatedResponse = assistantResponse.slice(0, 200);

  // Build messages array with system message, few-shot examples, and the actual request
  const systemMessage = buildSystemMessage(language, codeRelated);
  const fewShotExamples = buildFewShotExamples(language, codeRelated);
  
  const messages = [
    { role: 'system' as const, content: systemMessage },
    ...fewShotExamples,
    { 
      role: 'user' as const, 
      content: `User: ${userMessage}\nAssistant: ${truncatedResponse}` 
    },
  ];

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
  const combinedText = `${userMessage} ${assistantResponse}`;
  const language = detectLanguage(combinedText);
  const codeRelated = isCodeRelated(userMessage, assistantResponse);
  const truncatedResponse = assistantResponse.slice(0, 200);

  const systemMessage = buildSystemMessage(language, codeRelated);
  const fewShotExamples = buildFewShotExamples(language, codeRelated);

  const messages = [
    { role: 'system', content: systemMessage },
    ...fewShotExamples,
    { role: 'user', content: `User: ${userMessage}\nAssistant: ${truncatedResponse}` },
  ];

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

  return cleanTitle(rawTitle);
}
