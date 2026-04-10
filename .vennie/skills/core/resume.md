---
name: resume
description: Generate tailored resumes from your evidence trail
context: main
tags: [career, brand]
integrations: []
---

# Resume Builder

Generate a resume from evidence, not from memory. Your vault already has everything — wins, projects, decisions, growth. Let's turn it into a resume that gets interviews.

## How to Start

"Are you tailoring this to a specific role, or building a general resume?"

If specific role:
- "Got the job posting? (URL or paste it)"
- Parse the posting for: required skills, nice-to-haves, company context, seniority signals
- Map their evidence to each requirement

If general:
- "What kind of roles are you targeting?"
- "What do you want to be known for?"

## Data Sources

Pull from everything:

- `profile.yaml` — career trajectory, current role, skills
- `06-Evidence/Wins/` — quantified accomplishments
- `06-Evidence/Feedback/` — external validation
- `04-Projects/` — scope and outcomes of work
- `03-Decisions/` — judgment and ownership examples

## Resume Principles

**Impact, not responsibilities.** Every bullet should answer "so what?"
- Bad: "Managed the product roadmap"
- Good: "Defined and shipped a product roadmap that increased user activation by 23% in Q3"

**Quantify everything possible.** Numbers make hiring managers stop scanning.
- Revenue, users, performance, time saved, team size, scope

**Tailor ruthlessly.** If applying to a specific role, every bullet should map to something in the job posting. Cut good bullets that aren't relevant.

**Recent and relevant.** Most detail on the last 2-3 years. Older roles get 1-2 bullets max.

**One page.** Two if you have 10+ years of genuinely relevant experience. Otherwise, one. Be ruthless.

## Output Structure

```markdown
# [Name]
[Email] | [Location] | [LinkedIn] | [Portfolio/GitHub if relevant]

## [Current/Most Recent Role] — [Company]
*[Date range]*
- [Impact bullet with metric]
- [Impact bullet with metric]
- [Impact bullet with context]

## [Previous Role] — [Company]
*[Date range]*
- [Impact bullet]
- [Impact bullet]

## Skills
[Relevant skills, tools, technologies — tailored to the role]

## Education / Certifications
[If relevant — skip if self-taught and the evidence speaks for itself]
```

## If Job Posting Provided

Create a match analysis:

```
Requirements Match:
- [Requirement 1]: STRONG — [evidence]
- [Requirement 2]: MODERATE — [evidence, could be stronger]
- [Requirement 3]: GAP — [no direct evidence, but here's how to frame adjacent experience]
```

Suggest how to address gaps in the cover letter or interview.

## ATS Optimization

- Use keywords from the job posting naturally (not keyword-stuffed)
- Standard section headers (Experience, Skills, Education)
- No tables, columns, or fancy formatting that ATS can't parse
- Plain text version available if needed

## Saving

- Save to `08-Resources/Resume_[date].md`
- If tailored: `08-Resources/Resume_[company]_[date].md`

## End With

"Resume saved. Your 3 strongest bullets are [list them]. If the recruiter only reads those, they'll want to talk to you. The one area to prep for in interviews: [gap or area where evidence is thinner]."
