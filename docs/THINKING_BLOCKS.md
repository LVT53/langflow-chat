# Thinking Blocks Feature

## Overview

The chat UI supports displaying **thinking/reasoning blocks** that show the model's internal reasoning process before the final response. This provides transparency into how the AI arrives at its answers.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  💭 Thinking...  [collapsible, shows during generation]    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ The user is asking about... [reasoning content]    │  │
│  │ Let me break this down...                            │  │
│  └─────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Here's my response based on that reasoning...              │
└─────────────────────────────────────────────────────────────┘
```

## Backend Requirements

**Critical**: Thinking blocks only appear if your backend (vLLM or Langflow) **sends reasoning content** in the stream.

### What the Code Looks For

The server extracts thinking content from stream events looking for these fields:

```typescript
// Server looks for these fields in each stream event:
interface StreamEvent {
  reasoning?: string;  // Primary field
  thinking?: string;   // Fallback field
  text?: string;       // Regular response content
  // ... other fields
}
```

### vLLM Configuration

To enable reasoning output from vLLM, you typically need:

1. **Use a model that supports reasoning** (e.g., models fine-tuned with chain-of-thought)

2. **Enable reasoning in the prompt**:
```python
# Example prompt modification
prompt = """Think step by step about this problem.
Explain your reasoning process before giving the final answer.

User: {user_message}

Reasoning:"""
```

3. **Parse and emit reasoning separately** in your Langflow flow:
```python
# Example: Extract reasoning from model output
full_output = model.generate(prompt)
reasoning, answer = parse_reasoning(full_output)  # Your parsing logic

# Emit reasoning first
yield {"reasoning": reasoning}

# Then emit the answer
yield {"text": answer}
```

### Langflow Flow Configuration

In your Langflow flow:

1. **Ensure the model outputs reasoning** before the final answer
2. **Use a component that separates reasoning from output**
3. **The reasoning field should be populated in the stream events**

Example structure:
```
[User Input] → [Model with CoT prompt] → [Parse Output] → [Stream]
                      ↓
                Reasoning: "Let me think..."
                      ↓
                Answer: "The answer is..."
```

## Debugging

If thinking blocks don't appear, check these logs:

### Server Logs
```bash
journalctl -u langflow-chat -f | grep "\[STREAM\]"
```

Expected output when working:
```
[STREAM] Thinking chunk extracted: "I need to analyze this question by..."
[STREAM] End - tokenCount: 142 speed: 22.9 thinkingLength: 245 wasStopped: false
```

If you see `thinkingLength: 0`, your backend isn't sending reasoning content.

### Browser Console
```javascript
[CLIENT] Received thinking chunk: I need to analyze...
[PAGE] Updated message - hasThinking: true tokenCount: 142
```

## UI Behavior

- **During streaming**: Thinking block appears with sliding shimmer animation
- **Collapsible**: Users can expand/collapse to see reasoning
- **Not translated**: Thinking content stays in English even if response is translated
- **Position**: Appears above the main response
- **Styling**: Uses `--surface-elevated` background, `--text-muted` text

## Data Flow

```
1. vLLM/Langflow sends stream event:
   { "reasoning": "Let me think...", "text": "The answer is..." }

2. Server extracts and emits:
   event: thinking
   data: { "text": "Let me think..." }

3. Client receives and updates:
   message.thinking += chunk
   message.isThinkingStreaming = true

4. UI renders ThinkingBlock component:
   Shows animated "Thinking..." header
   Collapsible content area

5. On stream end:
   message.isThinkingStreaming = false
   Shimmer stops, block becomes static
```

## Troubleshooting Checklist

- [ ] Backend model is configured to output reasoning
- [ ] Langflow flow includes reasoning extraction
- [ ] Stream events contain `reasoning` or `thinking` field
- [ ] Server logs show `thinkingLength > 0` at end
- [ ] Browser console shows thinking chunks received

## Related Files

- `src/lib/components/chat/ThinkingBlock.svelte` - UI component
- `src/routes/api/chat/stream/+server.ts` - Server extraction logic
- `src/lib/services/streaming.ts` - Client stream handling
- `src/routes/(app)/chat/[conversationId]/+page.svelte` - Message state management

## Design Tokens Used

| Token | Usage |
|-------|-------|
| `--surface-elevated` | Thinking block background |
| `--border-subtle` | Border color |
| `--text-muted` | Text color |
| `--accent` | Shimmer animation color |
| `--duration-standard` | Transitions (150ms) |
