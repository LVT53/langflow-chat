# Memory Evolution Roadmap

This note captures the next-wave memory upgrades to revisit after the current working-documents refactor.

The goal is to move from “good multi-layer memory” toward a system that is closer to self-updating across persona, task, document, and time-sensitive domains.

## Key Upgrade Ideas

### 1. Stronger Domain Separation

Keep these memory classes distinct:

- persona memory
- task/workflow memory
- document memory
- temporal memory
- preference memory

Each one should have its own decay, supersession, and retrieval rules.

### 2. Event-Sourced Memory Updates

Prefer explicit memory events such as:

- deadline extended
- project paused
- project resumed
- preference updated
- document superseded

That is more reliable than inferring everything from snapshots.

### 3. Confidence And Freshness Everywhere

Every memory candidate should eventually carry:

- confidence
- freshness
- provenance
- scope
- supersession status

Temporal memory already does part of this. The rest of the system should catch up.

### 4. Better Active-State Inference

Current “what matters now” should come from:

- current chat
- active workspace document
- recent generated outputs
- recent user corrections
- explicit pause/complete language

This needs to stay local and structured rather than relying only on semantic memory.

### 5. Cross-Domain Contradiction Handling

The system should eventually resolve contradictions such as:

- old deadline vs extended deadline
- old preferred draft vs newer preferred draft
- old active project vs paused or completed project

That requires generalized supersession, not just time-aware decay.

### 6. Maintenance And Repair Loops

Long-term memory quality improves if background maintenance can:

- dedupe memories
- downgrade stale items
- compress redundant clusters
- identify low-confidence facts
- move old working documents from active to historical

### 7. Retrieval That Learns From User Behavior

The system should eventually adapt based on:

- which versions the user reopens
- which outputs keep being refined
- which memories the user corrects
- which artifacts are ignored

That would make salience more self-updating over time.

## Guardrail

Any future memory feature should answer three things clearly:

1. What memory domain does this belong to?
2. Which subsystem is authoritative for it?
3. How does it expire, supersede, or get repaired?

If those answers are not clear, the feature should not be added yet.
