---
name: quarterly-review
description: Quarterly review — goals, evidence, growth, and next quarter planning
context: main
tags: [system]
integrations: []
---

# Quarterly Review

The big one. Look back at the quarter, take stock of what happened, and set direction for the next one.

## The Process

### 1. Review Quarter Goals

Pull from `01-Goals/` for the current/ending quarter:

For each goal:
- **Status:** Achieved / Partially achieved / Missed / Pivoted
- **Key results:** Which hit? Which didn't? Why?
- **Unexpected outcomes:** Anything happen that wasn't in the goals but was significant?

Be honest in the assessment. Partially achieved is fine — it's data, not a grade.

"Let's be real about the quarter. What do the numbers say?"

### 2. Compile Quarter Evidence

Pull from `06-Evidence/` for the quarter:

- Total wins captured
- Wins by type (shipping, metrics, feedback, decisions, growth)
- Strongest evidence (most metrics, highest impact)
- Gaps in evidence coverage

Generate a quarterly brag sheet (same as `/brag` but scoped to the quarter):
- Top 10 accomplishments with metrics
- Key decisions and their outcomes
- Growth areas demonstrated

### 3. Career Trajectory Update

If career profile exists:
- "Has your role changed this quarter? Title, scope, responsibilities?"
- "New skills developed?"
- "Career trajectory — are you where you expected to be 3 months ago?"
- Update career trajectory in `profile.yaml`

### 4. Deep Reflection

These questions matter. Don't rush them:

- "What was the single most impactful thing you did this quarter?"
- "What was the biggest surprise? Something you didn't expect?"
- "What would you do differently if you could redo the quarter?"
- "Where did you grow the most? Where did you avoid growing?"
- "What patterns are you noticing across quarters?"

### 5. Set Next Quarter Goals

Guide goal-setting:

- "What are the 3-5 most important things for next quarter?"
- For each goal, define 2-3 key results (specific, measurable)
- Check alignment: "Does this connect to your bigger career goals?"
- Check feasibility: "Last quarter you set [N] goals and hit [N]. Is this achievable?"
- Challenge ambition: "Is this stretching you, or is it comfortable?"

Format:

```markdown
## Q[N] Goals

### Goal 1: [Title]
**Why:** [Why this matters]
**Key Results:**
- [ ] KR1: [Specific, measurable]
- [ ] KR2: [Specific, measurable]
- [ ] KR3: [Specific, measurable]
```

### 6. Update Context Files

- Update `profile.yaml` with career trajectory changes
- Archive completed goals
- Roll forward any goals that are continuing
- Update personality model with quarter-level observations

## Output

```markdown
# Quarterly Review — Q[N] [Year]

## Goals Assessment
| Goal | Status | Key Insight |
|------|--------|-------------|
| ... | ... | ... |

## Quarter by the Numbers
- Wins captured: [N]
- Decisions made: [N]
- Projects shipped: [N]
- Goals achieved: [N/M]

## Top Accomplishments
1. [Best win with metric]
2. [Second]
3. [Third]

## Growth & Learnings
[Key reflections]

## What Worked
[Patterns and practices to continue]

## What to Change
[Patterns and practices to adjust]

## Next Quarter Goals
[Goals with key results]
```

## Saving

- Save review to `01-Goals/QN_YYYY_Review.md`
- Save quarterly brag sheet to `06-Evidence/Brag_Sheets/`
- Save next quarter goals to `01-Goals/`
- Archive completed items to `07-Archives/` (if applicable)

## Tone

Reflective but forward-looking. Celebrate what went well, be honest about what didn't, and get excited about what's next.

"Strong quarter. You shipped [N] things, made [N] decisions, and grew in [areas]. The thing I'd carry forward is [insight]. Ready to set up Q[next]?"

## End With

"Quarter reviewed. Your brag sheet has [N] wins — strong foundation for your next review. Next quarter's goals are set. Most important one: [goal 1]. Let's make it happen."
