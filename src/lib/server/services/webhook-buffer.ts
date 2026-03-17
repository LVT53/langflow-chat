import type { WebhookSentencePayload } from '$lib/types';

interface StoredSentence {
  sentence: string;
  index: number;
  isFinal: boolean;
  timestamp: number;
}

interface SessionData {
  sentences: Map<number, StoredSentence>;
  isComplete: boolean;
  lastUpdated: number;
}

export class WebhookBuffer {
  private sessions: Map<string, SessionData>;
  private readonly sessionTimeoutMs: number;

  constructor(sessionTimeoutMinutes = 10) {
    this.sessions = new Map();
    this.sessionTimeoutMs = sessionTimeoutMinutes * 60 * 1000;
  }

  addSentence(sessionId: string, sentence: string, index: number, isFinal: boolean): void {
    const now = Date.now();
    
    // Clean up old sessions before adding new sentence
    this.cleanupOldSessions(now);
    
    // Get or create session data
    let sessionData = this.sessions.get(sessionId);
    if (!sessionData) {
      sessionData = {
        sentences: new Map(),
        isComplete: false,
        lastUpdated: now
      };
      this.sessions.set(sessionId, sessionData);
    }
    
    // Store the sentence
    const storedSentence: StoredSentence = {
      sentence,
      index,
      isFinal: isFinal,
      timestamp: now
    };
    
    sessionData.sentences.set(index, storedSentence);
    sessionData.lastUpdated = now;
    
    // If this is marked as final, mark the session as complete
    if (isFinal) {
      sessionData.isComplete = true;
    }
  }

  markComplete(sessionId: string): void {
    const now = Date.now();
    this.cleanupOldSessions(now);

    let sessionData = this.sessions.get(sessionId);
    if (!sessionData) {
      sessionData = {
        sentences: new Map(),
        isComplete: false,
        lastUpdated: now
      };
      this.sessions.set(sessionId, sessionData);
    }

    sessionData.isComplete = true;
    sessionData.lastUpdated = now;
  }

  getSentences(sessionId: string): { sentences: string[]; isComplete: boolean } | null {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData) {
      return null;
    }
    
    // Sort sentences by index and extract sentence text
    const sortedIndices = Array.from(sessionData.sentences.keys()).sort((a, b) => a - b);
    const sentences = sortedIndices.map(index => sessionData.sentences.get(index)!.sentence);
    
    return {
      sentences,
      isComplete: sessionData.isComplete
    };
  }

  private cleanupOldSessions(now: number): void {
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      if (now - sessionData.lastUpdated > this.sessionTimeoutMs) {
        this.sessions.delete(sessionId);
      }
    }
  }
  
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // For testing purposes - get all session IDs
  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
  
  // For testing purposes - get session data
  getSessionData(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }
}

export const webhookBuffer = new WebhookBuffer();
