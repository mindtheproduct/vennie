---
name: spec
description: Generate technical specs from PRDs or ideas
context: main
tags: [product]
integrations: []
---

# Technical Spec Generation

Turn a PRD, feature idea, or conversation into a concrete technical spec that engineers can build from.

## Input

Ask what they're speccing:
- "Got a PRD I can work from?" — if yes, read it and use it as the foundation
- "Or just describe what you're building" — if no PRD, extract requirements conversationally

If they reference an existing project in `04-Projects/`, read it for context.

## Questions to Ask

Before writing anything, clarify:

1. **What exists today?** What's the current system look like? What are we changing vs building new?
2. **Technical constraints?** Language, framework, infra, performance requirements, compliance needs?
3. **Who's building this?** Solo dev, small team, cross-team? This affects spec granularity.
4. **What integrations?** APIs, databases, third-party services, internal systems?
5. **What's the data model?** New tables? Schema changes? Migrations needed?

Push for specifics:
- "When you say 'fast,' what latency are we targeting?"
- "When you say 'secure,' what threat model?"
- "When you say 'scalable,' what load? 100 users or 100,000?"

## Edge Cases

This is where specs earn their keep. Ask about:

- Empty states — what happens with no data?
- Error states — what happens when things break?
- Concurrency — what if two users do the same thing simultaneously?
- Permissions — who can do what? What happens when someone can't?
- Backwards compatibility — does this break anything existing?
- Rate limits — what if someone hammers this?
- Data size — what if someone uploads a 500MB file? A 5GB one?

## Cross-Reference

Check existing projects in `04-Projects/` for conflicts:
- Overlapping data models
- Shared services that might be affected
- Timeline conflicts with other work

Flag anything: "Heads up — your user profile spec touches the same auth service as [other project]. Worth coordinating."

## Output

Generate a structured spec:

```markdown
# Technical Spec: [Title]
**Author:** [user]
**Date:** [today]
**PRD:** [link if applicable]
**Status:** Draft

## Overview
[One paragraph: what this is and why]

## Acceptance Criteria
- [ ] [Specific, testable criteria]
- [ ] [Each one should be verifiable]

## Technical Design

### Architecture
[How this fits into the existing system]

### Data Model
[Schema changes, new tables, migrations]

### API Contract
[Endpoints, request/response shapes, status codes]

### Edge Cases & Error Handling
[Specific edge cases and how to handle each]

## Dependencies
[Services, libraries, infrastructure]

## Security Considerations
[Auth, permissions, data handling]

## Performance Requirements
[Latency targets, throughput, resource limits]

## Testing Strategy
[What to test, how to test it]

## Rollout Plan
[Feature flags, gradual rollout, rollback strategy]

## Open Questions
[Things that still need answers]
```

## Saving

- Save to `04-Projects/[project-name]/Spec_[topic].md`
- If there's a PRD in the same project, link them to each other
- Flag any open questions that block engineering work

## End With

"Spec saved. There are [N] open questions that need answers before someone can start building. The riskiest part of this spec is [X] — I'd get a second pair of eyes on that section."
