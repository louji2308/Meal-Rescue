# Meal Rescue - Product Vision & Philosophy

## The One-Line Concept

**An AI meal companion that looks at what you're already about to eat and finds the smallest realistic change that makes it better.**

Not a diet plan. Not calorie counting. Not a different recipe entirely.

---

## Core Philosophy: Don't Replace the Meal. Rescue It.

### What Meal Rescue Deliberately Refuses to Be

| Category | What We Are NOT | Why This Matters |
|----------|----------------|------------------|
| **Recipe App** | We don't start from a search box | We start from food you already have |
| **Calorie Tracker** | We never optimize numbers | We optimize satisfaction and practicality |
| **AI Nutrition Chatbot** | We don't output conversations | We output ONE concrete action |
| **Meal Planner** | We don't solve problems in advance | We solve problems at the moment of eating |
| **Food Scanner** | Recognition is just the input | It's not the product itself |

### What Remains After Subtraction

A **minimum-intervention decision engine** for making real-world meals work better.

---

## The Core Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE MEAL RESCUE LOOP                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  You Have Food → Capture It → System Understands It            │
│       ↓                                                         │
│  Reads Your Constraints → Minimum Intervention Engine           │
│       ↓                                                         │
│  Picks ONE Rescue → You Accept/Modify/Reject                   │
│       ↓                                                         │
│  Meal Completed → Satisfaction Feedback                         │
│       ↓                                                         │
│  Updates Personalization Memory → Next Rescue Is Better        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Every feature in this app is a different entry point into this same loop, not a separate product.**

---

## Detailed Use Case Walkthrough

### Phase 1: Capture

**Home Screen Question:** "What are you eating?"

**Three Input Modes:**
- 📷 **Scan** - Photo recognition
- ✍️ **Type** - Text description
- 🎙️ **Tell Me** - Voice input

**Example Inputs:**
- "instant noodles"
- "toast and jam"
- "I have leftover rice and chicken"
- [Photo of actual meal]

### Phase 2: Meal Understanding

**System Extracts:**
- Foods present
- Ingredients (structured)
- Approximate portions
- Prep style
- Which useful components are already present (protein, fiber, healthy fat)
- **Uncertainty tracking** - Never pretend visual recognition is perfect

**Critical Design Constraint:**
The system shows what it detected and asks:
```
"Is that correct?"
[Yes] [Edit]
```

This specifically prevents hallucinating ingredients that aren't there.

### Phase 3: Constraint Snapshot

**Not a form.** Tappable shortcuts:

| Shortcut | Meaning |
|----------|---------|
| ⏱ 5 minutes | Time constraint |
| 🍳 No cooking | Preparation constraint |
| 💰 Keep it cheap | Budget constraint |
| 🥡 Eating outside | Location constraint |
| ❤️ Keep my favorite food | Preference lock |
| 🚫 Don't use [ingredient] | Exclusion constraint |

**User can skip all constraints.** System infers whatever isn't specified.

### Phase 4: The Minimum Intervention Engine

**This is the technical and product heart of the entire idea.**

Rather than generating possibilities, it runs candidates through a funnel:

```
Preference Filtering
       ↓
Availability Filtering
       ↓
Time Filtering
       ↓
Cooking-Constraint Filtering
       ↓
Meal-Composition Evaluation
       ↓
Minimum-Change Optimization
```

**The Objective Function (Conceptual):**
```
Best Rescue = maximum practical improvement 
            + maximum preference preservation 
            + minimum friction
```

**Concrete Rule:** Always prefer one small addition over five ingredient changes. Always prefer an ingredient you already have over a new shopping trip.

### Phase 5: The Rescue Result

**Deliberately Plain Format:**

```
Your meal: Instant noodles
Rescue: Add an egg + vegetables
Why: adds components that make the meal more satisfying
Time: 4 minutes · Extra effort: Low · Uses what you have: Yes
```

**Four Actions Only:**
1. Rescue My Meal
2. Swap
3. I Don't Have These
4. Keep It As-Is

**No nutrition report. No macro breakdown.**

---

## Three Additional Entry Points

### Mode 1: "What Can I Add?"

**For when someone already has a meal and wants to upgrade it.**

Process:
1. Analyze current composition
2. Spot the missing category
3. Offer 2–4 concrete options

**Example:**
```
Current: Toast + Jam

Options:
🥚 Protein option (add scrambled eggs)
🥜 Healthy-fat option (add peanut butter)
🍓 Fiber-rich option (add strawberries)
```

**Product Innovation:** Turns a nutrition concept into a product interaction rather than an educational paragraph.

### Mode 2: Fridge Negotiator

**Separate entry point for "I'm hungry, here's what I have."**

**User Input Example:**
"I only have eggs, bread, banana, and peanut butter, and five minutes."

**System Converts To:**
- Structured goal
- Available ingredients
- Time constraint
- Inferred preferences

**Output Example:**
Egg toast + banana + peanut butter

**Explicit Rule:** Three choices maximum. Never a list of 25 recipes.

### Mode 3: Leftover Alchemist

**Photograph leftovers → Transform what exists.**

Process:
1. Identify usable components
2. Generate transformations
3. Rank by effort
4. Show as 3 formats

**Example:**
```
Leftover: Rice + Vegetables + Chicken

Transformations:
🥣 Bowl format
🌯 Wrap format
🍳 Crispy skillet format
```

**Core Point:** Transforms what exists instead of sending user on a grocery trip.

---

## My Pantry - The Inventory Layer

**This changes the shape of the product over time.**

### Pantry State Evolution

```
Day 1: Rice, eggs, tomatoes, onion
Day 5: Rice → 1 cup left · Eggs → 4 · Tomatoes → 2 · Onion → 1
Day 7: Rice → low · Eggs → 3 · Tomatoes → use soon
```

**Strategic Impact:** Once this exists, Meal Rescue stops being "give me recipes" and becomes **"know what I have and help me use it intelligently."**

This is a meaningfully stronger position than a stateless recipe generator.

---

## Learning Who You Are

### Post-Meal Feedback

**One Simple Question:**
"How did that work for you?"

**Response Options:**
- 😊 Better
- 😐 About the same
- 🙁 Not for me

**Optional Free Text:**
- "too much effort"
- "didn't like eggs"
- etc.

### Profile Accumulation

Over time, the system builds:

| Dimension | What It Learns |
|-----------|----------------|
| Favorite foods | What you consistently enjoy |
| Avoided foods | What you consistently reject |
| Preparation tolerance | How much effort you'll accept |
| Time patterns | When you need quick vs. elaborate |
| Ingredient availability | What you typically have |
| Preferred flavors | Taste profile patterns |
| Rescue pattern success | Which interventions work for YOU |

### Critical Distinctions

**This is preference learning, NOT calorie tracking.**

**The Goal:** Real personalization, not fake "AI personalization."

The system must **demonstrably change its behavior** based on accumulated feedback, not just insert the user's name into a templated response.

---

## Feature Architecture (Consolidated)

### Core Meal Intelligence

1. **Meal Recognition** - Image/text/voice → foods
2. **Ingredient Extraction** - Foods → structured ingredients
3. **Meal Composition** - What's already present
4. **Confidence Layer** - Every uncertain detection is user-correctable

### Minimum Intervention Engine

1. **Rescue Generator** - Produces candidates
2. **Constraint Engine** - Filters on:
   - Available ingredients
   - Preferences
   - Time
   - Cooking ability
   - Budget
   - Explicitly-provided allergies/intolerances
3. **Preference Lock** - User marks what must not change

**Example:**
```
Keep: pizza
Don't change: crust
Can change: toppings/side
```

---

## Safety & Trust Principles

### Explicitly Avoid

❌ Calorie targets
❌ Macro targets
❌ Food morality ("good food / bad food")
❌ Restrictive meal plans
❌ Medical diagnosis claims
❌ Eating-disorder treatment claims

### Explicitly Emphasize

✅ Flexible additions
✅ Preferences
✅ Convenience
✅ Satisfaction
✅ Practical meal composition
✅ Transparent reasoning

### On Allergies & Medical Constraints

- Treat explicitly-supplied user constraints conservatively
- **Never imply the recommendation has been medically verified**

---

## Business Model

### Tier Structure

| Tier | Included |
|------|----------|
| **Free** | 3 rescues/day, basic meal analysis, basic recommendations, basic preference memory |
| **Pro** | Unlimited rescues, advanced personalization, Fridge Negotiator, Leftover Alchemist, deep preference memory, household profile, unlimited history |

### Metrics That Matter

**NOT vanity numbers like "meals scanned"**

| Metric | Formula | Purpose |
|--------|---------|---------|
| **Successful Rescue Rate** | accepted rescues ÷ total recommendations | Measures recommendation quality |
| **Rescue → Satisfaction Rate** | rescues marked "Better" ÷ completed rescues | Measures actual user value |

---

## Growth, Retention & Notifications

### Growth Loop

```
Rescue produces shareable "rescue card"
       ↓
Friend opens it → "rescue your meal"
       ↓
They get their own first successful rescue
       ↓
They share it → Loop continues
```

**Key Principle:** Sharing is never mandatory — it's a byproduct of a good result, not a requirement to use the app.

### Retention Loop

**The psychological hook is NOT a streak.**

It's the app **visibly getting better at you specifically:**

| Day | Experience |
|-----|------------|
| Day 1 | First rescue (generic) |
| Day 3 | More personalized rescue |
| Day 7 | "Meal Rescue is getting better at understanding how I actually eat" |

### Notifications

**Only sent with real context.**

| Quality | Example | Verdict |
|---------|---------|---------|
| Bad | "Don't forget to eat healthy!" | ❌ Generic guilt |
| Good | "You have leftover rice from yesterday — want to turn it into something different?" | ✅ Contextual |
| Better | "You've rescued this kind of meal before. Want the version that worked best for you?" | ✅ Personalized + contextual |

---

## Roadmap

### MVP (Phase 1)

- Photo/text input
- Meal understanding
- Constraint selection
- Minimum Intervention Engine
- One rescue recommendation
- Preference lock
- Feedback mechanism
- Personalization memory
- RevenueCat subscription

**That's enough to demonstrate the actual invention.**

### V2 (Phase 2)

- Fridge Negotiator
- "What Can I Add?" mode
- Leftover Alchemist
- Voice input
- Shareable rescue cards
- OneSignal reminders

### V3 (Post-Traction Only)

- Household profiles
- Grocery-aware recommendations
- Restaurant mode
- Contextual recommendations
- Deeper personalization

---

## The 60-Second Demo Script

1. Open Meal Rescue
2. Photograph instant noodles
3. AI recognizes the meal
4. Select "5 minutes" + "keep noodles"
5. App responds: keep your noodles, add egg + vegetables, 4 minutes, uses what you have
6. Tap "Rescue My Meal", show the reasoning
7. Give feedback: "Better"
8. Return home — show "Meal Rescue is learning what works for you"
9. Show the Fridge Negotiator on a second meal
10. Generate a shareable rescue card
11. Open the RevenueCat subscription screen

**The Story in One Line:**
See food → Understand context → Make a tiny intervention → Learn → Improve future decisions.

---

## Positioning Summary

| Dimension | Innovation |
|-----------|------------|
| **Product** | The Minimum Intervention Engine |
| **UX** | One input → one best rescue, not a menu of options |
| **AI** | Contextual recommendation instead of generic generation |
| **Retention** | Learning which interventions actually work for this person |
| **Growth** | Successful rescues are naturally shareable |
| **Monetization** | Selling deeper personalization, not paywalling basic nutrition |

---

## Scope Note for Hackathon

The architecture above is **deliberately small enough** that a student team can build a credible MVP without pretending to own an enormous proprietary AI system.

**Focus on proving the core loop works exceptionally well, not on feature breadth.**
