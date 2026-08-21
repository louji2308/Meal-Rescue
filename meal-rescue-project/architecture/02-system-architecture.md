# Meal Rescue - Technical Architecture

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MOBILE APP (React Native)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │   Camera    │  │   Text      │  │   Voice     │                     │
│  │   Input     │  │   Input     │  │   Input     │                     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                     │
│         └────────────────┴────────────────┘                            │
│                          ↓                                             │
│              ┌───────────────────────┐                                 │
│              │   API Gateway Layer   │                                 │
│              └───────────┬───────────┘                                 │
└──────────────────────────┼─────────────────────────────────────────────┘
                           │ HTTPS/REST
                           ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVICES (Node.js)                       │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  Meal Analysis   │  │   User Profile   │  │   Subscription   │      │
│  │     Service      │  │     Service      │  │     Service      │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
│           │                     │                     │                │
│           └─────────────────────┴─────────────────────┘                │
│                                 ↓                                      │
│                    ┌────────────────────────┐                          │
│                    │  Minimum Intervention  │                          │
│                    │        Engine          │                          │
│                    ├────────────────────────┤                          │
│                    │  • Constraint Engine   │                          │
│                    │  • Preference Engine   │                          │
│                    │  • Candidate Generator │                          │
│                    │  • Ranking Engine      │                          │
│                    └────────────┬───────────┘                          │
│                                 ↓                                      │
│                    ┌────────────────────────┐                          │
│                    │  Feedback & Learning   │                          │
│                    │        Module          │                          │
│                    └────────────┬───────────┘                          │
│                                 ↓                                      │
│                    ┌────────────────────────┐                          │
│                    │   User Preference DB   │                          │
│                    └────────────────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER (PostgreSQL)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Users   │  │  Meals   │  │ Rescues  │  │Feedback  │  │ Pantry   │  │
│  │  Table   │  │  Table   │  │  Table   │  │  Table   │  │  Table   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## The AI Pipeline (CRITICAL)

### Core Architectural Principle

**DON'T let the LLM directly decide everything.**

### The Intended Pipeline

```
User Input 
    ↓
AI Extraction 
    ↓
Structured JSON 
    ↓
Validation 
    ↓
Deterministic Constraint Engine 
    ↓
Candidate Set 
    ↓
LLM Ranking/Explanation 
    ↓
Safety & Rule Validation 
    ↓
Final Recommendation
```

### Why This Matters

| Approach | Problem | Our Solution |
|----------|---------|--------------|
| LLM decides everything | Unpredictable, hallucinates, can't validate | LLM only ranks and explains |
| No structured output | Frontend can't consume reliably | Strict JSON schema validation |
| No constraint engine | Suggestions may be impossible | Deterministic filtering first |
| No safety layer | Could recommend dangerous things | Rule-based validation last |

---

## Structured Intermediate Output

### Example: Meal Analysis Response

```json
{
  "meal": ["instant noodles"],
  "detected_components": {
    "protein": false,
    "fiber_sources": false,
    "healthy_fat_sources": false,
    "carbohydrates": true,
    "sodium_likely_high": true
  },
  "ingredients_detected": [
    {
      "name": "noodles",
      "confidence": 0.94,
      "state": "cooked",
      "estimated_quantity": "1 serving"
    },
    {
      "name": "seasoning packet",
      "confidence": 0.87,
      "state": "mixed",
      "estimated_quantity": "1 packet"
    }
  ],
  "constraints": {
    "time_minutes": 5,
    "budget": "low",
    "cooking_required": false,
    "equipment_needed": []
  },
  "user_preferences_applied": {
    "keep_original_meal": true,
    "avoided_ingredients": [],
    "preferred_additions": ["eggs", "vegetables"]
  },
  "uncertainty_flags": [
    {
      "field": "ingredients_detected[1]",
      "reason": "partially obscured in image",
      "confidence": 0.87
    }
  ]
}
```

### Schema Validation Rules

Every response MUST:
1. Include all required fields
2. Have confidence scores for uncertain detections
3. Flag any uncertainty that would change outcomes
4. Separate detected vs. inferred information
5. Include timestamp and version info

---

## Backend Tool-Calling Architecture

### The Backend Needs Its Own Tools

**NOT just leaning on system prompts.**

```
┌─────────────────────────────────────────────────────────────┐
│                   TOOL CALLING LAYER                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Pantry        │  │   Ingredient    │                  │
│  │   Lookup Tool   │  │   Database      │                  │
│  │                 │  │   Tool          │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Unit          │  │   Nutrition     │                  │
│  │   Conversion    │  │   Info Tool     │                  │
│  │   Tool          │  │                 │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Recipe        │  │   Substitution  │                  │
│  │   Validator     │  │   Logic Tool    │                  │
│  │   Tool          │  │                 │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tool Interface Specification

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  execute: (input: any) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data: any;
  error?: string;
  metadata?: {
    executionTimeMs: number;
    cacheHit: boolean;
  };
}
```

---

## Tech Stack Details

### Layer-by-Layer Breakdown

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React Native / Expo | Cross-platform, fast iteration, strong ecosystem |
| **Backend** | Node.js — Fastify | High performance, TypeScript support, modular |
| **Database** | PostgreSQL | Relational data, complex queries, reliability |
| **Auth** | Firebase Auth or Supabase | Quick setup, proven at scale, mobile-friendly |
| **Storage** | Cloud Storage (GCP/AWS) | Image storage, CDN integration |
| **AI Layer** | Vision model + LLM + Validation | Best-in-class for each function |
| **Payments** | RevenueCat | Subscription management, cross-platform |
| **Notifications** | OneSignal | Push notifications, segmentation |

### Why Not Microservices?

**Modular Monolith is the realistic choice.**

```
meal-rescue-backend/
├── src/
│   ├── controllers/
│   │   ├── meal.controller.ts
│   │   ├── rescue.controller.ts
│   │   ├── fridge.controller.ts
│   │   ├── feedback.controller.ts
│   │   └── profile.controller.ts
│   │
│   ├── services/
│   │   ├── meal-analyzer.service.ts
│   │   ├── rescue-engine.service.ts
│   │   ├── constraint-engine.service.ts
│   │   ├── preference.service.ts
│   │   ├── leftover.service.ts
│   │   └── recommendation.service.ts
│   │
│   ├── models/
│   │   ├── user.model.ts
│   │   ├── meal.model.ts
│   │   ├── rescue.model.ts
│   │   ├── feedback.model.ts
│   │   └── preference.model.ts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── validation.middleware.ts
│   │   └── error-handler.middleware.ts
│   │
│   ├── tools/
│   │   ├── pantry-lookup.tool.ts
│   │   ├── ingredient-db.tool.ts
│   │   ├── unit-conversion.tool.ts
│   │   └── recipe-validator.tool.ts
│   │
│   └── app.ts
│
├── tests/
├── migrations/
└── package.json
```

---

## Data Model (First-Class Objects)

### Critical Design Decision

**A Rescue should be a first-class database object.**

This enables actual learning from behavior instead of just logging events.

### Core Tables

#### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_expires_at TIMESTAMP,
  timezone VARCHAR(50),
  locale VARCHAR(10) DEFAULT 'en-US'
);
```

#### Meals Table

```sql
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  original_input TEXT NOT NULL,
  input_type VARCHAR(20) NOT NULL, -- 'image', 'text', 'voice'
  detected_foods JSONB NOT NULL,
  detected_ingredients JSONB NOT NULL,
  detected_components JSONB NOT NULL,
  confidence_scores JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Rescues Table (FIRST-CLASS OBJECT)

```sql
CREATE TABLE rescues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID REFERENCES meals(id),
  user_id UUID REFERENCES users(id),
  
  -- Original state
  original_meal JSONB NOT NULL,
  detected_ingredients JSONB NOT NULL,
  constraints JSONB NOT NULL,
  
  -- Engine output
  candidates_generated JSONB NOT NULL,
  selected_recommendation JSONB NOT NULL,
  reasoning TEXT NOT NULL,
  
  -- User decision
  user_decision VARCHAR(50) NOT NULL, -- 'accepted', 'swapped', 'rejected', 'kept_as_is'
  decision_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Outcome tracking
  outcome JSONB,
  satisfaction_feedback VARCHAR(20), -- 'better', 'same', 'not_for_me'
  feedback_text TEXT,
  feedback_timestamp TIMESTAMP,
  
  -- Metadata
  processing_time_ms INTEGER,
  model_version VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Critical index for personalization
CREATE INDEX idx_rescues_user_satisfaction ON rescues(user_id, satisfaction_feedback);
CREATE INDEX idx_rescues_user_decision ON rescues(user_id, user_decision);
```

#### Feedback Table

```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rescue_id UUID REFERENCES rescues(id),
  user_id UUID REFERENCES users(id),
  
  feedback_type VARCHAR(50) NOT NULL,
  feedback_value JSONB NOT NULL,
  context JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Preferences Table

```sql
CREATE TABLE preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  
  -- Preference type
  preference_type VARCHAR(50) NOT NULL, -- 'favorite_food', 'avoided_food', 'prep_tolerance', etc.
  preference_key VARCHAR(100) NOT NULL,
  preference_value JSONB NOT NULL,
  
  -- Learning metadata
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  observation_count INTEGER DEFAULT 1,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, preference_type, preference_key)
);
```

#### Pantry Table

```sql
CREATE TABLE pantries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  
  ingredient_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2),
  unit VARCHAR(50),
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  use_priority INTEGER DEFAULT 0, -- higher = use sooner
  
  UNIQUE(user_id, ingredient_name)
);

CREATE INDEX idx_pantry_expires_soon ON pantries(user_id, expires_at) 
  WHERE expires_at IS NOT NULL AND expires_at > NOW();
```

---

## API Endpoint Specifications

### Core Endpoints

#### POST /api/v1/meal/analyze

```typescript
// Request
{
  input: string | File,
  inputType: 'image' | 'text' | 'voice',
  userId: string
}

// Response
{
  mealId: string,
  detectedFoods: FoodItem[],
  detectedIngredients: Ingredient[],
  detectedComponents: ComponentAnalysis,
  confidenceScores: ConfidenceMap,
  uncertaintyFlags: UncertaintyFlag[],
  requiresConfirmation: boolean
}
```

#### POST /api/v1/rescue/generate

```typescript
// Request
{
  mealId: string,
  constraints: {
    timeMinutes?: number,
    budget?: 'low' | 'medium' | 'high',
    cookingRequired?: boolean,
    equipmentAvailable?: string[],
    avoidIngredients?: string[],
    keepOriginal?: boolean
  },
  userId: string
}

// Response
{
  rescueId: string,
  originalMeal: MealSummary,
  recommendation: {
    action: string,
    ingredients: Ingredient[],
    estimatedTime: number,
    effort: 'low' | 'medium' | 'high',
    usesWhatYouHave: boolean,
    reasoning: string
  },
  alternatives?: Recommendation[],
  actions: ['rescue', 'swap', 'dont_have', 'keep_as_is']
}
```

#### POST /api/v1/rescue/:id/feedback

```typescript
// Request
{
  satisfaction: 'better' | 'same' | 'not_for_me',
  feedbackText?: string,
  outcome?: {
    completed: boolean,
    modifications?: string[],
    actualTime?: number
  }
}

// Response
{
  success: boolean,
  personalizationUpdated: boolean,
  insights: PersonalizationInsight[]
}
```

#### GET /api/v1/pantry

```typescript
// Response
{
  ingredients: PantryItem[],
  expiringSoon: PantryItem[],
  lowStock: PantryItem[],
  suggestedUses: SuggestedUse[]
}
```

#### POST /api/v1/fridge/negotiate

```typescript
// Request
{
  availableIngredients: string[],
  timeMinutes: number,
  hungerLevel?: 'snack' | 'meal',
  userId: string
}

// Response
{
  recommendations: MealRecommendation[], // MAX 3
  reasoning: string,
  missingIngredients: string[]
}
```

#### POST /api/v1/leftover/alchemist

```typescript
// Request
{
  imageUrl?: File,
  description?: string,
  userId: string
}

// Response
{
  identifiedComponents: FoodComponent[],
  transformations: Transformation[], // MAX 3
  effortRanking: EffortLevel[]
}
```

---

## Error Handling Strategy

### Error Categories

```typescript
enum ErrorCategory {
  INPUT_VALIDATION = 'INPUT_VALIDATION',
  AI_MODEL_FAILURE = 'AI_MODEL_FAILURE',
  CONSTRAINT_CONFLICT = 'CONSTRAINT_CONFLICT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_FAILURE = 'EXTERNAL_SERVICE_FAILURE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED'
}
```

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    category: ErrorCategory;
    code: string;
    message: string;
    details?: Record<string, any>;
    recoverable: boolean;
    suggestedAction?: string;
  };
  requestId: string;
  timestamp: string;
}
```

### Graceful Degradation Rules

| Failure Point | Fallback Behavior |
|---------------|-------------------|
| Vision model fails | Fall back to text input prompt |
| LLM ranking fails | Use deterministic scoring |
| Pantry lookup fails | Assume ingredient not available |
| Database write fails | Queue for retry, don't block user |
| Payment service fails | Allow temporary access, flag for review |

---

## Latency & Cost Optimization

### Target Latencies

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| Meal analysis (image) | < 2s | < 4s | < 6s |
| Meal analysis (text) | < 500ms | < 1s | < 1.5s |
| Rescue generation | < 1.5s | < 3s | < 5s |
| Feedback submission | < 200ms | < 500ms | < 1s |

### Cost Control Strategies

1. **Cache vision results** - Same image hash → cached result
2. **Batch preference updates** - Don't write on every interaction
3. **Tiered model usage** - Simple cases → smaller model
4. **Request coalescing** - Combine related operations
5. **Confidence thresholds** - Low confidence → ask user, don't re-call AI

### Caching Strategy

```typescript
interface CacheConfig {
  mealAnalysis: {
    ttl: 86400; // 24 hours
    key: (imageHash: string) => `meal:${imageHash}`;
  };
  userPreferences: {
    ttl: 3600; // 1 hour
    key: (userId: string) => `prefs:${userId}`;
  };
  pantryState: {
    ttl: 1800; // 30 minutes
    key: (userId: string) => `pantry:${userId}`;
  };
}
```

---

## Security Considerations

### Authentication Flow

```
Mobile App → Firebase Auth → JWT → Backend Verification → User Context
```

### Data Protection

| Data Type | Protection Level |
|-----------|------------------|
| User credentials | Encrypted at rest, never logged |
| Meal images | Temporary storage, auto-delete after 7 days |
| Health constraints | Treated as sensitive, extra validation |
| Payment info | Handled by RevenueCat only, never touch backend |

### Rate Limiting

```typescript
const rateLimits = {
  free: {
    rescuesPerDay: 3,
    requestsPerMinute: 10
  },
  pro: {
    rescuesPerDay: Infinity,
    requestsPerMinute: 60
  }
};
```

---

## Monitoring & Observability

### Key Metrics to Track

```typescript
interface Metrics {
  // Business metrics
  successfulRescueRate: number; // accepted / total
  rescueSatisfactionRate: number; // 'better' / completed
  
  // Technical metrics
  apiLatencyP50: number;
  apiLatencyP95: number;
  apiLatencyP99: number;
  errorRate: number;
  
  // AI metrics
  visionModelAccuracy: number;
  llmRankingConsistency: number;
  hallucinationRate: number;
  
  // User metrics
  dailyActiveUsers: number;
  weeklyRetention: number;
  conversionToPro: number;
}
```

### Logging Strategy

```typescript
// Structured logging format
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  requestId: string;
  userId?: string;
  operation: string;
  duration?: number;
  result?: 'success' | 'failure';
  error?: ErrorDetails;
  metadata?: Record<string, any>;
}
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
│                    (AWS ALB / NGINX)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ↓                           ↓
┌───────────────────┐       ┌───────────────────┐
│   Backend Node 1  │       │   Backend Node 2  │
│   (Fastify API)   │       │   (Fastify API)   │
└─────────┬─────────┘       └─────────┬─────────┘
          │                           │
          └─────────────┬─────────────┘
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ↓                           ↓
┌───────────────────┐       ┌───────────────────┐
│   PostgreSQL      │       │   Redis Cache     │
│   (Primary +      │       │   (ElastiCache)   │
│    Read Replica)  │       │                   │
└───────────────────┘       └───────────────────┘
```

### Environment Configuration

```bash
# .env.example
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...

# AI Services
VISION_MODEL_API_KEY=...
LLM_API_KEY=...
LLM_MODEL_VERSION=...

# Storage
GCS_BUCKET_NAME=...
GCS_PROJECT_ID=...

# Payments
REVENUECAT_API_KEY=...
REVENUECAT_WEBHOOK_SECRET=...

# Notifications
ONESIGNAL_APP_ID=...
ONESIGNAL_API_KEY=...

# Monitoring
SENTRY_DSN=...
LOG_LEVEL=info
```

---

## Scalability Considerations

### Horizontal Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU utilization | > 70% sustained | Add backend node |
| Memory utilization | > 80% sustained | Add backend node |
| Request queue depth | > 100 | Add backend node |
| Database connections | > 80% pool | Add read replica |
| Cache hit rate | < 60% | Increase cache size |

### Database Sharding Strategy (Future)

When needed, shard by:
- `user_id` modulo N
- Keep all user data together for personalization
- Rescues table grows fastest, shard first

---

## Versioning Strategy

### API Versioning

```
/api/v1/meal/analyze
/api/v2/meal/analyze (future)
```

### Model Versioning

```typescript
interface ModelVersion {
  visionModel: string; // e.g., 'gpt-4-vision-2024-01'
  llmModel: string;    // e.g., 'gpt-4-turbo-2024-01'
  rescueEngine: string; // e.g., 'rescue-engine-v1.2.0'
}

// Store in every rescue record for reproducibility
```

### Backward Compatibility

- Old API versions supported for 90 days
- Deprecation warnings in response headers
- Migration scripts for data model changes
