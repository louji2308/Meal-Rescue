# Meal Rescue - Implementation Plan

## Executive Summary

This document provides a **phase-by-phase, step-by-step implementation plan** for building Meal Rescue as a production-ready mobile application deployable to both Android Play Store and iOS App Store.

**Engineering Philosophy:** Build like a senior engineering team, not like an AI agent. Every step must be deliberate, tested, and production-grade.

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION PHASES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Foundation & Setup (Week 1-2)                         │
│    └─ Project scaffolding, architecture, core infrastructure    │
│                                                                 │
│  Phase 2: Core AI Pipeline (Week 3-4)                           │
│    └─ Meal analysis, constraint engine, rescue generation       │
│                                                                 │
│  Phase 3: Mobile Frontend (Week 5-6)                            │
│    └─ React Native app, UI/UX, state management                 │
│                                                                 │
│  Phase 4: Personalization & Learning (Week 7-8)                 │
│    └─ Feedback system, preference learning, pantry tracking     │
│                                                                 │
│  Phase 5: Advanced Features (Week 9-10)                         │
│    └─ Fridge Negotiator, Leftover Alchemist, voice input        │
│                                                                 │
│  Phase 6: Testing & Quality Assurance (Week 11-12)              │
│    └─ End-to-end testing, performance optimization, security    │
│                                                                 │
│  Phase 7: Deployment & Launch (Week 13-14)                      │
│    └─ App store deployment, monitoring, iteration               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Setup (Week 1-2)

### Step 1.1: Repository Structure & Tooling

#### Create Repository Structure

```bash
meal-rescue/
├── apps/
│   ├── mobile/              # React Native / Expo app
│   └── backend/             # Node.js / Fastify API
│
├── packages/
│   ├── shared-types/        # Shared TypeScript types
│   ├── ui-components/       # Shared React Native components
│   └── ai-pipeline/         # AI processing logic (can be used in both)
│
├── infrastructure/
│   ├── terraform/           # Infrastructure as code
│   ├── docker/              # Container configurations
│   └── k8s/                 # Kubernetes manifests (future)
│
├── docs/
│   ├── product/             # Product specifications
│   ├── technical/           # Technical documentation
│   └── api/                 # API documentation
│
├── scripts/
│   ├── setup/               # Setup scripts
│   ├── migration/           # Database migrations
│   └── deployment/          # Deployment scripts
│
├── tests/
│   ├── e2e/                 # End-to-end tests
│   ├── integration/         # Integration tests
│   └── unit/                # Unit tests
│
└── README.md
```

#### Initialize Monorepo with Turborepo

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".expo/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:e2e": {
      "dependsOn": ["build"]
    }
  }
}
```

#### Set Up Development Environment

```bash
# Root level
npm install -g turbo expo-cli
npm install --save-dev typescript eslint prettier husky lint-staged

# Configure husky for pre-commit hooks
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"

# Lint-staged configuration
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{md,json}": ["prettier --write"]
  }
}
```

### Step 1.2: Backend Scaffolding

#### Initialize Node.js Project

```bash
cd apps/backend
npm init -y
npm install fastify @fastify/cors @fastify/helmet @fastify/jwt
npm install @fastify/swagger @fastify/swagger-ui
npm install pg sequelize redis ioredis
npm install openai @anthropic-ai/sdk sharp
npm install zod zod-validation-error
npm install winston daily-rotate-file
npm install --save-dev typescript @types/node ts-node nodemon jest supertest
```

#### Create Fastify Application Structure

```typescript
// apps/backend/src/app.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

import { mealRoutes } from './routes/meal.routes';
import { rescueRoutes } from './routes/rescue.routes';
import { feedbackRoutes } from './routes/feedback.routes';
import { pantryRoutes } from './routes/pantry.routes';
import { userRoutes } from './routes/user.routes';

import { errorHandler } from './middleware/error-handler';
import { authMiddleware } from './middleware/auth';
import { validationErrorHandler } from './middleware/validation';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
  });
  
  await app.register(helmet, {
    contentSecurityPolicy: false, // Configure for production
  });
  
  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
  });
  
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Meal Rescue API',
        version: '1.0.0',
      },
    },
  });
  
  await app.register(swaggerUI, {
    routePrefix: '/docs',
  });

  // Register middleware
  app.addHook('onRequest', authMiddleware);
  app.addHook('onError', errorHandler);
  app.addHook('onValidationError', validationErrorHandler);

  // Register routes
  await app.register(mealRoutes, { prefix: '/api/v1/meal' });
  await app.register(rescueRoutes, { prefix: '/api/v1/rescue' });
  await app.register(feedbackRoutes, { prefix: '/api/v1/feedback' });
  await app.register(pantryRoutes, { prefix: '/api/v1/pantry' });
  await app.register(userRoutes, { prefix: '/api/v1/user' });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
```

#### Set Up Database Connection

```typescript
// apps/backend/src/database/index.ts
import { Sequelize } from 'sequelize';
import { initializeModels } from './models';

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 20,
    min: 5,
    acquire: 30000,
    idle: 10000,
  },
});

export async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Initialize all models
    initializeModels(sequelize);
    
    // Sync models (use migrations in production)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
    }
    
    return sequelize;
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

export { sequelize };
```

#### Create Database Models

```typescript
// apps/backend/src/database/models/index.ts
import { Sequelize } from 'sequelize';
import { UserModel } from './user.model';
import { MealModel } from './meal.model';
import { RescueModel } from './rescue.model';
import { FeedbackModel } from './feedback.model';
import { PreferenceModel } from './preference.model';
import { PantryModel } from './pantry.model';

export function initializeModels(sequelize: Sequelize) {
  // Initialize all models
  const User = UserModel(sequelize);
  const Meal = MealModel(sequelize);
  const Rescue = RescueModel(sequelize);
  const Feedback = FeedbackModel(sequelize);
  const Preference = PreferenceModel(sequelize);
  const Pantry = PantryModel(sequelize);

  // Define associations
  User.hasMany(Meal, { foreignKey: 'userId' });
  Meal.belongsTo(User, { foreignKey: 'userId' });

  User.hasMany(Rescue, { foreignKey: 'userId' });
  Rescue.belongsTo(User, { foreignKey: 'userId' });

  Meal.hasMany(Rescue, { foreignKey: 'mealId' });
  Rescue.belongsTo(Meal, { foreignKey: 'mealId' });

  Rescue.hasMany(Feedback, { foreignKey: 'rescueId' });
  Feedback.belongsTo(Rescue, { foreignKey: 'rescueId' });

  User.hasMany(Feedback, { foreignKey: 'userId' });
  Feedback.belongsTo(User, { foreignKey: 'userId' });

  User.hasMany(Preference, { foreignKey: 'userId' });
  Preference.belongsTo(User, { foreignKey: 'userId' });

  User.hasMany(Pantry, { foreignKey: 'userId' });
  Pantry.belongsTo(User, { foreignKey: 'userId' });

  return { User, Meal, Rescue, Feedback, Preference, Pantry };
}
```

### Step 1.3: Mobile App Scaffolding

#### Initialize Expo Project

```bash
cd apps/mobile
npx create-expo-app@latest . --template expo-template-blank-typescript
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install @react-navigation/stack
npm install react-native-screens react-native-safe-area-context
npm install axios zustand react-query
npm install expo-camera expo-image-picker expo-av
npm install expo-notifications expo-sharing
npm install @stripe/stripe-react-native
npm install --save-dev @types/react @types/react-native typescript
```

#### Configure Expo

```javascript
// apps/mobile/app.config.js
export default {
  expo: {
    name: 'Meal Rescue',
    slug: 'meal-rescue',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    updates: {
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.mealrescue.app',
      config: {
        usesNonExemptEncryption: false,
      },
      entitlements: {
        'com.apple.developer.healthkit': false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'com.mealrescue.app',
      permissions: [
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'RECORD_AUDIO',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-camera',
      'expo-image-picker',
      'expo-notifications',
    ],
  },
};
```

#### Set Up Navigation Structure

```typescript
// apps/mobile/src/navigation/AppNavigator.tsx
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import { HomeScreen } from '../screens/HomeScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { RescueResultScreen } from '../screens/RescueResultScreen';
import { PantryScreen } from '../screens/PantryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { FridgeNegotiatorScreen } from '../screens/FridgeNegotiatorScreen';
import { LeftoverAlchemistScreen } from '../screens/LeftoverAlchemistScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="RescueResult" component={RescueResultScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            // Icon rendering logic
          },
        })}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeStack}
          options={{ title: 'Rescue' }}
        />
        <Tab.Screen 
          name="FridgeNegotiator" 
          component={FridgeNegotiatorScreen}
          options={{ title: 'Fridge' }}
        />
        <Tab.Screen 
          name="LeftoverAlchemist" 
          component={LeftoverAlchemistScreen}
          options={{ title: 'Leftovers' }}
        />
        <Tab.Screen 
          name="Pantry" 
          component={PantryScreen}
          options={{ title: 'Pantry' }}
        />
        <Tab.Screen 
          name="Profile" 
          component={ProfileScreen}
          options={{ title: 'Profile' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

### Step 1.4: Authentication Setup

#### Firebase Configuration

```typescript
// apps/mobile/src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
```

#### Backend JWT Middleware

```typescript
// apps/backend/src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      subscriptionTier: 'free' | 'pro';
    };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const publicRoutes = ['/health', '/api/v1/auth/login', '/api/v1/auth/register'];
  
  if (publicRoutes.some(route => request.url.startsWith(route))) {
    return;
  }

  try {
    await request.jwtVerify();
    
    // Attach user to request
    request.user = {
      id: request.user.id,
      email: request.user.email,
      subscriptionTier: request.user.subscriptionTier || 'free',
    };
  } catch (error) {
    if (request.url.startsWith('/api/v1')) {
      throw reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token',
      });
    }
  }
}
```

### Step 1.5: Environment Configuration

#### Backend Environment Variables

```bash
# apps/backend/.env.example
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/meal_rescue_dev
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY=your-private-key

# AI Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL_VERSION=gpt-4-turbo-2024-01

# Storage
GCS_BUCKET_NAME=meal-rescue-images
GCS_PROJECT_ID=your-gcp-project-id
GCS_KEY_FILE=./service-account.json

# Payments (RevenueCat)
REVENUECAT_API_KEY=your-revenuecat-api-key
REVENUECAT_WEBHOOK_SECRET=your-webhook-secret

# Notifications (OneSignal)
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_API_KEY=your-onesignal-api-key

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Mobile Environment Variables

```bash
# apps/mobile/.env.example
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY=your-revenuecat-public-key
EXPO_PUBLIC_ONE_SIGNAL_APP_ID=your-onesignal-app-id
```

### Step 1.6: CI/CD Pipeline Setup

#### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npm run test:coverage

  build-backend:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build:backend
      - uses: actions/upload-artifact@v3
        with:
          name: backend-build
          path: apps/backend/dist

  build-mobile:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build:mobile
      - uses: actions/upload-artifact@v3
        with:
          name: mobile-build
          path: apps/mobile/dist

  deploy-staging:
    runs-on: ubuntu-latest
    needs: [build-backend, build-mobile]
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - uses: actions/download-artifact@v3
        with:
          name: backend-build
      - run: ./scripts/deploy-staging.sh

  deploy-production:
    runs-on: ubuntu-latest
    needs: [build-backend, build-mobile]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/download-artifact@v3
        with:
          name: backend-build
      - run: ./scripts/deploy-production.sh
```

### Step 1.7: Docker Configuration

#### Backend Dockerfile

```dockerfile
# apps/backend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

#### Docker Compose for Local Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: meal_rescue
      POSTGRES_PASSWORD: local_password
      POSTGRES_DB: meal_rescue_dev
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./apps/backend
      dockerfile: Dockerfile
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://meal_rescue:local_password@postgres:5432/meal_rescue_dev
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    depends_on:
      - postgres
      - redis
    volumes:
      - ./apps/backend:/app
      - /app/node_modules

volumes:
  postgres_data:
  redis_data:
```

### Phase 1 Deliverables Checklist

- [ ] Monorepo structure initialized with Turborepo
- [ ] Backend Fastify application scaffolded
- [ ] Database models created and synced
- [ ] Mobile Expo app initialized
- [ ] Navigation structure implemented
- [ ] Authentication flow configured (Firebase + JWT)
- [ ] Environment variables documented
- [ ] CI/CD pipeline configured
- [ ] Docker containers working locally
- [ ] Pre-commit hooks active
- [ ] TypeScript strict mode enabled
- [ ] ESLint and Prettier configured
- [ ] Health check endpoint responding
- [ ] API documentation available at `/docs`

---

## Phase 2: Core AI Pipeline (Week 3-4)

### Step 2.1: Vision Model Integration

#### Image Processing Service

```typescript
// apps/backend/src/services/ai/vision.service.ts
import OpenAI from 'openai';
import sharp from 'sharp';
import { createHash } from crypto';

interface VisionAnalysisResult {
  foods: DetectedFood[];
  ingredients: DetectedIngredient[];
  components: ComponentAnalysis;
  confidence: ConfidenceScores;
  uncertaintyFlags: UncertaintyFlag[];
  imageHash: string;
}

export class VisionService {
  private openai: OpenAI;
  private cache: Redis;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.cache = new Redis(process.env.REDIS_URL!);
  }

  async analyzeImage(imageBuffer: Buffer): Promise<VisionAnalysisResult> {
    // Generate image hash for caching
    const imageHash = createHash('sha256').update(imageBuffer).digest('hex');
    
    // Check cache first
    const cached = await this.cache.get(`vision:${imageHash}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Optimize image before sending
    const optimizedImage = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();

    const base64Image = optimizedImage.toString('base64');

    // Call vision model
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this meal image. Extract:
1. All visible foods (be specific)
2. Probable ingredients
3. Nutritional components present (protein, fiber, healthy fats, carbs)
4. Your confidence level for each detection
5. Any uncertainties or obscured items

Respond in JSON format matching this schema:
{
  "foods": [{"name": string, "confidence": number}],
  "ingredients": [{"name": string, "confidence": number, "state": "raw|cooked|processed"}],
  "components": {"protein": boolean, "fiber": boolean, "healthy_fats": boolean, "carbs": boolean},
  "uncertainties": [{"item": string, "reason": string, "confidence": number}]
}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    // Parse and validate response
    const result = this.parseVisionResponse(response.choices[0].message.content!);
    result.imageHash = imageHash;

    // Cache for 24 hours
    await this.cache.setex(`vision:${imageHash}`, 86400, JSON.stringify(result));

    return result;
  }

  private parseVisionResponse(content: string): VisionAnalysisResult {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid vision model response format');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate against schema using Zod
    return visionResultSchema.parse(parsed);
  }
}
```

### Step 2.2: Meal Understanding Engine

#### Structured Meal Analysis

```typescript
// apps/backend/src/services/meal-analyzer.service.ts
import { VisionService } from './ai/vision.service';
import { IngredientDatabase } from '../tools/ingredient-db.tool';
import { ComponentAnalyzer } from './component-analyzer.service';

interface MealAnalysis {
  mealId: string;
  detectedFoods: FoodItem[];
  detectedIngredients: Ingredient[];
  detectedComponents: ComponentAnalysis;
  confidenceScores: ConfidenceMap;
  uncertaintyFlags: UncertaintyFlag[];
  requiresConfirmation: boolean;
}

export class MealAnalyzerService {
  constructor(
    private visionService: VisionService,
    private ingredientDb: IngredientDatabase,
    private componentAnalyzer: ComponentAnalyzer
  ) {}

  async analyzeFromImage(imageBuffer: Buffer, userId: string): Promise<MealAnalysis> {
    // Step 1: Vision analysis
    const visionResult = await this.visionService.analyzeImage(imageBuffer);

    // Step 2: Normalize ingredients
    const normalizedIngredients = await this.normalizeIngredients(
      visionResult.ingredients
    );

    // Step 3: Enrich with component data
    const enrichedComponents = await this.componentAnalyzer.analyze(
      normalizedIngredients
    );

    // Step 4: Calculate confidence thresholds
    const requiresConfirmation = this.shouldRequireConfirmation(visionResult);

    // Step 5: Generate meal ID and persist
    const mealId = generateUUID();
    await this.persistMealAnalysis({
      mealId,
      userId,
      foods: visionResult.foods,
      ingredients: normalizedIngredients,
      components: enrichedComponents,
      confidence: visionResult.confidence,
      uncertainties: visionResult.uncertaintyFlags,
    });

    return {
      mealId,
      detectedFoods: visionResult.foods,
      detectedIngredients: normalizedIngredients,
      detectedComponents: enrichedComponents,
      confidenceScores: visionResult.confidence,
      uncertaintyFlags: visionResult.uncertaintyFlags,
      requiresConfirmation,
    };
  }

  async analyzeFromText(description: string, userId: string): Promise<MealAnalysis> {
    // Text-based analysis using LLM
    const llm = new LLMService();
    
    const extractionPrompt = `Extract meal information from this description: "${description}"
    
Return structured JSON with:
- foods: array of identified foods
- ingredients: probable ingredients with states
- components: nutritional categories present`;

    const extracted = await llm.extractStructured(extractionPrompt);
    
    // Continue with same normalization as image analysis
    const normalizedIngredients = await this.normalizeIngredients(extracted.ingredients);
    const enrichedComponents = await this.componentAnalyzer.analyze(normalizedIngredients);

    const mealId = generateUUID();
    await this.persistMealAnalysis({
      mealId,
      userId,
      foods: extracted.foods,
      ingredients: normalizedIngredients,
      components: enrichedComponents,
      confidence: { overall: 0.85 }, // Text is more certain than vision
      uncertainties: [],
    });

    return {
      mealId,
      detectedFoods: extracted.foods,
      detectedIngredients: normalizedIngredients,
      detectedComponents: enrichedComponents,
      confidenceScores: { overall: 0.85 },
      uncertaintyFlags: [],
      requiresConfirmation: false,
    };
  }

  private async normalizeIngredients(
    ingredients: DetectedIngredient[]
  ): Promise<NormalizedIngredient[]> {
    return Promise.all(
      ingredients.map(async (ingredient) => {
        // Look up in ingredient database
        const dbMatch = await this.ingredientDb.findBestMatch(ingredient.name);
        
        return {
          name: dbMatch?.standardName || ingredient.name,
          confidence: ingredient.confidence,
          state: ingredient.state,
          category: dbMatch?.category || 'unknown',
          nutritionalProfile: dbMatch?.nutrition || {},
          commonSubstitutes: dbMatch?.substitutes || [],
        };
      })
    );
  }

  private shouldRequireConfirmation(visionResult: VisionAnalysisResult): boolean {
    // Require confirmation if any critical ingredient has low confidence
    const criticalLowConfidence = visionResult.uncertaintyFlags.some(
      flag => flag.confidence < 0.7
    );

    // Or if overall confidence is below threshold
    const lowOverallConfidence = visionResult.confidence.overall < 0.75;

    return criticalLowConfidence || lowOverallConfidence;
  }

  private async persistMealAnalysis(analysis: any) {
    // Save to database for history and learning
    await sequelize.models.Meal.create(analysis);
  }
}
```

### Step 2.3: Constraint Engine Implementation

#### Deterministic Constraint Filtering

```typescript
// apps/backend/src/services/constraint-engine.service.ts
interface Constraints {
  timeMinutes?: number;
  budget?: 'low' | 'medium' | 'high';
  cookingRequired?: boolean;
  equipmentAvailable?: string[];
  avoidIngredients?: string[];
  allergies?: string[];
  keepOriginal?: boolean;
  dietaryRestrictions?: string[];
}

interface RescueCandidate {
  id: string;
  additions: Ingredient[];
  substitutions: Substitution[];
  estimatedTime: number;
  estimatedCost: 'low' | 'medium' | 'high';
  requiredEquipment: string[];
  cookingSteps: number;
  compatibilityScore: number;
}

export class ConstraintEngineService {
  /**
   * Filter candidates through deterministic constraints
   * This happens BEFORE LLM ranking
   */
  filterCandidates(
    candidates: RescueCandidate[],
    constraints: Constraints,
    userPantry: Ingredient[]
  ): RescueCandidate[] {
    let filtered = [...candidates];

    // 1. Time constraint
    if (constraints.timeMinutes) {
      filtered = filtered.filter(c => c.estimatedTime <= constraints.timeMinutes!);
    }

    // 2. Budget constraint
    if (constraints.budget) {
      filtered = filtered.filter(c => {
        if (constraints.budget === 'low') return c.estimatedCost === 'low';
        if (constraints.budget === 'medium') return c.estimatedCost !== 'high';
        return true;
      });
    }

    // 3. Cooking constraint
    if (constraints.cookingRequired === false) {
      filtered = filtered.filter(c => c.cookingSteps === 0);
    }

    // 4. Equipment constraint
    if (constraints.equipmentAvailable) {
      filtered = filtered.filter(c => 
        c.requiredEquipment.every(eq => 
          constraints.equipmentAvailable!.includes(eq)
        )
      );
    }

    // 5. Avoided ingredients
    if (constraints.avoidIngredients && constraints.avoidIngredients.length > 0) {
      filtered = filtered.filter(c => 
        !c.additions.some(a => 
          constraints.avoidIngredients!.includes(a.name)
        )
      );
    }

    // 6. Allergies (CRITICAL - hard filter)
    if (constraints.allergies && constraints.allergies.length > 0) {
      filtered = filtered.filter(c => 
        !c.additions.some(a => 
          this.containsAllergen(a, constraints.allergies!)
        )
      );
    }

    // 7. Dietary restrictions
    if (constraints.dietaryRestrictions) {
      filtered = filtered.filter(c => 
        constraints.dietaryRestrictions!.every(restriction =>
          this.satisfiesDietaryRestriction(c, restriction)
        )
      );
    }

    // 8. Pantry availability (prefer what user has)
    filtered = filtered.map(c => ({
      ...c,
      compatibilityScore: this.calculatePantryCompatibility(c, userPantry),
    }));

    // Sort by compatibility score
    filtered.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    return filtered;
  }

  private containsAllergen(ingredient: Ingredient, allergens: string[]): boolean {
    const allergenMap = {
      'peanuts': ['peanuts', 'peanut butter', 'peanut oil'],
      'tree_nuts': ['almonds', 'walnuts', 'cashews', 'pecans'],
      'dairy': ['milk', 'cheese', 'butter', 'cream', 'yogurt'],
      'eggs': ['eggs', 'mayonnaise', 'meringue'],
      'gluten': ['wheat', 'barley', 'rye', 'bread', 'pasta'],
      'soy': ['soybeans', 'tofu', 'soy sauce', 'tempeh'],
      'fish': ['fish', 'anchovies', 'fish sauce'],
      'shellfish': ['shrimp', 'crab', 'lobster', 'clams'],
    };

    return allergens.some(allergen => 
      allergenMap[allergen]?.some(derivative =>
        ingredient.name.toLowerCase().includes(derivative)
      )
    );
  }

  private satisfiesDietaryRestriction(
    candidate: RescueCandidate,
    restriction: string
  ): boolean {
    const restrictionChecks = {
      vegetarian: () => candidate.additions.every(a => !this.isMeat(a)),
      vegan: () => candidate.additions.every(a => !this.isAnimalProduct(a)),
      keto: () => candidate.additions.every(a => this.isLowCarb(a)),
      paleo: () => candidate.additions.every(a => this.isPaleoApproved(a)),
      halal: () => candidate.additions.every(a => this.isHalal(a)),
      kosher: () => candidate.additions.every(a => this.isKosher(a)),
    };

    return restrictionChecks[restriction]?.() ?? true;
  }

  private calculatePantryCompatibility(
    candidate: RescueCandidate,
    pantry: Ingredient[]
  ): number {
    const pantryNames = new Set(pantry.map(p => p.name.toLowerCase()));
    
    const additionsInPantry = candidate.additions.filter(a => 
      pantryNames.has(a.name.toLowerCase())
    ).length;

    return additionsInPantry / candidate.additions.length;
  }
}
```

### Step 2.4: Candidate Generator

#### Rescue Candidate Generation

```typescript
// apps/backend/src/services/candidate-generator.service.ts
interface RescueCandidate {
  id: string;
  type: 'addition' | 'substitution' | 'modification';
  additions: Ingredient[];
  substitutions: Substitution[];
  estimatedTime: number;
  estimatedCost: 'low' | 'medium' | 'high';
  requiredEquipment: string[];
  cookingSteps: number;
  nutritionalImprovement: NutritionalImpact;
  preferenceAlignment: number;
}

export class CandidateGeneratorService {
  constructor(
    private ingredientDb: IngredientDatabase,
    private recipeDatabase: RecipeDatabase,
    private substitutionEngine: SubstitutionEngine
  ) {}

  async generateCandidates(
    meal: AnalyzedMeal,
    constraints: Constraints,
    userPreferences: UserPreferences
  ): Promise<RescueCandidate[]> {
    const candidates: RescueCandidate[] = [];

    // Strategy 1: Component-based additions
    const componentCandidates = await this.generateComponentAdditions(
      meal.detectedComponents,
      constraints
    );
    candidates.push(...componentCandidates);

    // Strategy 2: Cuisine-specific enhancements
    const cuisineCandidates = await this.generateCuisineEnhancements(
      meal.detectedFoods,
      constraints
    );
    candidates.push(...cuisineCandidates);

    // Strategy 3: Minimal substitutions
    const substitutionCandidates = await this.generateMinimalSubstitutions(
      meal.detectedIngredients,
      constraints,
      userPreferences
    );
    candidates.push(...substitutionCandidates);

    // Strategy 4: Personalized favorites
    const favoriteCandidates = await this.generateFromFavorites(
      meal,
      userPreferences,
      constraints
    );
    candidates.push(...favoriteCandidates);

    // Score each candidate
    const scored = await Promise.all(
      candidates.map(c => this.scoreCandidate(c, meal, userPreferences))
    );

    return scored;
  }

  private async generateComponentAdditions(
    components: ComponentAnalysis,
    constraints: Constraints
  ): Promise<RescueCandidate[]> {
    const candidates: RescueCandidate[] = [];

    // Identify missing components
    const missingComponents = [];
    if (!components.protein) missingComponents.push('protein');
    if (!components.fiber) missingComponents.push('fiber');
    if (!components.healthy_fats) missingComponents.push('healthy_fats');

    // For each missing component, generate addition options
    for (const component of missingComponents) {
      const additions = await this.ingredientDb.findByComponent(component, {
        maxTime: constraints.timeMinutes,
        maxCost: constraints.budget === 'low' ? 'low' : undefined,
        noCooking: !constraints.cookingRequired,
      });

      for (const addition of additions.slice(0, 3)) { // Top 3 per component
        candidates.push({
          id: generateUUID(),
          type: 'addition',
          additions: [addition],
          substitutions: [],
          estimatedTime: addition.prepTime || 2,
          estimatedCost: addition.costLevel || 'low',
          requiredEquipment: addition.requiredEquipment || [],
          cookingSteps: addition.cookingSteps || 0,
          nutritionalImprovement: {
            [component]: 'added',
          },
          preferenceAlignment: 0.5, // Will be recalculated
        });
      }
    }

    return candidates;
  }

  private async generateCuisineEnhancements(
    foods: DetectedFood[],
    constraints: Constraints
  ): Promise<RescueCandidate[]> {
    // Detect cuisine type from foods
    const cuisineType = this.detectCuisineType(foods);
    
    // Get cuisine-specific enhancement patterns
    const patterns = await this.recipeDatabase.getCuisineEnhancements(cuisineType);

    return patterns
      .filter(p => p.estimatedTime <= (constraints.timeMinutes || 30))
      .map(pattern => ({
        id: generateUUID(),
        type: 'modification' as const,
        additions: pattern.additions,
        substitutions: [],
        estimatedTime: pattern.estimatedTime,
        estimatedCost: pattern.estimatedCost,
        requiredEquipment: pattern.requiredEquipment,
        cookingSteps: pattern.cookingSteps,
        nutritionalImprovement: pattern.nutritionalImpact,
        preferenceAlignment: 0.5,
      }));
  }

  private async generateMinimalSubstitutions(
    ingredients: NormalizedIngredient[],
    constraints: Constraints,
    userPreferences: UserPreferences
  ): Promise<RescueCandidate[]> {
    const candidates: RescueCandidate[] = [];

    // Only suggest substitutions for ingredients user typically avoids
    const potentiallyAvoided = ingredients.filter(i =>
      userPreferences.avoidedFoods?.some(avoided => 
        i.name.toLowerCase().includes(avoided.toLowerCase())
      )
    );

    for (const ingredient of potentiallyAvoided) {
      const substitutes = await this.substitutionEngine.findSubstitutes(
        ingredient,
        {
          respectConstraints: true,
          maxTime: constraints.timeMinutes,
          dietaryRestrictions: userPreferences.dietaryRestrictions,
        }
      );

      for (const substitute of substitutes.slice(0, 2)) {
        candidates.push({
          id: generateUUID(),
          type: 'substitution',
          additions: [],
          substitutions: [{
            original: ingredient,
            replacement: substitute,
          }],
          estimatedTime: substitute.prepTime || 0,
          estimatedCost: substitute.costLevel || 'low',
          requiredEquipment: [],
          cookingSteps: 0,
          nutritionalImprovement: {},
          preferenceAlignment: 0.8, // Higher because it respects preferences
        });
      }
    }

    return candidates;
  }

  private async generateFromFavorites(
    meal: AnalyzedMeal,
    userPreferences: UserPreferences,
    constraints: Constraints
  ): Promise<RescueCandidate[]> {
    if (!userPreferences.favoriteAdditions || userPreferences.favoriteAdditions.length === 0) {
      return [];
    }

    const candidates: RescueCandidate[] = [];

    // Try adding user's favorite ingredients to current meal
    for (const favorite of userPreferences.favoriteAdditions.slice(0, 5)) {
      const compatible = await this.ingredientDb.checkCompatibility(
        favorite,
        meal.detectedFoods
      );

      if (compatible) {
        candidates.push({
          id: generateUUID(),
          type: 'addition',
          additions: [favorite],
          substitutions: [],
          estimatedTime: favorite.prepTime || 3,
          estimatedCost: favorite.costLevel || 'low',
          requiredEquipment: favorite.requiredEquipment || [],
          cookingSteps: favorite.cookingSteps || 0,
          nutritionalImprovement: await this.ingredientDb.getNutritionalImpact(favorite),
          preferenceAlignment: 0.9, // High because it's user's favorite
        });
      }
    }

    return candidates;
  }

  private async scoreCandidate(
    candidate: RescueCandidate,
    meal: AnalyzedMeal,
    userPreferences: UserPreferences
  ): Promise<RescueCandidate> {
    // Recalculate preference alignment with full context
    candidate.preferenceAlignment = this.calculatePreferenceAlignment(
      candidate,
      userPreferences
    );

    return candidate;
  }

  private calculatePreferenceAlignment(
    candidate: RescueCandidate,
    userPreferences: UserPreferences
  ): number {
    let score = 0.5;

    // Boost for using favorite ingredients
    const hasFavorite = candidate.additions.some(a =>
      userPreferences.favoriteFoods?.some(fav =>
        a.name.toLowerCase().includes(fav.toLowerCase())
      )
    );
    if (hasFavorite) score += 0.2;

    // Penalize for avoided ingredients
    const hasAvoided = candidate.additions.some(a =>
      userPreferences.avoidedFoods?.some(avoided =>
        a.name.toLowerCase().includes(avoided.toLowerCase())
      )
    );
    if (hasAvoided) score -= 0.3;

    // Boost for minimal intervention
    if (candidate.type === 'addition' && candidate.additions.length === 1) {
      score += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  private detectCuisineType(foods: DetectedFood[]): string {
    const cuisineKeywords = {
      italian: ['pasta', 'pizza', 'risotto', 'gnocchi'],
      mexican: ['taco', 'burrito', 'quesadilla', 'enchilada'],
      asian: ['noodles', 'rice', 'stir-fry', 'curry'],
      american: ['burger', 'sandwich', 'fries', 'hotdog'],
      mediterranean: ['falafel', 'hummus', 'pita', 'kebab'],
    };

    const foodNames = foods.map(f => f.name.toLowerCase()).join(' ');

    for (const [cuisine, keywords] of Object.entries(cuisineKeywords)) {
      if (keywords.some(kw => foodNames.includes(kw))) {
        return cuisine;
      }
    }

    return 'generic';
  }
}
```

### Step 2.5: LLM Ranking & Explanation

#### Neural Ranking Layer

```typescript
// apps/backend/src/services/ranking-engine.service.ts
interface RankedRecommendation {
  candidate: RescueCandidate;
  rankScore: number;
  reasoning: string;
  naturalLanguageExplanation: string;
}

export class RankingEngineService {
  private llm: LLMService;

  constructor() {
    this.llm = new LLMService();
  }

  async rankAndExplain(
    candidates: RescueCandidate[],
    meal: AnalyzedMeal,
    constraints: Constraints,
    userPreferences: UserPreferences
  ): Promise<RankedRecommendation[]> {
    if (candidates.length === 0) {
      return [];
    }

    // If only one candidate, still use LLM for explanation
    if (candidates.length === 1) {
      const explanation = await this.generateExplanation(
        candidates[0],
        meal,
        constraints,
        userPreferences
      );
      
      return [{
        candidate: candidates[0],
        rankScore: 1.0,
        reasoning: 'Only feasible option given constraints',
        naturalLanguageExplanation: explanation,
      }];
    }

    // Prepare candidates for LLM ranking
    const rankingContext = this.prepareRankingContext(
      candidates,
      meal,
      constraints,
      userPreferences
    );

    // Use LLM for ranking with structured output
    const rankedResults = await this.llm.rankCandidates(rankingContext);

    // Validate and enrich with explanations
    const validated = await Promise.all(
      rankedResults.map(async (result) => {
        const explanation = await this.generateExplanation(
          result.candidate,
          meal,
          constraints,
          userPreferences
        );

        return {
          ...result,
          naturalLanguageExplanation: explanation,
        };
      })
    );

    return validated;
  }

  private prepareRankingContext(
    candidates: RescueCandidate[],
    meal: AnalyzedMeal,
    constraints: Constraints,
    userPreferences: UserPreferences
  ): string {
    return `You are ranking meal rescue recommendations. Choose the BEST option based on:
1. Minimum intervention (prefer small changes)
2. Maximum practical improvement
3. User preference alignment
4. Feasibility given constraints

Current meal: ${JSON.stringify(meal.detectedFoods)}
Missing components: ${this.identifyMissingComponents(meal.detectedComponents)}
Constraints: ${JSON.stringify(constraints)}
User preferences: Favorites: ${userPreferences.favoriteFoods?.join(', ') || 'none'}, Avoided: ${userPreferences.avoidedFoods?.join(', ') || 'none'}

Candidates to rank:
${candidates.map((c, i) => `
Candidate ${i + 1}:
- Type: ${c.type}
- Additions: ${c.additions.map(a => a.name).join(', ')}
- Time: ${c.estimatedTime} minutes
- Cost: ${c.estimatedCost}
- Cooking steps: ${c.cookingSteps}
- Preference alignment: ${(c.preferenceAlignment * 100).toFixed(0)}%
`).join('\n')}

Return JSON array sorted by best first:
[{
  "rank": 1,
  "candidateId": "...",
  "score": 0.95,
  "reasoning": "Brief explanation why this is best"
}]`;
  }

  private async generateExplanation(
    candidate: RescueCandidate,
    meal: AnalyzedMeal,
    constraints: Constraints,
    userPreferences: UserPreferences
  ): Promise<string> {
    const prompt = `Explain this meal rescue recommendation in a friendly, helpful way:

Original meal: ${meal.detectedFoods.map(f => f.name).join(', ')}
Recommended change: ${this.formatCandidateAction(candidate)}
Why it helps: ${this.formatNutritionalBenefit(candidate.nutritionalImprovement)}
Time required: ${candidate.estimatedTime} minutes
Effort level: ${candidate.cookingSteps === 0 ? 'No cooking' : candidate.cookingSteps <= 2 ? 'Low' : 'Medium'}

Make it sound encouraging and practical. Keep it under 3 sentences.`;

    const response = await this.llm.generate(prompt);
    return response.text;
  }

  private formatCandidateAction(candidate: RescueCandidate): string {
    if (candidate.type === 'addition') {
      return `Add ${candidate.additions.map(a => a.name).join(' and ')}`;
    } else if (candidate.type === 'substitution') {
      const sub = candidate.substitutions[0];
      return `Replace ${sub.original.name} with ${sub.replacement.name}`;
    } else {
      return `Modify preparation: ${candidate.cookingSteps} steps`;
    }
  }

  private formatNutritionalBenefit(improvement: NutritionalImpact): string {
    const benefits = Object.entries(improvement).map(([key, value]) => {
      if (value === 'added') return `adds ${key.replace('_', ' ')}`;
      if (value === 'increased') return `increases ${key.replace('_', ' ')}`;
      return `${key.replace('_', ' ')} improved`;
    });

    return benefits.join(', ');
  }

  private identifyMissingComponents(components: ComponentAnalysis): string {
    const missing = [];
    if (!components.protein) missing.push('protein');
    if (!components.fiber) missing.push('fiber');
    if (!components.healthy_fats) missing.push('healthy fats');
    
    return missing.length > 0 ? missing.join(', ') : 'nothing major';
  }
}
```

### Step 2.6: Safety & Validation Layer

#### Final Validation Before Response

```typescript
// apps/backend/src/services/validation.service.ts
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  severity: 'critical' | 'major' | 'minor';
  code: string;
  message: string;
  field?: string;
}

export class ValidationService {
  /**
   * Final safety check before sending recommendation to user
   */
  async validateRecommendation(
    recommendation: RankedRecommendation,
    meal: AnalyzedMeal,
    constraints: Constraints,
    userProfile: UserProfile
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Allergen safety check (CRITICAL)
    const allergenCheck = this.validateAllergenSafety(
      recommendation.candidate,
      userProfile.allergies || []
    );
    if (!allergenCheck.safe) {
      errors.push({
        severity: 'critical',
        code: 'ALLERGEN_DETECTED',
        message: 'Recommendation contains potential allergens',
        field: 'candidate.additions',
      });
    }

    // 2. Dietary restriction compliance
    const dietCheck = this.validateDietaryCompliance(
      recommendation.candidate,
      userProfile.dietaryRestrictions || []
    );
    if (!dietCheck.compliant) {
      errors.push({
        severity: 'major',
        code: 'DIET_VIOLATION',
        message: 'Recommendation violates stated dietary restrictions',
        field: 'candidate.additions',
      });
    }

    // 3. Constraint feasibility
    const constraintCheck = this.validateConstraintFeasibility(
      recommendation.candidate,
      constraints
    );
    if (!constraintCheck.feasible) {
      errors.push({
        severity: 'major',
        code: 'CONSTRAINT_VIOLATION',
        message: 'Recommendation exceeds user constraints',
        field: 'candidate.estimatedTime',
      });
    }

    // 4. Ingredient availability
    const availabilityCheck = await this.validateIngredientAvailability(
      recommendation.candidate
    );
    if (!availabilityCheck.available) {
      warnings.push({
        code: 'INGREDIENT_UNAVAILABLE',
        message: 'Some ingredients may not be readily available',
        suggestions: availabilityCheck.alternatives,
      });
    }

    // 5. Food safety (basic checks)
    const foodSafetyCheck = this.validateFoodSafety(
      recommendation.candidate,
      meal
    );
    if (!foodSafetyCheck.safe) {
      errors.push({
        severity: 'critical',
        code: 'FOOD_SAFETY_CONCERN',
        message: 'Potential food safety issue detected',
        field: 'candidate.cookingSteps',
      });
    }

    // 6. Reasonableness check (prevent absurd suggestions)
    const reasonablenessCheck = this.validateReasonableness(recommendation);
    if (!reasonablenessCheck.reasonable) {
      errors.push({
        severity: 'minor',
        code: 'UNREASONABLE_SUGGESTION',
        message: 'Suggestion seems impractical or excessive',
        field: 'candidate.additions',
      });
    }

    return {
      valid: errors.filter(e => e.severity === 'critical').length === 0,
      errors,
      warnings,
    };
  }

  private validateAllergenSafety(
    candidate: RescueCandidate,
    userAllergies: string[]
  ): { safe: boolean; detectedAllergens?: string[] } {
    if (!userAllergies || userAllergies.length === 0) {
      return { safe: true };
    }

    const detectedAllergens: string[] = [];

    for (const addition of candidate.additions) {
      for (const allergy of userAllergies) {
        if (this.isPotentialAllergen(addition, allergy)) {
          detectedAllergens.push(allergy);
        }
      }
    }

    return {
      safe: detectedAllergens.length === 0,
      detectedAllergens,
    };
  }

  private validateDietaryCompliance(
    candidate: RescueCandidate,
    restrictions: string[]
  ): { compliant: boolean; violations?: string[] } {
    const violations: string[] = [];

    for (const restriction of restrictions) {
      if (!this.satisfiesRestriction(candidate, restriction)) {
        violations.push(restriction);
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
    };
  }

  private validateConstraintFeasibility(
    candidate: RescueCandidate,
    constraints: Constraints
  ): { feasible: boolean; violations?: string[] } {
    const violations: string[] = [];

    if (constraints.timeMinutes && candidate.estimatedTime > constraints.timeMinutes) {
      violations.push(`Time: ${candidate.estimatedTime} > ${constraints.timeMinutes}`);
    }

    if (constraints.budget === 'low' && candidate.estimatedCost !== 'low') {
      violations.push(`Budget: ${candidate.estimatedCost} exceeds low budget`);
    }

    if (constraints.cookingRequired === false && candidate.cookingSteps > 0) {
      violations.push('Cooking required when user specified no cooking');
    }

    return {
      feasible: violations.length === 0,
      violations,
    };
  }

  private async validateIngredientAvailability(
    candidate: RescueCandidate
  ): Promise<{ available: boolean; alternatives?: string[] }> {
    // Check against user's pantry
    // Check general availability
    // Return alternatives if not available
    
    // Simplified for now
    return { available: true };
  }

  private validateFoodSafety(
    candidate: RescueCandidate,
    meal: AnalyzedMeal
  ): { safe: boolean; concerns?: string[] } {
    const concerns: string[] = [];

    // Check if raw ingredients need cooking
    const rawIngredients = candidate.additions.filter(a => a.state === 'raw');
    if (rawIngredients.length > 0 && candidate.cookingSteps === 0) {
      concerns.push('Raw ingredients suggested without cooking steps');
    }

    // Check for dangerous combinations (simplified)
    const dangerousCombos = [
      { items: ['raw chicken', 'ready-to-eat'], issue: 'cross-contamination risk' },
    ];

    return {
      safe: concerns.length === 0,
      concerns,
    };
  }

  private validateReasonableness(
    recommendation: RankedRecommendation
  ): { reasonable: boolean; issues?: string[] } {
    const issues: string[] = [];

    // Too many additions
    if (recommendation.candidate.additions.length > 5) {
      issues.push('Too many ingredient additions (>5)');
    }

    // Excessive time
    if (recommendation.candidate.estimatedTime > 60) {
      issues.push('Excessive time requirement (>60 min)');
    }

    // Low preference alignment
    if (recommendation.candidate.preferenceAlignment < 0.3) {
      issues.push('Very low preference alignment');
    }

    return {
      reasonable: issues.length === 0,
      issues,
    };
  }

  private isPotentialAllergen(ingredient: Ingredient, allergy: string): boolean {
    // Comprehensive allergen mapping
    const allergenMap: Record<string, string[]> = {
      peanuts: ['peanut', 'peanuts', 'peanut butter', 'groundnut'],
      tree_nuts: ['almond', 'walnut', 'cashew', 'pecan', 'hazelnut', 'pistachio'],
      dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'whey', 'casein'],
      eggs: ['egg', 'eggs', 'mayonnaise', 'meringue', 'albumin'],
      gluten: ['wheat', 'barley', 'rye', 'bread', 'pasta', 'flour'],
      soy: ['soy', 'soybean', 'tofu', 'tempeh', 'edamame', 'soy lecithin'],
      fish: ['fish', 'anchovy', 'sardine', 'tuna', 'salmon', 'fish sauce'],
      shellfish: ['shrimp', 'crab', 'lobster', 'clam', 'mussel', 'oyster'],
    };

    const allergenKeywords = allergenMap[allergy.toLowerCase()] || [];
    return allergenKeywords.some(keyword =>
      ingredient.name.toLowerCase().includes(keyword)
    );
  }

  private satisfiesRestriction(
    candidate: RescueCandidate,
    restriction: string
  ): boolean {
    const restrictionChecks: Record<string, () => boolean> = {
      vegetarian: () => candidate.additions.every(a => !this.isMeat(a)),
      vegan: () => candidate.additions.every(a => !this.isAnimalProduct(a)),
      keto: () => candidate.additions.every(a => this.isLowCarb(a)),
      paleo: () => candidate.additions.every(a => this.isPaleoApproved(a)),
      halal: () => candidate.additions.every(a => this.isHalal(a)),
      kosher: () => candidate.additions.every(a => this.isKosher(a)),
    };

    return restrictionChecks[restriction]?.() ?? true;
  }

  private isMeat(ingredient: Ingredient): boolean {
    const meats = ['beef', 'pork', 'chicken', 'lamb', 'turkey', 'bacon', 'ham'];
    return meats.some(meat => ingredient.name.toLowerCase().includes(meat));
  }

  private isAnimalProduct(ingredient: Ingredient): boolean {
    const animalProducts = [
      ...['beef', 'pork', 'chicken', 'lamb', 'turkey', 'bacon', 'ham'],
      ...['egg', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'honey'],
    ];
    return animalProducts.some(product =>
      ingredient.name.toLowerCase().includes(product)
    );
  }

  private isLowCarb(ingredient: Ingredient): boolean {
    // Simplified carb check
    const highCarb = ['rice', 'pasta', 'bread', 'potato', 'sugar', 'flour'];
    return !highCarb.some(carb => ingredient.name.toLowerCase().includes(carb));
  }

  private isPaleoApproved(ingredient: Ingredient): boolean {
    const nonPaleo = ['grain', 'legume', 'dairy', 'processed', 'sugar'];
    return !nonPaleo.some(item => ingredient.name.toLowerCase().includes(item));
  }

  private isHalal(ingredient: Ingredient): boolean {
    const nonHalal = ['pork', 'bacon', 'ham', 'alcohol', 'wine'];
    return !nonHalal.some(item => ingredient.name.toLowerCase().includes(item));
  }

  private isKosher(ingredient: Ingredient): boolean {
    const nonKosher = ['pork', 'shellfish', 'rabbit', 'camel'];
    return !nonKosher.some(item => ingredient.name.toLowerCase().includes(item));
  }
}
```

### Phase 2 Deliverables Checklist

- [ ] Vision service integrated and caching implemented
- [ ] Meal analyzer working for both image and text input
- [ ] Constraint engine filtering candidates deterministically
- [ ] Candidate generator producing diverse rescue options
- [ ] LLM ranking layer with structured output
- [ ] Validation service performing safety checks
- [ ] Complete AI pipeline: Input → Vision → Extraction → Constraints → Candidates → Ranking → Validation → Output
- [ ] All services have unit tests
- [ ] API endpoints returning properly typed responses
- [ ] Error handling for AI failures
- [ ] Latency within targets (P95 < 3s for full pipeline)
- [ ] Cost tracking per API call

---

[This document continues with Phases 3-7 in subsequent sections...]
