# Meal Rescue - Product Vision & Philosophy

## Executive Summary

**Product Name:** Meal Rescue  
**Tagline:** Make the meal you already want to eat work better.  
**Core Concept:** An AI meal companion that looks at what you're already about to eat and finds the smallest realistic change that makes it better.

---

## Core Philosophy: Don't Replace the Meal. Rescue It.

### What Meal Rescue Deliberately Refuses to Be

1. **NOT a recipe app** — It starts from food you already have, not a search box.
2. **NOT a calorie tracker** — It never optimizes numbers or macro targets.
3. **NOT an AI nutrition chatbot** — It outputs one concrete action, not a conversation.
4. **NOT a meal planner** — It solves the problem at the moment of eating, not in advance.
5. **NOT a food scanner** — Recognition is just the input; it's not the product.

### What Remains After Subtraction

A **minimum-intervention decision engine** for making real-world meals work better.

---

## The Core Loop

```
You have food 
    ↓
Capture it (📷 scan / ✍️ type / 🎙️ tell)
    ↓
System understands it (with confidence tracking)
    ↓
Reads your constraints (⏱ 5 min / 🍳 no cooking / 💰 cheap / etc.)
    ↓
Minimum Intervention Engine picks ONE rescue
    ↓
You accept, modify, or reject
    ↓
Meal gets completed
    ↓
Quick satisfaction feedback (😊 Better / 😐 Same / 🙁 Not for me)
    ↓
Feedback updates personalization memory
    ↓
Your next rescue is better
```

**Critical Principle:** Every other feature (Fridge Negotiator, Leftover Alchemist, My Pantry) is a different **entry point** into this same loop, NOT a separate product.

---

## User Journey: Single Use Case Walkthrough

### Step 1: Capture
**Home Screen Question:** "What are you eating?"

**Three Input Modes:**
- 📷 **Scan** — Photo recognition
- ✍️ **Type** — Text description
- 🎙️ **Tell Me** — Voice input

**Example Inputs:**
- "instant noodles"
- "toast and jam"
- "I have leftover rice and chicken"
- [Photo of plate]

### Step 2: Meal Understanding (With Confidence Tracking)

**System Extracts:**
- Foods present
- Ingredients (structured)
- Approximate portions
- Prep style
- Which useful components are already present (protein, fiber, healthy fat)

**Critical Design Constraint:** The system must **never pretend visual recognition is perfect**.

**UI Pattern:**
```
Detected: Instant noodles with vegetables
Is that correct? [Yes] [Edit]
```

This step exists specifically to stop hallucination of ingredients that aren't there.

### Step 3: Constraint Snapshot

**Tappable Shortcuts (User can skip all):**
- ⏱ 5 minutes
- 🍳 No cooking
- 💰 Keep it cheap
- 🥡 Eating outside
- ❤️ Keep my favorite food
- 🚫 Don't use [ingredient]

**System Behavior:** Infers whatever isn't explicitly specified.

### Step 4: The Minimum Intervention Engine

**Technical Heart of the Product**

**Funnel Process:**
1. Preference filtering
2. Availability filtering
3. Time filtering
4. Cooking-constraint filtering
5. Meal-composition evaluation
6. Minimum-change optimization

**Optimization Objective:**
```
Best Rescue = maximum practical improvement 
            + maximum preference preservation 
            + minimum friction
```

**Design Rule:** Always prefer one small addition over five ingredient changes. Always prefer an ingredient the user already has over a new shopping trip.

### Step 5: The Rescue Result

**Deliberately Plain Output Format:**

```
Your meal: Instant noodles
Rescue: Add an egg + vegetables
Why: Adds components that make the meal more satisfying
Time: 4 minutes · Extra effort: Low · Uses what you have: Yes
```

**Four Actions:**
1. 🆗 Rescue My Meal
2. 🔄 Swap
3. 🚫 I Don't Have These
4. ➡️ Keep It As-Is

**NO:** Nutrition report, macro breakdown, calorie count.

---

## Three Additional Entry Points

### Mode A: "What Can I Add?"

**Use Case:** User already has a meal and wants to upgrade it.

**Process:**
1. Analyze current composition
2. Spot missing category (protein/fiber/healthy fat)
3. Offer 2–4 concrete options

**Example:**
```
Current: Toast + Jam
Options:
  🥚 Protein option (add egg)
  🥜 Healthy-fat option (add peanut butter)
  🍓 Fiber-rich option (add berries)
```

**Product Innovation:** Turns nutrition concept into product interaction rather than educational paragraph.

### Mode B: Fridge Negotiator

**Use Case:** "I'm hungry, here's what I have."

**Example Input:** "I only have eggs, bread, banana, and peanut butter, and five minutes."

**System Converts To:**
- Structured goal
- Available ingredients
- Time constraint
- Inferred preferences

**Output Rule:** THREE choices maximum. NEVER a list of 25 recipes.

**Example Output:**
```
Best compromise: Egg toast + banana + peanut butter
```

### Mode C: Leftover Alchemist

**Use Case:** Transform existing leftovers.

**Process:**
1. Photograph leftovers
2. System identifies usable components
3. Generates transformations ranked by effort

**Output Formats (3 options):**
```
Leftover: Rice + vegetables + chicken
Transformations:
  🥣 Bowl format
  🌯 Wrap format
  🍳 Crispy skillet format
```

**Core Principle:** Transform what exists instead of sending user on grocery trip.

---

## My Pantry — The Inventory Layer

**Purpose:** Changes the product from stateless recipe generator to intelligent meal assistant.

**Pantry State Evolution:**

| Day | Rice | Eggs | Tomatoes | Onion |
|-----|------|------|----------|-------|
| Day 1 | Full | 6 | 4 | 2 |
| Day 5 | 1 cup left | 4 | 2 | 1 |
| Day 7 | LOW | 3 | USE SOON | 1 |

**Strategic Impact:** Once this exists, Meal Rescue becomes "know what I have and help me use it intelligently" — a meaningfully stronger position than generic recipe generation.

---

## Learning & Personalization

### Post-Meal Feedback Loop

**Single Question:** "How did that work for you?"

**Response Options:**
- 😊 Better
- 😐 About the same
- 🙁 Not for me
- Optional free text: "too much effort", "didn't like eggs"

### Profile Builds Over Time

**Tracked Dimensions:**
1. Favorite foods
2. Avoided foods
3. Preparation tolerance
4. Time patterns
5. Ingredient availability
6. Preferred flavors
7. **Critical:** Which rescue patterns succeeded vs. rejected

**Example Learning:**
- NOT: "User rejected meal #47"
- BUT: "User usually rejects meals with too much preparation"

### Two Explicit Principles

1. **This is preference learning, NOT calorie tracking.**
2. **Goal is REAL personalization**, not fake "AI personalization" — the system must demonstrably change its behavior based on accumulated feedback, not just insert the user's name into a templated response.

---

## Feature Architecture (Consolidated)

### Core Meal Intelligence

1. **Meal Recognition** — Image/text/voice → foods
2. **Ingredient Extraction** — Foods → structured ingredients
3. **Meal Composition** — What's already present (protein/fiber/fat)
4. **Confidence Layer** — Every uncertain detection is user-correctable

### Minimum Intervention Engine

**Components:**
1. **Rescue Generator** — Produces candidates
2. **Constraint Engine** — Filters on:
   - Available ingredients
   - Preferences
   - Time
   - Cooking ability
   - Budget
   - Explicitly-provided allergies/intolerances
3. **Preference Lock** — User marks what must NOT change

**Example:**
```
Keep: pizza
Don't change: crust
Can change: toppings/side
```

---

## Safety & Trust Principles

### Explicitly Avoid

- ❌ Calorie targets
- ❌ Macro targets
- ❌ Food morality ("good food / bad food" framing)
- ❌ Restrictive meal plans
- ❌ Medical diagnosis claims
- ❌ Eating-disorder treatment claims

### Explicitly Emphasize

- ✅ Flexible additions
- ✅ User preferences
- ✅ Convenience
- ✅ Satisfaction
- ✅ Practical meal composition
- ✅ Transparent reasoning

### Allergies & Medical Constraints

- Treat explicitly-supplied user constraints CONSERVATIVELY
- NEVER imply the recommendation has been medically verified

---

## Business Model

### Free Tier
- 3 rescues/day
- Basic meal analysis
- Basic recommendations
- Basic preference memory

### Pro Tier
- Unlimited rescues
- Advanced personalization
- Fridge Negotiator
- Leftover Alchemist
- Deep preference memory
- Household profile
- Unlimited history

---

## Metrics That Matter

**DO NOT Track:** Vanity numbers like "meals scanned"

**Track Instead:**

1. **Successful Rescue Rate** = accepted rescues ÷ total recommendations
2. **Rescue → Satisfaction Rate** = rescues marked "Better" ÷ completed rescues

---

## Growth & Retention Strategy

### Growth Loop

```
Rescue produces shareable "rescue card"
    ↓
Friend opens it
    ↓
"Rescue your meal"
    ↓
They get their own first successful rescue
    ↓
They share it
    ↓
Loop continues
```

**Principle:** Sharing is NEVER mandatory — it's a byproduct of a good result, not a requirement to use the app.

### Retention Loop

**Psychological Hook:** NOT a streak counter.

**Real Hook:** The app visibly getting better at YOU specifically.

**Progression:**
- Day 1: First rescue
- Day 3: More-personalized rescue
- Day 7: "Meal Rescue is getting better at understanding how I actually eat"

### Notification Strategy

**Bad:** "Don't forget to eat healthy!"

**Good:** "You have leftover rice from yesterday — want to turn it into something different?"

**Better:** "You've rescued this kind of meal before. Want the version that worked best for you?"

**Principle:** Only send notifications with REAL context.

---

## Positioning Statement

**In One Line:** See food → Understand context → Make a tiny intervention → Learn → Improve future decisions.

### Innovation Dimensions

| Dimension | Innovation |
|-----------|------------|
| **Product** | Minimum Intervention Engine (one best rescue, not menu of options) |
| **UX** | One input → One best rescue |
| **AI** | Contextual recommendation instead of generic generation |
| **Retention** | Learning which interventions actually work for this person |
| **Growth** | Successful rescues are naturally shareable |
| **Monetization** | Selling deeper personalization, not paywalling basic nutrition |

---

## Platform Targets

- **Primary:** iOS App Store
- **Secondary:** Android Play Store
- **Technology:** React Native / Expo (cross-platform)

---

## Document Purpose

This document serves as the **north star** for all engineering, design, and product decisions. Every feature, every line of code, every UI element must align with the core philosophy: **Don't replace the meal. Rescue it.**
