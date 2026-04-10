'use strict';

const fs = require('fs');
const path = require('path');

// --- Paths ---

function historyPath(vaultPath) {
  return path.join(vaultPath, '.vennie', 'gym-history.json');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// --- Seeded random (deterministic per date) ---

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  // Simple LCG for deterministic sequences
  let state = hashString(String(seed));
  return function next() {
    state = (state * 1664525 + 1013904223) | 0;
    return (Math.abs(state) % 10000) / 10000;
  };
}

function seededPick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function seededShuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// --- Exercise template bank ---

const EXERCISE_TYPES = ['prioritisation', 'estimation', 'strategy', 'tradeoff', 'critique', 'stakeholder'];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

// Parameterised templates. Each has a builder function that receives an rng and optional vault context.

const PRIORITISATION_TEMPLATES = [
  {
    build: (rng) => {
      const features = seededShuffle([
        'Dark mode (high demand, low effort, no revenue impact)',
        'SSO integration (3 enterprise deals blocked, medium effort)',
        'Mobile app redesign (declining engagement, high effort)',
        'AI-powered search (differentiator, medium effort, unknown adoption)',
      ], rng);
      return {
        scenario: `You have 4 features competing for 1 engineering sprint (2 weeks, 3 engineers):\n\n1. ${features[0]}\n2. ${features[1]}\n3. ${features[2]}\n4. ${features[3]}`,
        question: 'Rank them and explain your reasoning. What framework are you using?',
        hints: ['Consider ICE or RICE scoring', 'Revenue-blocking items often trump nice-to-haves', 'What does "high demand" actually mean in terms of users?'],
        relatedSkills: ['prioritisation', 'frameworks'],
      };
    },
  },
  {
    build: (rng) => {
      const revenue = seededPick(['$2M', '$5M', '$800K'], rng);
      const users = seededPick(['50K', '120K', '10K'], rng);
      return {
        scenario: `Your product has ${users} MAU and ${revenue} ARR. The backlog has:\n\n1. Performance optimisation (page load 4s -> 1s, affects all users)\n2. New billing system (current one causes 8% failed payments)\n3. Collaboration features (top request from enterprise prospects)\n4. Onboarding redesign (60% drop-off at step 3)`,
        question: 'You can only do 2 this quarter. Which 2 and why?',
        hints: ['Failed payments is direct revenue leakage', 'Quantify the impact of each option', 'What is your growth model — new acquisition or retention?'],
        relatedSkills: ['prioritisation', 'revenue-impact'],
      };
    },
  },
  {
    build: (rng) => {
      const teamSize = seededPick([4, 6, 8], rng);
      return {
        scenario: `You lead a ${teamSize}-person product team. Three stakeholders each want different things:\n\n- **CEO:** "We need to ship the AI feature. Board expects it."\n- **Head of CS:** "Churn is up 15%. Fix the reliability issues first."\n- **VP Sales:** "I need the Salesforce integration to close Q2 pipeline."`,
        question: 'How do you prioritise? What data would you need to make this decision confidently?',
        hints: ['Churn compounds — what is the revenue at risk?', 'Board expectations vs customer retention is a classic tension', 'Can any of these be parallelised with the team size?'],
        relatedSkills: ['prioritisation', 'stakeholder-management'],
      };
    },
  },
  {
    build: (rng) => {
      const segment = seededPick(['SMB', 'mid-market', 'enterprise'], rng);
      return {
        scenario: `Your ${segment} product has a feature request backlog of 200+ items. You need to pick the next 3 to build. You have:\n\n- NPS verbatims (500 responses)\n- Usage analytics showing feature adoption\n- 12 sales call recordings where prospects churned\n- A competitor just launched a feature 40% of your users are asking for`,
        question: 'Walk through your prioritisation process. What signals do you weight most and why?',
        hints: ['Churned prospect recordings are gold — they tell you what you lost on', 'NPS verbatims from promoters vs detractors tell different stories', 'Copying competitors is rarely the right framing — what job are users hiring that feature for?'],
        relatedSkills: ['prioritisation', 'user-research', 'data-analysis'],
      };
    },
  },
  {
    build: (rng) => {
      const deadline = seededPick(['2 weeks', '1 month', '6 weeks'], rng);
      return {
        scenario: `You're ${deadline} from a major product launch. QA finds 3 critical bugs and 12 minor ones. Meanwhile:\n\n1. Marketing has already announced the launch date publicly\n2. One critical bug affects the payment flow (potential revenue loss)\n3. One critical bug is a UI glitch visible on first use (bad first impression)\n4. One critical bug is a data export issue (affects 5% of users)`,
        question: 'What do you ship, what do you delay, and how do you communicate the decision?',
        hints: ['Payment flow bugs are non-negotiable for launch', 'First impressions matter but can be patched quickly', 'Consider a phased rollout strategy'],
        relatedSkills: ['prioritisation', 'launch-management', 'communication'],
      };
    },
  },
  {
    build: () => ({
      scenario: `Your team maintains a platform used by 8 internal teams. Three teams have escalated conflicting requests:\n\n- **Team A:** Needs API rate limit increase (blocking their launch)\n- **Team B:** Needs a new auth mechanism (security audit deadline in 3 weeks)\n- **Team C:** Needs schema migration support (their feature is 2 sprints behind)`,
      question: 'How do you sequence these? What principles guide platform team prioritisation differently from product teams?',
      hints: ['Security deadlines are often hard deadlines with compliance implications', 'Blocking another team\'s launch has a multiplied cost', 'Platform teams must balance reactive support with proactive investment'],
      relatedSkills: ['prioritisation', 'platform-thinking', 'stakeholder-management'],
    }),
  },
  {
    build: (rng) => {
      const pct = seededPick([20, 30, 40], rng);
      return {
        scenario: `Analytics shows ${pct}% of users never return after day 1. You have 4 hypotheses:\n\n1. Onboarding is too long (8 steps)\n2. Core value isn't reached until day 3\n3. Push notifications are annoying users away\n4. Free tier is too limited to demonstrate value`,
        question: 'Design a prioritised experiment plan. What would you test first and how?',
        hints: ['Time to value is usually the #1 retention lever', 'You can test onboarding length with a simple A/B', 'Consider the cost of being wrong for each hypothesis'],
        relatedSkills: ['prioritisation', 'experimentation', 'retention'],
      };
    },
  },
  {
    build: (rng) => {
      const budget = seededPick(['$50K', '$100K', '$200K'], rng);
      return {
        scenario: `You have a ${budget} annual tooling budget. Requests:\n\n1. Amplitude ($30K) — better analytics than current free tool\n2. LaunchDarkly ($15K) — feature flags for safer releases\n3. Figma Enterprise ($20K) — design system collaboration\n4. Datadog ($40K) — observability (currently using CloudWatch)\n5. Linear ($8K) — replace Jira (team morale impact)`,
        question: 'You can\'t afford all of them. Build your stack and justify the cuts.',
        hints: ['Morale tools have outsized impact on velocity', 'Observability prevents revenue loss from outages', 'What is the cost of NOT having each tool?'],
        relatedSkills: ['prioritisation', 'budgeting', 'tooling'],
      };
    },
  },
];

const ESTIMATION_TEMPLATES = [
  {
    build: (rng) => {
      const users = seededPick(['10K', '50K', '200K'], rng);
      return {
        scenario: `A B2B SaaS company with ${users} users wants to add real-time collaboration (Google Docs-style). The team is 5 engineers, 1 designer.`,
        question: 'Estimate: engineering effort (weeks), user adoption rate at 6 months, and infrastructure cost increase. Show your reasoning.',
        hints: ['Real-time collaboration requires CRDT or OT — non-trivial', 'B2B adoption depends heavily on whether it solves a workflow pain', 'WebSocket infrastructure scales differently from HTTP'],
        relatedSkills: ['estimation', 'technical-understanding'],
      };
    },
  },
  {
    build: (rng) => {
      const mau = seededPick(['100K', '500K', '1M'], rng);
      return {
        scenario: `A consumer app with ${mau} MAU wants to add a social feed. Current engagement: 3 sessions/week, 4 min/session. They want to double session length.`,
        question: 'Estimate the team size, timeline, and probability of hitting the engagement target. What are the biggest risks?',
        hints: ['Social feeds are engagement traps that can backfire (toxicity, content moderation)', 'Doubling session length is aggressive — what does the distribution look like?', 'Content supply is the hard part, not the feed algorithm'],
        relatedSkills: ['estimation', 'engagement-metrics'],
      };
    },
  },
  {
    build: (rng) => {
      const current = seededPick(['2s', '4s', '6s'], rng);
      const target = seededPick(['200ms', '500ms', '1s'], rng);
      return {
        scenario: `Your API p95 latency is ${current}. The CEO wants it under ${target} because a key enterprise deal depends on it. Current stack: Node.js, PostgreSQL, Redis cache, deployed on AWS.`,
        question: 'Estimate the effort and approach. What gets you 80% of the way there vs the last 20%?',
        hints: ['Profile before optimising — where is the time spent?', 'Caching strategy changes often give 10x improvements', 'The last 20% of latency reduction costs 80% of the effort'],
        relatedSkills: ['estimation', 'performance', 'technical-understanding'],
      };
    },
  },
  {
    build: (rng) => {
      const price = seededPick([29, 49, 99], rng);
      const freeUsers = seededPick(['50K', '100K', '200K'], rng);
      return {
        scenario: `Your freemium product has ${freeUsers} free users and a $${price}/mo paid tier. You want to introduce a middle tier at $${Math.floor(price * 0.6)}/mo.`,
        question: 'Estimate: conversion rate from free to mid tier, cannibalisation of existing paid tier, and net revenue impact at 12 months.',
        hints: ['Middle tiers often cannibalise more than they convert', 'Look at feature gating — what makes mid tier distinctly valuable?', 'Price anchoring effect — the mid tier reframes the premium tier'],
        relatedSkills: ['estimation', 'pricing', 'monetisation'],
      };
    },
  },
  {
    build: (rng) => {
      const size = seededPick(['Series A', 'Series B', 'Series C'], rng);
      return {
        scenario: `A ${size} startup wants to expand from the US to Europe. Current: 500 US customers, $3M ARR, 30-person team. They want to hit $1M ARR in Europe within 12 months.`,
        question: 'Estimate the investment needed (headcount, localisation, compliance), timeline to first European customer, and probability of hitting the target.',
        hints: ['GDPR compliance alone is a significant workstream', 'Localisation is more than translation — payment methods, cultural norms', 'Consider whether to hire locally or send US team members'],
        relatedSkills: ['estimation', 'go-to-market', 'internationalisation'],
      };
    },
  },
  {
    build: (rng) => {
      const currentNPS = seededPick([15, 25, 35], rng);
      return {
        scenario: `Your product's NPS is ${currentNPS}. Leadership wants it above 50 within 6 months. You have verbatims showing the top complaints: slow performance (30%), missing features (25%), poor mobile experience (20%), confusing pricing (15%), other (10%).`,
        question: 'Estimate how much NPS improvement each initiative could drive. What sequence maximises NPS lift per engineering dollar?',
        hints: ['Performance improvements often have outsized NPS impact', 'Mobile experience affects daily active engagement', 'Pricing confusion creates detractors who are otherwise happy with the product'],
        relatedSkills: ['estimation', 'customer-satisfaction', 'data-analysis'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Your company wants to build an AI copilot feature (LLM-powered). The existing product is a project management tool. You need to estimate costs.',
      question: 'Estimate: development time, monthly LLM API costs at 10K/50K/100K users, and the impact on gross margin. What architecture decisions reduce cost?',
      hints: ['Token costs scale with usage — estimate tokens per interaction', 'Caching common queries can reduce LLM calls by 40-60%', 'Consider a tiered approach: simple queries use smaller models'],
      relatedSkills: ['estimation', 'ai-product', 'unit-economics'],
    }),
  },
  {
    build: (rng) => {
      const pages = seededPick(['50', '200', '500'], rng);
      return {
        scenario: `You're migrating a ${pages}-page marketing site from WordPress to a headless CMS + Next.js. The site gets 2M monthly pageviews and has 15 content editors.`,
        question: 'Estimate the migration timeline, risk of SEO traffic loss, and editor productivity impact during transition.',
        hints: ['URL structure changes are the #1 SEO risk in migrations', 'Content editor training is often underestimated', 'Consider a phased migration — high-traffic pages first'],
        relatedSkills: ['estimation', 'migration', 'technical-planning'],
      };
    },
  },
];

const STRATEGY_TEMPLATES = [
  {
    build: (rng) => {
      const funding = seededPick(['$30M', '$50M', '$100M'], rng);
      const share = seededPick(['60%', '70%', '80%'], rng);
      return {
        scenario: `Company X just raised ${funding} and is entering your market with a free tier. You're the incumbent with ${share} market share but premium pricing ($99/mo minimum).`,
        question: 'What\'s your move? Consider at least 3 strategic options and recommend one.',
        hints: ['Dropping to free is rarely the right response for an incumbent', 'What moat do you have that money can\'t easily replicate?', 'Consider the attacker\'s constraints — VC-funded companies need growth metrics'],
        relatedSkills: ['strategy', 'competitive-response'],
      };
    },
  },
  {
    build: (rng) => {
      const vertical = seededPick(['healthcare', 'fintech', 'edtech', 'logistics'], rng);
      return {
        scenario: `You're a horizontal SaaS tool (project management) considering going vertical into ${vertical}. Current ARR: $10M. The vertical opportunity is estimated at $500M TAM but requires significant compliance/domain investment.`,
        question: 'Build the case for and against. What would you need to see in the data to commit?',
        hints: ['Vertical SaaS typically commands 2-3x pricing over horizontal', 'Compliance investment is ongoing, not one-time', 'Consider a "wedge" strategy — build one killer feature for the vertical first'],
        relatedSkills: ['strategy', 'market-entry', 'vertical-saas'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Your product is a developer tool with strong community adoption (50K GitHub stars, 10K weekly active developers). Revenue is $500K ARR from a basic cloud offering. Competitors are raising big rounds.',
      question: 'Design a monetisation strategy that preserves community goodwill while building a real business. What mistakes do developer tools commonly make?',
      hints: ['Open core vs cloud-only is the central strategic decision', 'Developer community goodwill is a moat — don\'t destroy it', 'Usage-based pricing often works better than seat-based for developer tools'],
      relatedSkills: ['strategy', 'monetisation', 'developer-tools'],
    }),
  },
  {
    build: (rng) => {
      const pct = seededPick([25, 35, 50], rng);
      return {
        scenario: `AI is automating ${pct}% of your product's core use case. Users who adopt AI features complete tasks 3x faster, which means they need your product less. Engagement metrics are trending down for power users.`,
        question: 'How do you respond? This is an existential strategic question. Frame at least 2 fundamentally different approaches.',
        hints: ['If AI makes the task trivial, maybe the product should move up the value chain', 'Faster task completion could mean users do MORE tasks, not fewer', 'Consider the "picks and shovels" angle — can you enable the AI layer?'],
        relatedSkills: ['strategy', 'ai-disruption', 'product-evolution'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Your startup has product-market fit in the US ($5M ARR, 200 customers, 130% NDR). You have 18 months of runway. The board wants you to either: (a) expand to Europe, (b) move upmarket to enterprise, or (c) launch a second product for your existing customer base.',
      question: 'Evaluate all three options. Which maximises long-term enterprise value? Which is the safest bet?',
      hints: ['NDR above 130% suggests your existing customers want more from you', 'European expansion and enterprise sales are both 12+ month investments', '18 months of runway constrains how much you can bet on longer payoff options'],
      relatedSkills: ['strategy', 'growth', 'capital-allocation'],
    }),
  },
  {
    build: (rng) => {
      const acquirer = seededPick(['a Big Tech company', 'a PE firm', 'your largest competitor'], rng);
      return {
        scenario: `You receive an acquisition offer from ${acquirer}. The offer is 8x ARR (your current ARR is $15M, growing 80% YoY). Your team is 40 people. You have 2 years of runway left.`,
        question: 'Framework the decision. What factors beyond the price matter? What would make you say yes vs no?',
        hints: ['80% YoY growth means a higher multiple is likely in 12-18 months', 'Consider team retention — what happens to your people?', 'PE vs strategic acquirer have very different post-acquisition playbooks'],
        relatedSkills: ['strategy', 'm-and-a', 'founder-decisions'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Your B2B product has 3 pricing tiers: Starter ($29), Pro ($79), Enterprise (custom). 70% of revenue comes from Enterprise. But 90% of new signups start at Starter. The conversion funnel from Starter to Pro is 5%, Pro to Enterprise is 15%.',
      question: 'Is your pricing broken? Design a pricing experiment to find out. What metrics would indicate success?',
      hints: ['5% Starter to Pro might indicate a value gap between tiers', 'The Enterprise concentration risk is real — what if you lose 2 big accounts?', 'Consider whether Starter serves as a lead gen funnel or a product tier'],
      relatedSkills: ['strategy', 'pricing', 'experimentation'],
    }),
  },
  {
    build: (rng) => {
      const platform = seededPick(['Slack', 'Shopify', 'Salesforce', 'HubSpot'], rng);
      return {
        scenario: `Your product is a top-rated app on the ${platform} marketplace. 60% of your distribution comes from that marketplace. ${platform} just announced they're building a native version of your core feature.`,
        question: 'What\'s your 90-day plan? What about your 12-month strategy?',
        hints: ['Platform risk is real but platforms rarely execute as well as focused startups', 'Your advantage is depth and customer relationships', 'Consider diversifying distribution while doubling down on what the platform can\'t replicate'],
        relatedSkills: ['strategy', 'platform-risk', 'distribution'],
      };
    },
  },
];

const TRADEOFF_TEMPLATES = [
  {
    build: (rng) => {
      const revPct = seededPick([10, 15, 20], rng);
      const weeks = seededPick([4, 6, 8], rng);
      return {
        scenario: `Your biggest customer (${revPct}% of revenue) wants a custom feature that conflicts with your platform roadmap. The feature would take ${weeks} weeks. If you don't build it, they'll likely churn.`,
        question: 'What do you do? Frame the decision for your CEO.',
        hints: ['Quantify the revenue at risk vs the opportunity cost of roadmap delay', 'Is there a way to build it that advances the platform AND satisfies the customer?', 'Customer concentration above 10% is a structural risk regardless'],
        relatedSkills: ['tradeoff', 'customer-management', 'roadmap'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Your team has been working on a major feature for 3 months (originally scoped at 6 weeks). It\'s 70% done. The market has shifted — a competitor launched something similar last week. Your CEO asks: "Should we keep going or kill it?"',
      question: 'Make the case for each option. What data points would tip you one way or the other?',
      hints: ['Sunk cost fallacy is real — 3 months of work shouldn\'t factor into a forward-looking decision', 'Being second to market isn\'t necessarily bad if you\'re better', 'Consider the team morale cost of killing a project they\'ve invested in'],
      relatedSkills: ['tradeoff', 'sunk-cost', 'execution'],
    }),
  },
  {
    build: (rng) => {
      const techDebt = seededPick(['3 months', '6 months', '1 year'], rng);
      return {
        scenario: `Your engineering team says they need ${techDebt} to address tech debt. Shipping velocity has dropped 40% in the last quarter. Sales is screaming for new features. The next board meeting is in 6 weeks.`,
        question: 'How do you balance short-term delivery pressure with long-term velocity? Present a plan.',
        hints: ['A full stop on features rarely works — find a sustainable allocation', 'Can you frame tech debt work in terms of business outcomes?', 'Consider a "tech debt sprint" — 2 weeks focused, then reassess'],
        relatedSkills: ['tradeoff', 'tech-debt', 'stakeholder-management'],
      };
    },
  },
  {
    build: (rng) => {
      const team = seededPick(['a senior engineer', 'your designer', 'the tech lead'], rng);
      return {
        scenario: `${team} strongly disagrees with the product direction you've chosen. They have valid technical concerns but the business case is strong. The team is watching to see how you handle it.`,
        question: 'How do you navigate this? What\'s your decision-making framework when smart people disagree?',
        hints: ['Disagree and commit only works if people feel genuinely heard', 'Technical concerns often surface real risks — don\'t dismiss them', 'Document the decision and the dissent — you may need to reverse course'],
        relatedSkills: ['tradeoff', 'leadership', 'decision-making'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'You can either ship a feature with 80% polish in 2 weeks or 100% polish in 8 weeks. The feature addresses a pain point that\'s causing 5% monthly churn. Your NPS is already below target.',
      question: 'Ship fast or ship polished? What signals would change your answer?',
      hints: ['5% monthly churn compounds fast — every week matters', 'Shipping at 80% and iterating is different from shipping at 80% and moving on', 'What does the 20% gap actually look like to users?'],
      relatedSkills: ['tradeoff', 'shipping', 'quality-vs-speed'],
    }),
  },
  {
    build: (rng) => {
      const offers = seededPick([2, 3, 4], rng);
      return {
        scenario: `You're hiring a PM. Your top candidate has ${offers} competing offers and wants a 30% higher salary than your budget. They'd be transformative for the team. Your second choice is solid but not exceptional and is within budget.`,
        question: 'How do you think about this? When is it worth breaking the budget?',
        hints: ['A great PM can be worth 5x a good PM in impact', 'Breaking salary bands creates precedent — consider the second-order effects', 'Can you get creative with equity, title, or scope to bridge the gap?'],
        relatedSkills: ['tradeoff', 'hiring', 'resource-allocation'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Your product collects usage data that would be incredibly valuable for training an AI model. Users consented to data collection for "product improvement" but not explicitly for AI training. Your legal team says it\'s a grey area.',
      question: 'What do you do? Frame the ethical, legal, business, and user trust dimensions.',
      hints: ['User trust is a moat — once broken, it\'s nearly impossible to rebuild', 'The legal grey area is likely to be regulated soon', 'Consider an opt-in approach — some users may enthusiastically consent'],
      relatedSkills: ['tradeoff', 'ethics', 'data-privacy'],
    }),
  },
  {
    build: (rng) => {
      const pct = seededPick([5, 10, 15], rng);
      return {
        scenario: `Your free tier costs $${pct}K/mo in infrastructure. ${pct * 5}% of free users never convert. The board wants to cut costs. Your growth team says the free tier is essential for word-of-mouth.`,
        question: 'Design three options ranging from conservative to aggressive. Recommend one.',
        hints: ['Not all free users are equal — segment by engagement and referral potential', 'Limiting the free tier is different from killing it', 'Consider usage-based limits rather than feature-based limits'],
        relatedSkills: ['tradeoff', 'growth', 'unit-economics'],
      };
    },
  },
];

const CRITIQUE_TEMPLATES = [
  {
    build: () => ({
      scenario: `PRD: "Social Features for Project Management Tool"\n\nObjective: Increase engagement by adding social features.\nFeatures: Activity feed, reactions, @mentions, user profiles with bios.\nSuccess metric: DAU increases by 20%.\nTimeline: 8 weeks.\nTarget users: All users.`,
      question: 'Find at least 3 problems with this PRD. Consider: missing edge cases, unclear success metrics, and unstated assumptions.',
      hints: ['"All users" is never a real target — who specifically benefits?', 'DAU is a vanity metric for a project management tool', 'Social features in B2B can backfire — who wants their boss reacting to their task updates?'],
      relatedSkills: ['critique', 'prd-review', 'metrics'],
    }),
  },
  {
    build: () => ({
      scenario: `PRD: "AI-Powered Meeting Summariser"\n\nObjective: Save users time on meeting notes.\nFeatures: Auto-transcription, AI summary, action item extraction, Slack integration.\nSuccess metric: 50% of users adopt within 3 months.\nTimeline: 12 weeks.\nAssumptions: Users want AI-generated summaries. Transcription API is reliable.`,
      question: 'Critique this PRD. What\'s missing, what assumptions are risky, and what would you change?',
      hints: ['50% adoption in 3 months is extremely aggressive for any feature', 'Privacy concerns with meeting recording aren\'t mentioned', 'What happens when the AI summary is wrong? What\'s the correction mechanism?'],
      relatedSkills: ['critique', 'prd-review', 'ai-product'],
    }),
  },
  {
    build: (rng) => {
      const conversion = seededPick(['5%', '10%', '15%'], rng);
      return {
        scenario: `PRD: "Gamification System"\n\nObjective: Increase feature adoption via gamification.\nFeatures: Points, badges, leaderboards, streaks, achievement notifications.\nSuccess metric: Feature adoption rate increases from ${conversion} to ${parseInt(conversion) * 3}%.\nTimeline: 6 weeks.\nTarget: Free tier users to encourage upgrade.`,
        question: 'What\'s wrong with this approach? Be specific about the assumptions and risks.',
        hints: ['Gamification layered on top of a product rarely works — it needs to be intrinsic', 'Leaderboards in B2B can create toxic dynamics', '3x improvement is a massive assumption — what evidence supports it?'],
        relatedSkills: ['critique', 'prd-review', 'engagement'],
      };
    },
  },
  {
    build: () => ({
      scenario: `PRD: "Marketplace Feature"\n\nObjective: Create a third-party integration marketplace.\nFeatures: App listing, install flow, developer portal, review system, revenue sharing (70/30).\nSuccess metric: 50 apps listed within 6 months.\nTimeline: 16 weeks.\nAssumptions: Developers will build integrations if we build the platform.`,
      question: 'This is a classic "if we build it, they will come" PRD. Tear it apart constructively.',
      hints: ['Marketplaces have a cold start problem — 50 apps means nothing if they\'re low quality', '70/30 rev share is standard but developer acquisition costs are high', 'Developer experience (DX) is the make-or-break, not the listing page'],
      relatedSkills: ['critique', 'prd-review', 'marketplace', 'platform'],
    }),
  },
  {
    build: () => ({
      scenario: `PRD: "Enterprise Admin Dashboard"\n\nObjective: Reduce support tickets from enterprise admins by 40%.\nFeatures: User management, role-based access, audit logs, usage analytics, SSO config UI.\nSuccess metric: Support ticket volume drops 40% in 3 months.\nTimeline: 10 weeks.\nTarget: Enterprise admins (accounts with 100+ seats).`,
      question: 'This PRD is better than most. Find the subtle issues — the things that would cause problems 6 months after launch.',
      hints: ['Which support tickets? Not all tickets are equal — categorise first', 'Self-serve SSO config is notoriously complex and error-prone', 'Audit logs without export/search are useless to compliance teams'],
      relatedSkills: ['critique', 'prd-review', 'enterprise'],
    }),
  },
  {
    build: () => ({
      scenario: `PRD: "Mobile App v1"\n\nObjective: Extend our web product to mobile.\nFeatures: Core feature parity with web, push notifications, offline mode, biometric auth.\nSuccess metric: 30% of web users adopt mobile within 6 months.\nTimeline: 16 weeks with 2 mobile engineers.\nPlatform: React Native (cross-platform).`,
      question: 'Critique the scope, timeline, and strategic assumptions.',
      hints: ['Feature parity with web is almost always the wrong v1 goal', '16 weeks for offline mode + full feature parity + cross-platform is very aggressive', 'What is mobile uniquely good for that web isn\'t? Lead with that.'],
      relatedSkills: ['critique', 'prd-review', 'mobile', 'scoping'],
    }),
  },
  {
    build: () => ({
      scenario: `PRD: "Usage-Based Pricing Migration"\n\nObjective: Migrate from seat-based to usage-based pricing.\nFeatures: Usage metering, billing dashboard, overage alerts, self-serve plan changes.\nSuccess metric: ARPU increases 25% within 2 quarters.\nTimeline: 12 weeks.\nMigration: All existing customers moved to new pricing on launch day.`,
      question: 'This pricing migration has a buried landmine. Find it, and find at least 2 other issues.',
      hints: ['Moving ALL existing customers on launch day is the landmine — some will see price increases', 'Usage-based pricing needs usage visibility BEFORE the switch, not at launch', 'What happens to customers whose usage is spiky? Bill shock kills retention.'],
      relatedSkills: ['critique', 'prd-review', 'pricing', 'migration'],
    }),
  },
  {
    build: () => ({
      scenario: `PRD: "Content Recommendation Engine"\n\nObjective: Increase content consumption by personalising the experience.\nFeatures: Collaborative filtering, content-based filtering, trending section, "For You" feed.\nSuccess metric: Average session duration increases 30%.\nTimeline: 8 weeks.\nData: 6 months of browsing history, 100K users.`,
      question: 'Evaluate the technical feasibility, metric choice, and user experience implications.',
      hints: ['100K users with 6 months of data may not be enough for collaborative filtering', 'Session duration can increase for bad reasons (confusion, rage-clicking)', 'Recommendation engines create filter bubbles — is that acceptable for your use case?'],
      relatedSkills: ['critique', 'prd-review', 'ml-product', 'metrics'],
    }),
  },
];

const STAKEHOLDER_TEMPLATES = [
  {
    build: () => ({
      scenario: 'Your CEO wants to pivot to AI. Your VP of Engineering says the team isn\'t ready (no ML experience). Your Head of Sales says customers are asking for it. Your Head of CS says the current product still has reliability issues.',
      question: 'You\'re the product lead. Frame the decision, identify what data you need, and propose a path forward that acknowledges all perspectives.',
      hints: ['AI doesn\'t have to mean ML — consider what "AI features" actually means for your product', 'The VP of Eng may be right about readiness but wrong about timeline', 'Customer requests for "AI" often mask specific workflow needs'],
      relatedSkills: ['stakeholder-management', 'decision-framing'],
    }),
  },
  {
    build: (rng) => {
      const role = seededPick(['CFO', 'CMO', 'CRO'], rng);
      return {
        scenario: `The ${role} is pushing for a feature that would generate short-term revenue but compromise the user experience. They have data showing it would add $2M ARR. Your UX research shows it would increase churn by 8% over 6 months.`,
        question: 'How do you present the counter-argument without being the person who always says no? Build a compelling case.',
        hints: ['Quantify the churn cost — 8% churn on what base? Compare to $2M gain.', 'Frame it as "AND" not "OR" — is there a version that captures revenue WITHOUT the UX damage?', 'Bring alternatives, not just objections'],
        relatedSkills: ['stakeholder-management', 'influence', 'data-driven-decisions'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'You\'re in a product review meeting. The CEO, VP Eng, VP Design, and Head of Data are all present. The CEO wants to ship faster. VP Eng wants more testing. VP Design wants another iteration. Head of Data says the A/B test results are inconclusive.',
      question: 'Everyone is right from their perspective. How do you run this meeting and get to a decision in 30 minutes?',
      hints: ['Define the decision criteria BEFORE discussing options', 'Inconclusive A/B results are still data — what did you learn?', 'Sometimes the meta-decision is "what would we need to see to decide?"'],
      relatedSkills: ['stakeholder-management', 'facilitation', 'decision-making'],
    }),
  },
  {
    build: (rng) => {
      const quarter = seededPick(['Q1', 'Q2', 'Q3', 'Q4'], rng);
      return {
        scenario: `It's ${quarter} planning. You have 3 teams and 5 workstreams. Sales wants all resources on a key account feature. Product wants to invest in platform. Engineering wants to reduce on-call burden. Support wants self-serve tools.`,
        question: 'Design a resource allocation proposal that gives each stakeholder something meaningful while maintaining strategic focus.',
        hints: ['A portfolio approach (70/20/10) often works better than winner-take-all', 'On-call burden is an engineering sustainability issue — ignoring it has compounding costs', 'Self-serve tools reduce support costs AND improve customer experience — it\'s a two-fer'],
        relatedSkills: ['stakeholder-management', 'resource-allocation', 'planning'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Your board member (former CEO of a competing company) keeps suggesting features based on how they built their product 5 years ago. The market has changed significantly. Your CEO listens to them because of their reputation.',
      question: 'How do you respectfully redirect board influence without creating political problems? Build a strategy.',
      hints: ['Acknowledge their experience while reframing for current market context', 'Use data and customer evidence — it\'s harder to argue with customers than with PMs', 'Consider pre-briefing the board member before meetings — make them an ally, not an obstacle'],
      relatedSkills: ['stakeholder-management', 'managing-up', 'board-dynamics'],
    }),
  },
  {
    build: () => ({
      scenario: 'You just joined a company as Head of Product. The engineering team has been shipping without product involvement for 2 years. They\'re proud of what they\'ve built and see product management as overhead. The CEO hired you to "bring structure."',
      question: 'How do you earn the engineering team\'s trust without slowing them down? What\'s your 30/60/90 day plan?',
      hints: ['Lead with listening, not process', 'Find a quick win where product thinking demonstrably helps', 'Structure should feel like clarity, not bureaucracy'],
      relatedSkills: ['stakeholder-management', 'team-building', 'change-management'],
    }),
  },
  {
    build: (rng) => {
      const region = seededPick(['APAC', 'EMEA', 'LATAM'], rng);
      return {
        scenario: `Your ${region} sales team is upset. They feel the product roadmap only serves US customers. They have 3 specific feature requests that would unlock $5M in regional pipeline. The requests conflict with your global platform strategy.`,
        question: 'How do you handle this? When should you build region-specific features vs hold the global line?',
        hints: ['$5M in pipeline is not $5M in revenue — what\'s the close probability?', 'Sometimes regional requests reveal gaps in the platform that help everyone', 'Consider a regional advisory board to channel feedback productively'],
        relatedSkills: ['stakeholder-management', 'internationalisation', 'sales-alignment'],
      };
    },
  },
  {
    build: () => ({
      scenario: 'Two of your peer product managers are fighting over the same engineering resources. Both have valid business cases. You\'re the senior PM and your VP asks you to mediate.',
      question: 'How do you resolve this fairly? What framework do you use? How do you maintain relationships with both PMs?',
      hints: ['Shared criteria remove the feeling of favouritism', 'Can the work be sequenced rather than chosen? First doesn\'t mean only.', 'Consider whether the conflict reveals a structural problem in team topology'],
      relatedSkills: ['stakeholder-management', 'conflict-resolution', 'peer-leadership'],
    }),
  },
];

// Map type to template bank
const TEMPLATE_BANKS = {
  prioritisation: PRIORITISATION_TEMPLATES,
  estimation: ESTIMATION_TEMPLATES,
  strategy: STRATEGY_TEMPLATES,
  tradeoff: TRADEOFF_TEMPLATES,
  critique: CRITIQUE_TEMPLATES,
  stakeholder: STAKEHOLDER_TEMPLATES,
};

// --- Vault context for personalisation ---

function getVaultContext(vaultPath) {
  if (!vaultPath) return null;

  const context = { projects: [], people: [], decisions: [] };
  let hasAnything = false;

  // Check for projects
  const projectsDir = path.join(vaultPath, '04-Projects');
  if (fs.existsSync(projectsDir)) {
    try {
      const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          context.projects.push(entry.name.replace(/_/g, ' '));
          hasAnything = true;
        }
      }
    } catch {
      // ignore
    }
  }

  // Check for people
  const peopleDir = path.join(vaultPath, '05-Areas', 'People');
  if (fs.existsSync(peopleDir)) {
    try {
      const gather = (dir) => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
        for (const f of files) {
          context.people.push(f.replace('.md', '').replace(/_/g, ' '));
          hasAnything = true;
        }
      };
      gather(path.join(peopleDir, 'Internal'));
      gather(path.join(peopleDir, 'External'));
    } catch {
      // ignore
    }
  }

  return hasAnything ? context : null;
}

function buildPersonalisedExercise(vaultContext, type, rng) {
  // Only occasionally personalise (30% chance) and only if we have context
  if (!vaultContext || rng() > 0.3) return null;
  if (vaultContext.projects.length === 0) return null;

  const project = seededPick(vaultContext.projects, rng);
  const person = vaultContext.people.length > 0 ? seededPick(vaultContext.people, rng) : 'a key stakeholder';

  const personalisedTemplates = {
    prioritisation: {
      scenario: `Your project "${project}" is competing for resources with 3 other initiatives. ${person} has flagged it as their top priority, but your data suggests another project has higher ROI.`,
      question: 'How do you navigate this? Build a recommendation with evidence.',
      hints: ['Stakeholder priority and ROI don\'t always align — that\'s normal', 'Can you reframe the conversation around shared goals?', 'What data would make this decision obvious?'],
      relatedSkills: ['prioritisation', 'stakeholder-management'],
    },
    tradeoff: {
      scenario: `Your project "${project}" is behind schedule. ${person} suggests cutting scope to hit the deadline. The cut would remove a feature that 3 prospects asked about.`,
      question: 'What do you cut, what do you keep, and how do you communicate the decision?',
      hints: ['Prospect requests are signals, not commitments', 'Is the deadline real or arbitrary?', 'What is the minimum viable scope that still delivers value?'],
      relatedSkills: ['tradeoff', 'scoping', 'communication'],
    },
    strategy: {
      scenario: `"${project}" has been running for 6 months. Adoption is 40% below target. ${person} believes in the vision but the numbers don\'t lie.`,
      question: 'Do you pivot, persevere, or kill it? What\'s your framework?',
      hints: ['Talk to the users who DID adopt — what do they love?', '6 months might not be enough for some product categories', 'Pivot doesn\'t mean start over — can you redirect existing work?'],
      relatedSkills: ['strategy', 'product-market-fit'],
    },
    stakeholder: {
      scenario: `${person} disagrees with your proposed direction for "${project}". They have more organisational influence but you have better user data. The exec team meeting is tomorrow.`,
      question: 'How do you prepare? What\'s your approach in the room?',
      hints: ['Pre-wire where possible — never surprise stakeholders in a group setting', 'Lead with user evidence, not opinions', 'Find common ground before presenting differences'],
      relatedSkills: ['stakeholder-management', 'influence'],
    },
  };

  return personalisedTemplates[type] || null;
}

// --- Core functions ---

function generateExercise(vaultPath) {
  const today = new Date().toISOString().slice(0, 10);
  const rng = seededRandom(today);

  // Pick type deterministically
  const type = seededPick(EXERCISE_TYPES, rng);
  const difficulty = seededPick(DIFFICULTIES, rng);

  // Try personalised first
  const vaultContext = getVaultContext(vaultPath);
  const personalised = buildPersonalisedExercise(vaultContext, type, rng);

  let exerciseContent;
  if (personalised) {
    exerciseContent = personalised;
  } else {
    // Pick from template bank
    const bank = TEMPLATE_BANKS[type];
    const template = seededPick(bank, rng);
    exerciseContent = template.build(rng);
  }

  return {
    id: `gym-${today}`,
    type,
    scenario: exerciseContent.scenario,
    question: exerciseContent.question,
    hints: exerciseContent.hints,
    difficulty,
    relatedSkills: exerciseContent.relatedSkills,
  };
}

function getExerciseHistory(vaultPath) {
  const file = historyPath(vaultPath);
  if (!fs.existsSync(file)) {
    return { exercises: [] };
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return {
      exercises: Array.isArray(data.exercises) ? data.exercises : [],
    };
  } catch {
    return { exercises: [] };
  }
}

function writeHistory(vaultPath, history) {
  const file = historyPath(vaultPath);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(history, null, 2), 'utf8');
}

function markExerciseCompleted(vaultPath, exerciseId, notes) {
  if (!exerciseId || typeof exerciseId !== 'string') {
    throw new Error('Exercise ID is required');
  }

  const history = getExerciseHistory(vaultPath);

  // Check for duplicate
  const existing = history.exercises.find((e) => e.id === exerciseId);
  if (existing) {
    existing.completedAt = new Date().toISOString();
    if (notes) existing.notes = notes;
  } else {
    history.exercises.push({
      id: exerciseId,
      completedAt: new Date().toISOString(),
      notes: notes || null,
    });
  }

  writeHistory(vaultPath, history);
  return { marked: true, exerciseId };
}

function getStreak(vaultPath) {
  const history = getExerciseHistory(vaultPath);
  if (history.exercises.length === 0) {
    return { streak: 0, lastCompleted: null };
  }

  // Get unique completion dates, sorted newest first
  const dates = new Set();
  for (const ex of history.exercises) {
    if (ex.completedAt) {
      dates.add(ex.completedAt.slice(0, 10));
    }
  }

  const sortedDates = Array.from(dates).sort().reverse();
  if (sortedDates.length === 0) {
    return { streak: 0, lastCompleted: null };
  }

  // Count consecutive days from today (or yesterday if today not completed)
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let checkDate = new Date(today);

  // If today isn't completed, start from yesterday
  if (sortedDates[0] !== today) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (dates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    streak,
    lastCompleted: sortedDates[0],
    totalCompleted: history.exercises.length,
  };
}

function formatExercise(exercise) {
  const lines = [];
  const divider = '─'.repeat(50);

  lines.push('');
  lines.push(divider);
  lines.push(`  PRODUCT GYM  |  ${exercise.type.toUpperCase()}  |  ${exercise.difficulty.toUpperCase()}`);
  lines.push(divider);
  lines.push('');
  lines.push(`  ${exercise.id}`);
  lines.push('');

  // Word-wrap scenario
  const scenarioLines = exercise.scenario.split('\n');
  for (const line of scenarioLines) {
    lines.push(`  ${line}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push(`  QUESTION: ${exercise.question}`);
  lines.push('');

  if (exercise.hints && exercise.hints.length > 0) {
    lines.push('  HINTS (reveal if stuck):');
    for (let i = 0; i < exercise.hints.length; i++) {
      lines.push(`    ${i + 1}. ${exercise.hints[i]}`);
    }
    lines.push('');
  }

  if (exercise.relatedSkills && exercise.relatedSkills.length > 0) {
    lines.push(`  Skills: ${exercise.relatedSkills.join(', ')}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  return lines.join('\n');
}

module.exports = {
  generateExercise,
  getExerciseHistory,
  markExerciseCompleted,
  getStreak,
  formatExercise,
};
