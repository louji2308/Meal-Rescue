# Meal Rescue - Product Management Specification

## Document Purpose

This document serves as the **single source of truth** for product decisions, feature prioritization, user stories, and success metrics. It is designed to be used by product managers, engineers, and designers throughout the development lifecycle.

---

## Executive Summary

### Product Vision

**Meal Rescue** is an AI meal companion that looks at what you're already about to eat and finds the smallest realistic change that makes it better.

### Problem Statement

People want to eat better but face significant friction:
- Don't have time for meal planning
- Don't want to waste food they already have
- Get overwhelmed by recipe apps requiring many ingredients
- Feel guilty about unhealthy meals but don't know how to improve them
- Have tried nutrition apps but found them restrictive and judgmental

### Solution

A minimum-intervention decision engine that:
1. Starts from food you already have (not a search box)
2. Makes one small, practical improvement (not a complete replacement)
3. Learns your preferences over time (not generic advice)
4. Respects your constraints (time, budget, cooking ability)
5. Never judges or restricts (positive, encouraging approach)

### Target Users

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Busy Professional** | 25-40, works long hours, orders takeout frequently | Quick improvements to convenience food |
| **College Student** | 18-24, limited budget, minimal cooking skills | Make ramen and instant food less unhealthy |
| **Parent** | 30-45, cooks for family, deals with leftovers | Use what's available, reduce waste |
| **Health-Conscious Beginner** | 25-50, wants to eat better but overwhelmed | Simple improvements without diet culture |

---

## Product Principles

### What We Are

✅ **A rescue tool** - Meet users where they are
✅ **Minimal intervention** - One small change, not overhaul
✅ **Preference-based** - Learn what works for each user
✅ **Constraint-aware** - Respect time, budget, equipment
✅ **Positive framing** - Encouraging, never judgmental
✅ **Practical** - Actually doable in real life

### What We Are NOT

❌ **A recipe app** - No search boxes, no recipe databases
❌ **A calorie tracker** - No numbers optimization
❌ **A diet plan** - No restrictions, no meal plans
❌ **A nutrition chatbot** - One action, not conversation
❌ **A food scanner** - Recognition is input, not product
❌ **A health app** - No medical claims, no diagnoses

---

## Feature Prioritization

### MoSCoW Framework

#### MUST HAVE (MVP)

| ID | Feature | User Story | Acceptance Criteria |
|----|---------|------------|---------------------|
| M1 | Photo meal capture | As a user, I want to photograph my meal so I don't have to type | Photo uploads successfully, AI returns analysis within 3 seconds |
| M2 | Text meal input | As a user, I want to type what I'm eating so I can use the app without camera | Text input accepted, structured extraction works |
| M3 | Constraint selection | As a user, I want to quickly specify my constraints so the app respects my situation | Tappable shortcuts for time, budget, cooking; all optional |
| M4 | Minimum Intervention Engine | As a user, I want one best recommendation so I'm not overwhelmed | Exactly one primary recommendation with clear reasoning |
| M5 | Feedback collection | As a user, I want to rate how the rescue worked so the app learns | Three-tap feedback (better/same/not for me) + optional text |
| M6 | Preference memory | As a user, I want the app to remember my preferences so recommendations improve | Avoided foods avoided in future, favorites preferred |
| M7 | Subscription paywall | As a business, I need to convert free users to paid to sustain the product | RevenueCat integration, 3 rescues/day free limit enforced |

#### SHOULD HAVE (V2)

| ID | Feature | User Story | Acceptance Criteria |
|----|---------|------------|---------------------|
| S1 | Fridge Negotiator | As a user with random ingredients, I want meal ideas so I don't order takeout | Enter ingredients → get up to 3 meal options |
| S2 | Leftover Alchemist | As a user with leftovers, I want transformation ideas so I don't get bored | Photo leftovers → get 3 format transformations |
| S3 | "What Can I Add?" mode | As a user who wants options, I want to see multiple additions so I can choose | Show 2-4 addition options categorized by benefit |
| S4 | Voice input | As a user with full hands, I want to speak my meal so it's easier | Speech-to-text accuracy >90% for food terms |
| S5 | Shareable rescue cards | As a user who loves a rescue, I want to share it so friends can try | Generate image card, share to social platforms |
| S6 | Smart notifications | As a busy user, I want timely reminders so I don't forget to use the app | Contextual notifications based on meal patterns |

#### COULD HAVE (V3)

| ID | Feature | User Story | Business Value |
|----|---------|------------|----------------|
| C1 | Household profiles | As a parent, I want separate profiles for family members so preferences are accurate | Increases household LTV |
| C2 | Grocery integration | As a planner, I want to know what to buy so future rescues are easier | Partnership opportunities |
| C3 | Restaurant mode | As a frequent diner-out, I want menu improvement tips so I make better choices | Expands use cases |
| C4 | Recipe import | As a cook, I want to improve recipes I find elsewhere so they're healthier | Increases engagement |
| C5 | Nutritionist partnerships | As a professional, I want to recommend this to clients so they get ongoing support | B2B revenue stream |

#### WON'T HAVE (For Now)

| Feature | Reason for Exclusion |
|---------|----------------------|
| Calorie tracking | Violates core philosophy |
| Macro counting | Numbers optimization, not rescue |
| Meal planning | Solves problem in advance, not at moment |
| Social feed | Distraction from core loop |
| Gamification/streaks | Wrong psychological hook |
| Recipe database | Becomes recipe app, not rescue tool |

---

## User Stories (Detailed)

### Epic 1: Meal Capture & Analysis

#### US-1.1: Photo Capture

**As a** hungry user with food in front of me
**I want to** photograph my meal
**So that** I don't have to manually describe it

**Acceptance Criteria:**
- Camera opens within 1 second of tapping
- Photo preview shown before upload
- Upload progress indicator visible
- Returns to app after photo taken
- Works in low light conditions
- Handles common angles (top-down, side view)

**Technical Notes:**
- Use expo-camera for React Native
- Compress image before upload (max 1MB)
- Cache locally for offline retry

**Design Notes:**
- Full-screen camera view
- Shutter button prominent
- Flash toggle available
- Gallery import option

---

#### US-1.2: Meal Understanding Display

**As a** user who just captured my meal
**I want to** see what the AI detected
**So that** I can confirm it's correct before getting recommendations

**Acceptance Criteria:**
- Shows detected foods as chips/tags
- Shows confidence indicators visually
- Edit button clearly visible
- "Is this correct?" prompt with Yes/Edit options
- Uncertainty flagged when confidence <70%

**Technical Notes:**
- Display JSON from meal analysis endpoint
- Confidence thresholds: green (>0.8), yellow (0.6-0.8), red (<0.6)
- Edit opens text input pre-filled

**Design Notes:**
- Clean, scannable layout
- Food items as rounded chips
- Edit icon on each item
- Confirmation checkbox

---

### Epic 2: Constraint Selection

#### US-2.1: Quick Constraints

**As a** time-pressed user
**I want to** tap quick constraint shortcuts
**So that** I don't fill out long forms

**Acceptance Criteria:**
- Six default constraints available as tappable chips
- ⏱ 5 minutes (time)
- 🍳 No cooking (preparation)
- 💰 Keep it cheap (budget)
- 🥡 Eating outside (location)
- ❤️ Keep my favorite food (preference lock)
- 🚫 Don't use [ingredient] (exclusion)
- All constraints optional, can skip all
- Selected constraints visually distinct
- Can add custom exclusions

**Technical Notes:**
- Store as bitmask or flags
- Send to backend as constraints object
- Custom exclusions saved to user preferences

**Design Notes:**
- Horizontal scroll for constraints
- Selected state = filled color
- Unselected = outline only
- "+" button for custom exclusion

---

### Epic 3: Rescue Generation

#### US-3.1: Single Recommendation Display

**As a** overwhelmed user
**I want to** see exactly one best rescue
**So that** I'm not paralyzed by choice

**Acceptance Criteria:**
- One primary recommendation prominently displayed
- Format: "Your meal: X | Rescue: Y | Why: Z"
- Time estimate shown
- Effort level indicated (Low/Medium/High)
- "Uses what you have" badge if applicable
- Four action buttons below:
  - Rescue My Meal (primary CTA)
  - Swap (see alternative)
  - I Don't Have These (regenerate)
  - Keep It As-Is (skip)

**Technical Notes:**
- From ranked candidates, show #1
- Alternatives cached for "Swap"
- Track which button tapped for learning

**Design Notes:**
- Card-based layout
- Clear visual hierarchy
- Primary CTA most prominent
- Secondary actions less emphasized

---

### Epic 4: Feedback & Learning

#### US-4.1: Post-Meal Feedback

**As a** user who tried a rescue
**I want to** quickly rate how it worked
**So that** the app learns my preferences

**Acceptance Criteria:**
- Prompt appears 30 minutes after rescue completion (or manual trigger)
- Three emoji options: 😊 Better | 😐 Same | 🙁 Not for me
- Optional text field: "What worked or didn't?"
- Skip option available
- Thank you message after submission

**Technical Notes:**
- Push notification scheduled at rescue_time + 30min
- Feedback stored in feedback table
- Triggers preference update pipeline

**Design Notes:**
- Friendly, casual tone
- Emoji large and tappable
- Text field expands on focus
- Progress indicator if multi-step

---

#### US-4.2: Preference Evolution Display

**As a** curious user
**I want to** see how the app is learning about me
**So that** I trust the personalization

**Acceptance Criteria:**
- Profile page shows learned preferences
- Categories:
  - Favorite foods (with confidence)
  - Avoided foods (with reason if provided)
  - Typical time constraints
  - Common cooking tolerance
- "App is learning" message on home screen after N rescues
- Option to correct/remove preferences

**Technical Notes:**
- Query preferences table ordered by confidence
- Threshold for display: confidence > 0.7
- Edit triggers preference update

**Design Notes:**
- Settings-like layout
- Swipe to delete preferences
- Toggle for active/inactive
- "Learn more" explainer

---

## Success Metrics

### North Star Metric

**Weekly Active Users Completing Full Loop**
- Definition: Users who capture meal → get rescue → provide feedback within 7 days
- Target: 40% of signups by week 4

### Key Performance Indicators

| Metric | Formula | Baseline | Target (Month 3) | Target (Month 6) |
|--------|---------|----------|------------------|------------------|
| **Successful Rescue Rate** | accepted rescues ÷ total recommendations | N/A | >65% | >75% |
| **Rescue Satisfaction Rate** | "Better" feedback ÷ completed rescues | N/A | >60% | >70% |
| **Day 1 Retention** | D1 active ÷ Day 0 signups | N/A | >35% | >40% |
| **Day 7 Retention** | D7 active ÷ Day 0 signups | N/A | >20% | >25% |
| **Day 30 Retention** | D30 active ÷ Day 0 signups | N/A | >10% | >15% |
| **Free → Pro Conversion** | Pro users ÷ total users | N/A | >5% | >8% |
| **Virality Coefficient** | Invites sent per user × conversion rate | N/A | >0.3 | >0.5 |
| **Time to First Rescue** | Avg minutes from signup to first rescue | N/A | <5 min | <3 min |

### Guardrail Metrics

| Metric | Why It Matters | Threshold |
|--------|----------------|-----------|
| App crash rate | Quality indicator | <0.5% |
| API error rate | Backend reliability | <1% |
| P95 latency | User experience | <3 seconds |
| Negative feedback rate | Product-market fit warning | <20% |
| Uninstall rate | Long-term viability | <5% monthly |

---

## Go-to-Market Strategy

### Launch Phases

#### Phase 1: Closed Beta (Week 1-4)
- 100 users max
- Invite-only (friends, family, colleagues)
- Daily check-ins, rapid iteration
- Goal: Validate core loop works

#### Phase 2: Open Beta (Week 5-8)
- 1,000 users target
- Product Hunt launch
- Social media presence
- Goal: Prove retention metrics

#### Phase 3: Public Launch (Week 9-12)
- App Store Optimization
- Paid user acquisition test ($5-10/user)
- PR outreach (tech blogs, food blogs)
- Goal: Sustainable growth loop

#### Phase 4: Scale (Week 13+)
- Increase ad spend if CAC < LTV/3
- Influencer partnerships
- Content marketing (meal rescue stories)
- Goal: 10,000 MAU

### User Acquisition Channels

| Channel | Expected CAC | Expected LTV | Priority |
|---------|--------------|--------------|----------|
| App Store Organic | $0-2 | $50 | High |
| Product Hunt | $0-1 | $40 | High |
| Social Media (organic) | $0-5 | $35 | Medium |
| Paid Social (Instagram) | $5-15 | $45 | Test |
| Influencer Partnerships | $10-20 | $50 | Medium |
| Content Marketing | $5-10 | $55 | Medium |
| Referral Program | $2-8 | $60 | High |

---

## Competitive Landscape

### Direct Competitors

| Competitor | What They Do | Why We're Different |
|------------|--------------|---------------------|
| **MyFitnessPal** | Calorie tracking, macro counting | We don't track numbers, we improve existing meals |
| **Yummly** | Recipe recommendations based on preferences | We start from food you have, not search |
| **SuperCook** | Recipe generator from ingredients | We give ONE rescue, not 50 recipes |
| **Noom** | Weight loss program with psychology | We're not a diet program, no weight focus |

### Indirect Competitors

| Competitor | Category | Our Advantage |
|------------|----------|---------------|
| **Pinterest** | Recipe discovery | We're actionable now, not aspirational later |
| **TikTok Food** | Entertainment + recipes | We solve immediate problem, not browse |
| **Meal delivery services** | Convenience food | We improve what you already have, cheaper |
| **Nutritionists** | Professional advice | We're always available, affordable, non-judgmental |

### Competitive Moat

1. **Minimum Intervention Philosophy** - Unique positioning, hard to copy without philosophical shift
2. **Preference Learning** - Gets better over time, network effects at individual level
3. **Behavioral Data** - Real-world meal decisions, not aspirational recipes
4. **Brand Voice** - Encouraging vs. restrictive, positive vs. guilt-inducing

---

## Roadmap Alignment

### Q1 2024 (Months 1-3): MVP Launch
- Core rescue loop working flawlessly
- 1,000 active users
- >60% satisfaction rate
- RevenueCat subscription live

### Q2 2024 (Months 4-6): V2 Features
- Fridge Negotiator launched
- Leftover Alchemist launched
- Voice input added
- Shareable cards viral loop
- 10,000 MAU target

### Q3 2024 (Months 7-9): Personalization Deepening
- Household profiles
- Advanced preference learning
- Contextual notifications
- Restaurant mode beta
- International expansion (EN → ES, FR)

### Q4 2024 (Months 10-12): Scale
- Grocery partnerships
- B2B pilot (nutritionists, gyms)
- API for third-party integrations
- 100,000 MAU target
- Series A preparation

---

## Risk Assessment

### Product Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI recommendations consistently bad | Medium | Critical | Human-in-the-loop testing, fallback to deterministic |
| Users don't understand concept | High | High | Better onboarding, demo video, clearer messaging |
| Personalization doesn't feel personal | Medium | High | Lower threshold for "learning" messages, show progress |
| Free tier too generous | Low | Medium | A/B test rescue limits, monitor conversion |

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Vision model hallucinates ingredients | High | High | Confidence thresholds, user confirmation step |
| LLM costs exceed projections | Medium | High | Caching, smaller models for simple cases, rate limits |
| Latency exceeds targets | Medium | Medium | Async processing, optimistic UI, CDN for images |
| Scale issues at 10K users | Low | High | Load testing early, auto-scaling infrastructure |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CAC > LTV | Medium | Critical | Focus on organic channels, referral loops |
| Low willingness to pay | Medium | High | Emphasize unique value, test pricing tiers |
| Major competitor copies feature | Low | Medium | Speed advantage, brand loyalty, data moat |
| App store rejection | Low | High | Follow guidelines, avoid health claims |

---

## Pricing Strategy

### Tier Structure

| Feature | Free Tier | Pro Tier |
|---------|-----------|----------|
| Rescues per day | 3 | Unlimited |
| Meal analysis | Basic | Advanced (detailed components) |
| Recommendations | Basic | Personalized (deep learning) |
| Preference memory | Last 10 rescues | Unlimited history |
| Fridge Negotiator | ❌ | ✅ |
| Leftover Alchemist | ❌ | ✅ |
| Voice input | ❌ | ✅ |
| Shareable cards | ❌ | ✅ |
| Household profile | ❌ | ✅ (up to 5 members) |
| Priority support | ❌ | ✅ |

### Pricing Tests

| Test Variant | Monthly Price | Annual Price | Hypothesis |
|--------------|---------------|--------------|------------|
| A (Baseline) | $9.99 | $79.99 | Standard SaaS pricing |
| B (Psychological) | $7.99 | $59.99 | Lower anchor, higher conversion |
| C (Premium) | $12.99 | $99.99 | Higher perceived value |
| D (Freemium+) | $4.99 | $39.99 | Volume play, lower barrier |

**Initial Test:** Start with variant B, A/B test against A after 1,000 users

---

## User Research Plan

### Discovery Interviews (Pre-Launch)

**Target:** 20 users across 4 personas
**Format:** 45-minute video calls
**Incentive:** $50 gift card

**Key Questions:**
1. Tell me about the last time you ate something you felt wasn't ideal
2. What would have made that meal better?
3. Have you tried any apps to help with eating better? What worked/didn't?
4. How do you currently decide what to add to a meal?
5. What would make you trust an AI recommendation about food?

### Usability Testing (Beta)

**Target:** 10 users per week during beta
**Format:** Moderated sessions, think-aloud protocol
**Tasks:**
1. Capture your current/past meal
2. Select constraints
3. Review and accept/reject recommendation
4. Provide feedback
5. Navigate to another feature

**Success Criteria:**
- Task completion rate >80%
- Time on task < expected
- SUS score >68
- Zero critical usability issues

### In-App Surveys (Post-Launch)

**Trigger Points:**
- After 5 rescues: "How useful has Meal Rescue been?"
- After 30 days: "How likely are you to recommend Meal Rescue?"
- On cancel: "Why are you canceling?" (multiple choice + text)

**Metrics:**
- NPS (Net Promoter Score)
- CSAT (Customer Satisfaction)
- CES (Customer Effort Score)

---

## Stakeholder Communication

### Weekly Product Update

**Audience:** Engineering lead, Design lead, CEO
**Format:** Email + 30-min sync
**Content:**
- Key metrics movement (week-over-week)
- Feature progress (planned vs actual)
- User feedback highlights
- Blockers/risks
- Next week priorities

### Monthly Investor Update

**Audience:** Investors, advisors
**Format:** Deck + narrative
**Content:**
- North star metric trend
- User growth & retention cohorts
- Revenue & burn rate
- Product milestones achieved
- Key learnings
- Ask/help needed

### Quarterly Board Deck

**Audience:** Board of directors
**Format:** Formal presentation
**Content:**
- Strategic progress against plan
- Financial performance
- Competitive landscape changes
- Team updates
- Next quarter OKRs

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Rescue** | A single recommendation to improve a meal |
| **Core Loop** | Capture → Analyze → Constrain → Rescue → Feedback |
| **Minimum Intervention** | Philosophy of smallest effective change |
| **Preference Lock** | User marking elements that must not change |
| **Fridge Negotiator** | Feature for generating meals from available ingredients |
| **Leftover Alchemist** | Feature for transforming leftovers |
| **Satisfaction Rate** | Percentage of rescues rated "Better" |
| **Rescue Rate** | Percentage of recommendations accepted |

---

**Document Owner:** Head of Product
**Last Updated:** 2024-01-15
**Review Cycle:** Bi-weekly
**Next Review:** 2024-01-29
