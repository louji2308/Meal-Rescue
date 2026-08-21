# Meal Rescue - Comprehensive Testing Strategy

## Executive Summary

This document defines a **senior-level, production-grade testing strategy** for Meal Rescue. Testing is not an afterthought—it is integral to engineering quality, AI reliability, and user trust.

**Testing Philosophy:** Test like a human senior developer, not like an AI agent. Every test must have a clear purpose, validate real-world behavior, and catch actual bugs—not just achieve coverage metrics.

---

## Testing Pyramid

```
                    ┌─────────────┐
                   │   E2E       │  10% - Full user flows
                  │   Tests      │  Chrome DevTools MCP
                 │───────────────│
                │  Integration   │  20% - Service interactions
               │     Tests      │  API contracts, DB integration
              │─────────────────│
             │    Unit Tests    │  70% - Individual functions
            │   (Services,     │  Pure functions, utilities
           │     Components)   │
          └─────────────────────┘
```

### Test Distribution by Type

| Test Type | Count (Target) | Execution Time | Frequency | Owner |
|-----------|----------------|----------------|-----------|-------|
| Unit Tests | 300+ | <5ms each | Every commit | Developers |
| Integration Tests | 50+ | <100ms each | Every PR | Developers |
| E2E Tests | 20+ | <30s each | Nightly + pre-release | QA Engineers |
| Visual Regression | 40+ screens | <10s each | Every PR | Design System |
| Performance Tests | 15+ scenarios | <2min each | Weekly | Performance Team |
| Security Tests | 25+ vectors | <1min each | Weekly | Security Team |
| AI Quality Tests | 100+ prompts | <5s each | Every prompt change | ML Engineers |

---

## Phase 1: Unit Testing

### Backend Unit Tests

#### Service Layer Testing

```typescript
// apps/backend/src/services/__tests__/meal-analyzer.service.test.ts
import { MealAnalyzerService } from '../meal-analyzer.service';
import { VisionService } from '../ai/vision.service';
import { IngredientDatabase } from '../../tools/ingredient-db.tool';
import { ComponentAnalyzer } from '../component-analyzer.service';

describe('MealAnalyzerService', () => {
  let mealAnalyzer: MealAnalyzerService;
  let mockVisionService: jest.Mocked<VisionService>;
  let mockIngredientDb: jest.Mocked<IngredientDatabase>;
  let mockComponentAnalyzer: jest.Mocked<ComponentAnalyzer>;

  beforeEach(() => {
    mockVisionService = {
      analyzeImage: jest.fn(),
    } as any;

    mockIngredientDb = {
      findBestMatch: jest.fn(),
    } as any;

    mockComponentAnalyzer = {
      analyze: jest.fn(),
    } as any;

    mealAnalyzer = new MealAnalyzerService(
      mockVisionService,
      mockIngredientDb,
      mockComponentAnalyzer
    );
  });

  describe('analyzeFromImage', () => {
    it('should return structured meal analysis with high confidence', async () => {
      // Arrange
      const imageBuffer = Buffer.from('test-image');
      const visionResult = {
        foods: [{ name: 'instant noodles', confidence: 0.94 }],
        ingredients: [
          { name: 'wheat noodles', confidence: 0.94, state: 'cooked' as const }
        ],
        components: { protein: false, fiber: false, healthy_fats: false, carbs: true },
        confidence: { overall: 0.92 },
        uncertaintyFlags: [],
      };

      mockVisionService.analyzeImage.mockResolvedValue(visionResult);
      mockIngredientDb.findBestMatch.mockResolvedValue({
        standardName: 'wheat noodles',
        category: 'grain',
      });
      mockComponentAnalyzer.analyze.mockResolvedValue({
        protein: false,
        fiber: false,
        healthyFats: false,
        carbohydrates: true,
      });

      // Act
      const result = await mealAnalyzer.analyzeFromImage(imageBuffer, 'user-123');

      // Assert
      expect(result.mealId).toBeDefined();
      expect(result.detectedFoods).toHaveLength(1);
      expect(result.detectedFoods[0].name).toBe('instant noodles');
      expect(result.confidenceScores.overall).toBeGreaterThan(0.9);
      expect(result.requiresConfirmation).toBe(false);
    });

    it('should require confirmation when confidence is low', async () => {
      // Arrange
      const visionResult = {
        foods: [{ name: 'unknown dish', confidence: 0.52 }],
        ingredients: [],
        components: { protein: false, fiber: false, healthy_fats: false, carbs: false },
        confidence: { overall: 0.52 },
        uncertaintyFlags: [
          { item: 'main dish', reason: 'poor lighting', confidence: 0.52 }
        ],
      };

      mockVisionService.analyzeImage.mockResolvedValue(visionResult);

      // Act
      const result = await mealAnalyzer.analyzeFromImage(Buffer.from('test'), 'user-123');

      // Assert
      expect(result.requiresConfirmation).toBe(true);
      expect(result.uncertaintyFlags).toHaveLength(1);
    });

    it('should handle vision service failures gracefully', async () => {
      // Arrange
      mockVisionService.analyzeImage.mockRejectedValue(new Error('Vision API timeout'));

      // Act & Assert
      await expect(mealAnalyzer.analyzeFromImage(Buffer.from('test'), 'user-123'))
        .rejects.toThrow('Vision API timeout');
    });
  });

  describe('analyzeFromText', () => {
    it('should extract structured data from simple text input', async () => {
      // Arrange
      const description = 'instant noodles';

      // Act
      const result = await mealAnalyzer.analyzeFromText(description, 'user-123');

      // Assert
      expect(result.detectedFoods).toBeDefined();
      expect(result.requiresConfirmation).toBe(false);
      expect(result.confidenceScores.overall).toBeGreaterThan(0.8);
    });

    it('should handle complex descriptions with multiple foods', async () => {
      // Arrange
      const description = 'leftover rice with chicken and vegetables from last night';

      // Act
      const result = await mealAnalyzer.analyzeFromText(description, 'user-123');

      // Assert
      expect(result.detectedFoods.length).toBeGreaterThan(0);
      expect(result.detectedIngredients.some(i => i.name === 'rice')).toBe(true);
      expect(result.detectedIngredients.some(i => i.name === 'chicken')).toBe(true);
    });
  });
});
```

#### Constraint Engine Testing

```typescript
// apps/backend/src/services/__tests__/constraint-engine.service.test.ts
import { ConstraintEngineService } from '../constraint-engine.service';

describe('ConstraintEngineService', () => {
  let constraintEngine: ConstraintEngineService;

  beforeEach(() => {
    constraintEngine = new ConstraintEngineService();
  });

  describe('filterCandidates', () => {
    const baseCandidates = [
      {
        id: 'cand-1',
        additions: [{ name: 'egg', prepTime: 3 }],
        estimatedTime: 3,
        estimatedCost: 'low' as const,
        cookingSteps: 1,
        requiredEquipment: ['pan'],
        compatibilityScore: 0.8,
      },
      {
        id: 'cand-2',
        additions: [{ name: 'spinach', prepTime: 2 }],
        estimatedTime: 2,
        estimatedCost: 'low' as const,
        cookingSteps: 0,
        requiredEquipment: [],
        compatibilityScore: 0.7,
      },
      {
        id: 'cand-3',
        additions: [{ name: 'salmon', prepTime: 15 }],
        estimatedTime: 15,
        estimatedCost: 'high' as const,
        cookingSteps: 3,
        requiredEquipment: ['oven', 'pan'],
        compatibilityScore: 0.6,
      },
    ];

    it('should filter by time constraint', () => {
      // Arrange
      const constraints = { timeMinutes: 5 };

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered).toHaveLength(2);
      expect(filtered.every(c => c.estimatedTime <= 5)).toBe(true);
      expect(filtered.some(c => c.id === 'cand-3')).toBe(false);
    });

    it('should filter by budget constraint', () => {
      // Arrange
      const constraints = { budget: 'low' as const };

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered).toHaveLength(2);
      expect(filtered.every(c => c.estimatedCost === 'low')).toBe(true);
      expect(filtered.some(c => c.id === 'cand-3')).toBe(false);
    });

    it('should filter by cooking constraint', () => {
      // Arrange
      const constraints = { cookingRequired: false };

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('cand-2');
      expect(filtered[0].cookingSteps).toBe(0);
    });

    it('should filter by equipment constraint', () => {
      // Arrange
      const constraints = { equipmentAvailable: ['pan'] };

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered).toHaveLength(2);
      expect(filtered.every(c => 
        c.requiredEquipment.every(eq => constraints.equipmentAvailable!.includes(eq))
      )).toBe(true);
      expect(filtered.some(c => c.id === 'cand-3')).toBe(false); // needs oven
    });

    it('should filter by avoided ingredients', () => {
      // Arrange
      const constraints = { avoidIngredients: ['egg'] };

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered.some(c => c.additions.some(a => a.name === 'egg'))).toBe(false);
      expect(filtered.some(c => c.id === 'cand-1')).toBe(false);
    });

    it('should HARD filter by allergies (critical safety)', () => {
      // Arrange
      const constraints = { allergies: ['eggs'] };

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered.some(c => c.additions.some(a => a.name === 'egg'))).toBe(false);
      expect(filtered.some(c => c.id === 'cand-1')).toBe(false);
    });

    it('should sort by pantry compatibility', () => {
      // Arrange
      const constraints = {};
      const pantry = [{ name: 'egg' }, { name: 'spinach' }];

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, pantry);

      // Assert
      expect(filtered[0].compatibilityScore).toBeGreaterThanOrEqual(filtered[1].compatibilityScore);
    });

    it('should apply multiple constraints simultaneously', () => {
      // Arrange
      const constraints = {
        timeMinutes: 5,
        budget: 'low' as const,
        cookingRequired: false,
      };

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('cand-2');
    });

    it('should return empty array when no candidates match', () => {
      // Arrange
      const constraints = { timeMinutes: 1 }; // Too restrictive

      // Act
      const filtered = constraintEngine.filterCandidates(baseCandidates, constraints, []);

      // Assert
      expect(filtered).toHaveLength(0);
    });
  });
});
```

### Mobile Unit Tests

#### Component Testing

```typescript
// apps/mobile/src/components/__tests__/RescueCard.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RescueCard } from '../RescueCard';

describe('RescueCard', () => {
  const defaultProps = {
    originalMeal: { name: 'Instant Noodles' },
    recommendation: {
      action: 'Add an egg and vegetables',
      why: 'Adds protein and fiber for a more satisfying meal',
      time: 4,
      effort: 'Low' as const,
      usesWhatYouHave: true,
    },
    onRescue: jest.fn(),
    onSwap: jest.fn(),
    onDontHave: jest.fn(),
    onKeepAsIs: jest.fn(),
  };

  it('should display meal and rescue information correctly', () => {
    // Arrange & Act
    render(<RescueCard {...defaultProps} />);

    // Assert
    expect(screen.getByText('Your meal:')).toBeTruthy();
    expect(screen.getByText('Instant Noodles')).toBeTruthy();
    expect(screen.getByText('Rescue:')).toBeTruthy();
    expect(screen.getByText('Add an egg and vegetables')).toBeTruthy();
    expect(screen.getByText(/Adds protein and fiber/)).toBeTruthy();
    expect(screen.getByText('4 minutes')).toBeTruthy();
    expect(screen.getByText('Low effort')).toBeTruthy();
  });

  it('should show "Uses what you have" badge when applicable', () => {
    // Arrange & Act
    render(<RescueCard {...defaultProps} />);

    // Assert
    expect(screen.getByText('Uses what you have')).toBeTruthy();
  });

  it('should call onRescue when primary button tapped', () => {
    // Arrange
    const onRescue = jest.fn();
    render(<RescueCard {...defaultProps} onRescue={onRescue} />);

    // Act
    const rescueButton = screen.getByText('Rescue My Meal');
    fireEvent.press(rescueButton);

    // Assert
    expect(onRescue).toHaveBeenCalledTimes(1);
  });

  it('should call onSwap when swap button tapped', () => {
    // Arrange
    const onSwap = jest.fn();
    render(<RescueCard {...defaultProps} onSwap={onSwap} />);

    // Act
    const swapButton = screen.getByText('Swap');
    fireEvent.press(swapButton);

    // Assert
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it('should call onDontHave when dont have button tapped', () => {
    // Arrange
    const onDontHave = jest.fn();
    render(<RescueCard {...defaultProps} onDontHave={onDontHave} />);

    // Act
    const dontHaveButton = screen.getByText("I Don't Have These");
    fireEvent.press(dontHaveButton);

    // Assert
    expect(onDontHave).toHaveBeenCalledTimes(1);
  });

  it('should call onKeepAsIs when keep as is button tapped', () => {
    // Arrange
    const onKeepAsIs = jest.fn();
    render(<RescueCard {...defaultProps} onKeepAsIs={onKeepAsIs} />);

    // Act
    const keepAsIsButton = screen.getByText('Keep It As-Is');
    fireEvent.press(keepAsIsButton);

    // Assert
    expect(onKeepAsIs).toHaveBeenCalledTimes(1);
  });

  it('should hide "Uses what you have" badge when false', () => {
    // Arrange
    const props = {
      ...defaultProps,
      recommendation: {
        ...defaultProps.recommendation,
        usesWhatYouHave: false,
      },
    };

    // Act
    render(<RescueCard {...props} />);

    // Assert
    expect(screen.queryByText('Uses what you have')).toBeFalsy();
  });
});
```

#### Screen Testing

```typescript
// apps/mobile/src/screens/__tests__/CaptureScreen.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { CaptureScreen } from '../CaptureScreen';
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-image-picker');

describe('CaptureScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show three input mode options', () => {
    // Arrange & Act
    render(<CaptureScreen navigation={navigation as any} route={{}} />);

    // Assert
    expect(screen.getByTestId('camera-button')).toBeTruthy();
    expect(screen.getByTestId('text-button')).toBeTruthy();
    expect(screen.getByTestId('voice-button')).toBeTruthy();
  });

  it('should open camera when camera button tapped', async () => {
    // Arrange
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'test-uri' }],
    });

    // Act
    render(<CaptureScreen navigation={navigation as any} route={{}} />);
    fireEvent.press(screen.getByTestId('camera-button'));

    // Assert
    await waitFor(() => {
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({
        mediaTypes: 'Images',
        allowsEditing: false,
        aspect: undefined,
        quality: 0.8,
      });
    });
  });

  it('should navigate to text input when text button tapped', () => {
    // Arrange & Act
    render(<CaptureScreen navigation={navigation as any} route={{}} />);
    fireEvent.press(screen.getByTestId('text-button'));

    // Assert
    expect(navigation.navigate).toHaveBeenCalledWith('TextInput');
  });

  it('should show error if camera permission denied', async () => {
    // Arrange
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      status: 'denied',
    });

    // Act
    render(<CaptureScreen navigation={navigation as any} route={{}} />);
    fireEvent.press(screen.getByTestId('camera-button'));

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/camera permission/i)).toBeTruthy();
    });
  });
});
```

---

## Phase 2: Integration Testing

### API Integration Tests

```typescript
// apps/backend/tests/integration/meal-analysis.integration.test.ts
import request from 'supertest';
import { buildApp } from '../../src/app';
import { sequelize } from '../../src/database';
import { createTestUser, cleanupDatabase } from '../helpers';

describe('Meal Analysis API', () => {
  let app: ReturnType<typeof buildApp>;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    authToken = user.token;
  });

  afterAll(async () => {
    await cleanupDatabase();
    await app.close();
  });

  describe('POST /api/v1/meal/analyze', () => {
    it('should analyze text meal description successfully', async () => {
      // Arrange
      const payload = {
        input: 'instant noodles',
        inputType: 'text',
      };

      // Act
      const response = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(200);

      // Assert
      expect(response.body.mealId).toBeDefined();
      expect(response.body.detectedFoods).toBeDefined();
      expect(response.body.detectedFoods.length).toBeGreaterThan(0);
      expect(response.body.confidenceScores).toBeDefined();
    });

    it('should reject requests without authentication', async () => {
      // Arrange
      const payload = {
        input: 'instant noodles',
        inputType: 'text',
      };

      // Act
      const response = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .send(payload)
        .expect(401);

      // Assert
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject invalid input types', async () => {
      // Arrange
      const payload = {
        input: 'instant noodles',
        inputType: 'invalid-type',
      };

      // Act
      const response = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(400);

      // Assert
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INVALID_INPUT_TYPE');
    });

    it('should handle empty input gracefully', async () => {
      // Arrange
      const payload = {
        input: '',
        inputType: 'text',
      };

      // Act
      const response = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('EMPTY_INPUT');
    });
  });

  describe('POST /api/v1/rescue/generate', () => {
    let mealId: string;

    beforeEach(async () => {
      // Create a meal first
      const mealResponse = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ input: 'instant noodles', inputType: 'text' })
        .expect(200);

      mealId = mealResponse.body.mealId;
    });

    it('should generate rescue recommendation', async () => {
      // Arrange
      const payload = {
        mealId,
        constraints: {
          timeMinutes: 5,
          budget: 'low',
        },
      };

      // Act
      const response = await request(app.getServer())
        .post('/api/v1/rescue/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(200);

      // Assert
      expect(response.body.rescueId).toBeDefined();
      expect(response.body.recommendation).toBeDefined();
      expect(response.body.recommendation.action).toBeDefined();
      expect(response.body.recommendation.reasoning).toBeDefined();
      expect(response.body.actions).toEqual(
        expect.arrayContaining(['rescue', 'swap', 'dont_have', 'keep_as_is'])
      );
    });

    it('should respect time constraints in recommendations', async () => {
      // Arrange
      const payload = {
        mealId,
        constraints: {
          timeMinutes: 2, // Very restrictive
        },
      };

      // Act
      const response = await request(app.getServer())
        .post('/api/v1/rescue/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(200);

      // Assert
      expect(response.body.recommendation.estimatedTime).toBeLessThanOrEqual(2);
    });

    it('should return 404 for non-existent meal', async () => {
      // Arrange
      const payload = {
        mealId: 'non-existent-meal-id',
        constraints: {},
      };

      // Act
      const response = await request(app.getServer())
        .post('/api/v1/rescue/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(404);

      // Assert
      expect(response.body.error.code).toBe('MEAL_NOT_FOUND');
    });
  });
});
```

### Database Integration Tests

```typescript
// apps/backend/tests/integration/database.integration.test.ts
import { sequelize } from '../../src/database';
import { User, Meal, Rescue, Feedback } from '../../src/database/models';

describe('Database Integration', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('Rescue Model', () => {
    it('should create rescue with all required fields', async () => {
      // Arrange
      const user = await User.create({ email: 'test@example.com' });
      const meal = await Meal.create({
        userId: user.id,
        originalInput: 'instant noodles',
        inputType: 'text',
        detectedFoods: [{ name: 'instant noodles' }],
        detectedIngredients: [],
        detectedComponents: { protein: false, fiber: false },
      });

      // Act
      const rescue = await Rescue.create({
        mealId: meal.id,
        userId: user.id,
        originalMeal: { name: 'instant noodles' },
        detectedIngredients: [],
        constraints: { timeMinutes: 5 },
        candidatesGenerated: [{ id: 'cand-1' }],
        selectedRecommendation: { action: 'add egg' },
        reasoning: 'adds protein',
        userDecision: 'accepted',
      });

      // Assert
      expect(rescue.id).toBeDefined();
      expect(rescue.userDecision).toBe('accepted');
      expect(rescue.createdAt).toBeDefined();
    });

    it('should maintain proper associations', async () => {
      // Arrange
      const user = await User.create({ email: 'test2@example.com' });
      const meal = await Meal.create({
        userId: user.id,
        originalInput: 'toast',
        inputType: 'text',
        detectedFoods: [],
        detectedIngredients: [],
        detectedComponents: {},
      });

      // Act
      const rescue = await Rescue.create({
        mealId: meal.id,
        userId: user.id,
        originalMeal: {},
        detectedIngredients: [],
        constraints: {},
        candidatesGenerated: [],
        selectedRecommendation: {},
        reasoning: 'test',
        userDecision: 'accepted',
      });

      const feedback = await Feedback.create({
        rescueId: rescue.id,
        userId: user.id,
        feedbackType: 'satisfaction',
        feedbackValue: { rating: 'better' },
      });

      // Assert - Verify associations work
      const rescueWithRelations = await Rescue.findByPk(rescue.id, {
        include: [Meal, User, Feedback],
      });

      expect(rescueWithRelations?.meal).toBeDefined();
      expect(rescueWithRelations?.user).toBeDefined();
      expect(rescueWithRelations?.feedbacks).toBeDefined();
      expect(rescueWithRelations?.feedbacks?.length).toBe(1);
    });

    it('should index rescues by user for efficient querying', async () => {
      // Arrange
      const user = await User.create({ email: 'test3@example.com' });
      
      // Create multiple rescues
      const meal = await Meal.create({
        userId: user.id,
        originalInput: 'test',
        inputType: 'text',
        detectedFoods: [],
        detectedIngredients: [],
        detectedComponents: {},
      });

      await Promise.all([
        Rescue.create({
          mealId: meal.id,
          userId: user.id,
          originalMeal: {},
          detectedIngredients: [],
          constraints: {},
          candidatesGenerated: [],
          selectedRecommendation: {},
          reasoning: 'test',
          userDecision: 'accepted',
          satisfactionFeedback: 'better',
        }),
        Rescue.create({
          mealId: meal.id,
          userId: user.id,
          originalMeal: {},
          detectedIngredients: [],
          constraints: {},
          candidatesGenerated: [],
          selectedRecommendation: {},
          reasoning: 'test',
          userDecision: 'rejected',
          satisfactionFeedback: 'not_for_me',
        }),
      ]);

      // Act - Query should be fast due to index
      const startTime = Date.now();
      const userRescues = await Rescue.findAll({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']],
      });
      const queryTime = Date.now() - startTime;

      // Assert
      expect(userRescues).toHaveLength(2);
      expect(queryTime).toBeLessThan(100); // Should be very fast with index
    });
  });
});
```

---

## Phase 3: End-to-End Testing (Chrome DevTools MCP)

### E2E Test Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   E2E TEST EXECUTION                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Test      │     │   Chrome    │     │   Mobile    │   │
│  │   Runner    │────▶│   DevTools  │────▶│   App       │   │
│  │   (Jest)    │     │   MCP       │     │   (Expo)    │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Test      │     │   Browser   │     │   Backend   │   │
│  │   Reports   │◀────│   Automation│◀────│   API       │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### E2E Test Configuration

```typescript
// tests/e2e/jest.config.e2e.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./setup/e2e.setup.ts'],
  testMatch: ['**/tests/e2e/**/*.test.ts'],
  testTimeout: 60000, // 60 seconds for E2E tests
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports/e2e', outputName: 'results.xml' }],
  ],
  maxWorkers: 2, // Limit parallel E2E tests
};
```

### Core E2E Test Flows

```typescript
// tests/e2e/core-rescue-loop.test.ts
import { chromium, Browser, Page } from 'playwright';
import { startDevServer } from '../helpers/server';
import { startExpoApp } from '../helpers/expo';

describe('Core Rescue Loop - E2E', () => {
  let browser: Browser;
  let page: Page;
  let serverUrl: string;

  beforeAll(async () => {
    // Start backend
    serverUrl = await startDevServer();
    
    // Start browser with DevTools MCP
    browser = await chromium.launch({
      headless: false, // Show browser for debugging
      slowMo: 100, // Slow down for visibility
    });
    
    page = await browser.newPage();
    
    // Enable Chrome DevTools Protocol
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    await client.send('Network.enable');
    
    // Navigate to app
    await page.goto(serverUrl);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should complete full rescue loop successfully', async () => {
    // Step 1: Sign up / Login
    await testSignUp(page);
    
    // Step 2: Navigate to home screen
    await expect(page).toHaveURL(/\/home/);
    
    // Step 3: Capture meal (text input for reliability)
    await testMealCapture(page);
    
    // Step 4: Confirm meal understanding
    await testMealConfirmation(page);
    
    // Step 5: Select constraints
    await testConstraintSelection(page);
    
    // Step 6: View rescue recommendation
    await testRescueDisplay(page);
    
    // Step 7: Accept rescue
    await testRescueAcceptance(page);
    
    // Step 8: Provide feedback
    await testFeedbackSubmission(page);
    
    // Step 9: Verify personalization updated
    await testPersonalizationUpdate(page);
  });

  it('should handle edge case: low confidence meal detection', async () => {
    // Navigate to capture
    await page.click('[data-testid="capture-button"]');
    
    // Enter ambiguous input
    await page.fill('[data-testid="meal-input"]', 'some food');
    await page.click('[data-testid="submit-button"]');
    
    // Should show confirmation dialog
    await expect(page.locator('[data-testid="confirmation-dialog"]')).toBeVisible();
    
    // Edit the detection
    await page.click('[data-testid="edit-button"]');
    await page.fill('[data-testid="edit-input"]', 'instant noodles');
    await page.click('[data-testid="confirm-edit"]');
    
    // Continue with rescue
    await expect(page.locator('[data-testid="rescue-card"]')).toBeVisible();
  });

  it('should handle edge case: no feasible rescues', async () => {
    // Set extremely restrictive constraints
    await page.click('[data-testid="constraint-time"]');
    await page.fill('[data-testid="custom-time"]', '0'); // Impossible
    
    // Submit
    await page.click('[data-testid="generate-rescue"]');
    
    // Should show helpful message, not crash
    await expect(page.locator('[data-testid="no-rescues-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="relax-constraints-suggestion"]')).toBeVisible();
  });

  it('should respect allergy constraints (safety critical)', async () => {
    // Set allergy in profile
    await page.click('[data-testid="profile-tab"]');
    await page.click('[data-testid="allergies-settings"]');
    await page.fill('[data-testid="add-allergy"]', 'peanuts');
    await page.click('[data-testid="save-allergies"]');
    
    // Capture meal
    await page.click('[data-testid="capture-button"]');
    await page.fill('[data-testid="meal-input"]', 'pad thai');
    await page.click('[data-testid="submit-button"]');
    
    // Generate rescue
    await page.click('[data-testid="generate-rescue"]');
    
    // Verify NO peanut-containing recommendations
    const rescueText = await page.locator('[data-testid="rescue-recommendation"]').textContent();
    expect(rescueText?.toLowerCase()).not.toContain('peanut');
  });
});

// Helper functions for each step
async function testSignUp(page: Page) {
  await page.fill('[data-testid="signup-email"]', `test-${Date.now()}@example.com`);
  await page.fill('[data-testid="signup-password"]', 'TestPassword123!');
  await page.click('[data-testid="signup-button"]');
  await expect(page).toHaveURL(/\/home/);
}

async function testMealCapture(page: Page) {
  await page.click('[data-testid="capture-button"]');
  await page.fill('[data-testid="meal-input"]', 'instant noodles');
  await page.click('[data-testid="submit-button"]');
}

async function testMealConfirmation(page: Page) {
  await expect(page.locator('[data-testid="detected-foods"]')).toBeVisible();
  await page.click('[data-testid="confirm-yes"]');
}

async function testConstraintSelection(page: Page) {
  await page.click('[data-testid="constraint-5min"]');
  await page.click('[data-testid="constraint-low-budget"]');
  await page.click('[data-testid="next-button"]');
}

async function testRescueDisplay(page: Page) {
  await expect(page.locator('[data-testid="rescue-card"]')).toBeVisible();
  await expect(page.locator('[data-testid="rescue-action"]')).toContainText('Add');
  await expect(page.locator('[data-testid="rescue-time"]')).toBeVisible();
}

async function testRescueAcceptance(page: Page) {
  await page.click('[data-testid="rescue-my-meal-button"]');
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
}

async function testFeedbackSubmission(page: Page) {
  await expect(page.locator('[data-testid="feedback-prompt"]')).toBeVisible();
  await page.click('[data-testid="feedback-better"]');
  await expect(page.locator('[data-testid="thank-you"]')).toBeVisible();
}

async function testPersonalizationUpdate(page: Page) {
  // Navigate to profile
  await page.click('[data-testid="profile-tab"]');
  
  // Check that preference was learned
  await expect(page.locator('[data-testid="learned-preferences"]')).toBeVisible();
}
```

### Performance Validation in E2E

```typescript
// tests/e2e/performance-validation.test.ts
import { chromium } from 'playwright';

describe('Performance Validation', () => {
  it('should meet latency targets for core operations', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Enable performance metrics
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    
    const metrics: Record<string, number[]> = {
      'meal-analysis': [],
      'rescue-generation': [],
      'feedback-submission': [],
    };
    
    // Run operation 10 times to get P95
    for (let i = 0; i < 10; i++) {
      // Measure meal analysis
      const analysisStart = Date.now();
      await page.goto('/capture');
      await page.fill('[data-testid="meal-input"]', 'instant noodles');
      await page.click('[data-testid="submit-button"]');
      await page.waitForSelector('[data-testid="detected-foods"]');
      metrics['meal-analysis'].push(Date.now() - analysisStart);
      
      // Measure rescue generation
      const rescueStart = Date.now();
      await page.click('[data-testid="constraint-5min"]');
      await page.click('[data-testid="generate-rescue"]');
      await page.waitForSelector('[data-testid="rescue-card"]');
      metrics['rescue-generation'].push(Date.now() - rescueStart);
      
      // Measure feedback submission
      const feedbackStart = Date.now();
      await page.click('[data-testid="feedback-better"]');
      await page.waitForSelector('[data-testid="thank-you"]');
      metrics['feedback-submission'].push(Date.now() - feedbackStart);
      
      // Reset for next iteration
      await page.goto('/home');
    }
    
    await browser.close();
    
    // Calculate P95 for each operation
    const p95 = (arr: number[]) => arr.sort((a, b) => a - b)[Math.floor(arr.length * 0.95)];
    
    console.log('Performance Results:', {
      'meal-analysis-p95': `${p95(metrics['meal-analysis'])}ms`,
      'rescue-generation-p95': `${p95(metrics['rescue-generation'])}ms`,
      'feedback-submission-p95': `${p95(metrics['feedback-submission'])}ms`,
    });
    
    // Assert against targets
    expect(p95(metrics['meal-analysis'])).toBeLessThan(3000); // 3s target
    expect(p95(metrics['rescue-generation'])).toBeLessThan(3000); // 3s target
    expect(p95(metrics['feedback-submission'])).toBeLessThan(500); // 500ms target
  });
});
```

---

## Phase 4: AI Quality Testing

### Prompt Quality Tests

```typescript
// tests/ai/prompt-quality.test.ts
import { LLMService } from '../../src/services/ai/llm.service';
import { visionAnalysisPrompt } from '../../src/prompts/vision-analysis.prompt';
import { rankingPrompt } from '../../src/prompts/ranking.prompt';

describe('AI Prompt Quality', () => {
  let llm: LLMService;

  beforeAll(() => {
    llm = new LLMService();
  });

  describe('Vision Analysis Prompt', () => {
    it('should produce valid JSON output', async () => {
      // Arrange
      const testImageDescription = 'A bowl of instant noodles with broth';
      
      // Act
      const result = await llm.generateWithPrompt(visionAnalysisPrompt, testImageDescription);
      
      // Assert
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.foods).toBeDefined();
      expect(parsed.ingredients).toBeDefined();
      expect(parsed.components).toBeDefined();
    });

    it('should include confidence scores for all detections', async () => {
      // Arrange
      const testImageDescription = 'Toast with jam and butter';
      
      // Act
      const result = await llm.generateWithPrompt(visionAnalysisPrompt, testImageDescription);
      const parsed = JSON.parse(result);
      
      // Assert
      parsed.foods.forEach((food: any) => {
        expect(food.confidence).toBeDefined();
        expect(typeof food.confidence).toBe('number');
        expect(food.confidence).toBeGreaterThanOrEqual(0);
        expect(food.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should flag uncertainties when confidence is low', async () => {
      // Arrange
      const testImageDescription = 'Blurry photo of some kind of Asian dish';
      
      // Act
      const result = await llm.generateWithPrompt(visionAnalysisPrompt, testImageDescription);
      const parsed = JSON.parse(result);
      
      // Assert
      expect(parsed.uncertainties).toBeDefined();
      expect(parsed.uncertainties.length).toBeGreaterThan(0);
    });

    it('should NOT hallucinate ingredients not present', async () => {
      // Arrange
      const testImageDescription = 'Plain white rice, nothing else';
      
      // Act
      const result = await llm.generateWithPrompt(visionAnalysisPrompt, testImageDescription);
      const parsed = JSON.parse(result);
      
      // Assert
      const ingredientNames = parsed.ingredients.map((i: any) => i.name.toLowerCase());
      expect(ingredientNames.some((n: string) => n.includes('chicken'))).toBe(false);
      expect(ingredientNames.some((n: string) => n.includes('vegetable'))).toBe(false);
    });
  });

  describe('Ranking Prompt', () => {
    it('should rank candidates consistently', async () => {
      // Arrange
      const testContext = {
        meal: ['instant noodles'],
        missingComponents: ['protein', 'fiber'],
        constraints: { timeMinutes: 5 },
        candidates: [
          { id: 'c1', additions: ['egg'], time: 3 },
          { id: 'c2', additions: ['chicken breast'], time: 15 },
          { id: 'c3', additions: ['spinach'], time: 2 },
        ],
      };
      
      // Act
      const result1 = await llm.generateWithPrompt(rankingPrompt, testContext);
      const result2 = await llm.generateWithPrompt(rankingPrompt, testContext);
      
      // Assert - Rankings should be similar (not necessarily identical due to temperature)
      const parsed1 = JSON.parse(result1);
      const parsed2 = JSON.parse(result2);
      
      expect(parsed1.rankedCandidates[0].candidateId).toBe(parsed2.rankedCandidates[0].candidateId);
    });

    it('should provide actionable explanations', async () => {
      // Arrange
      const testContext = {
        meal: ['toast'],
        missingComponents: ['protein'],
        constraints: {},
        candidates: [{ id: 'c1', additions: ['peanut butter'], time: 1 }],
      };
      
      // Act
      const result = await llm.generateWithPrompt(rankingPrompt, testContext);
      const parsed = JSON.parse(result);
      
      // Assert
      expect(parsed.topRecommendation.explanation).toBeDefined();
      expect(parsed.topRecommendation.explanation.length).toBeGreaterThan(20);
      expect(parsed.topRecommendation.explanation.length).toBeLessThan(300); // Not too long
    });
  });
});
```

### Hallucination Detection Tests

```typescript
// tests/ai/hallucination-detection.test.ts
describe('Hallucination Detection', () => {
  it('should detect when vision model invents ingredients', async () => {
    // This test would use known ground-truth images
    // and compare AI output against labeled ingredients
    
    const groundTruth = {
      imageId: 'test-001',
      actualIngredients: ['noodles', 'seasoning packet', 'water'],
    };
    
    const aiOutput = await visionService.analyzeImage(testImage);
    
    // Check for hallucinated ingredients
    const hallucinatedIngredients = aiOutput.ingredients.filter(
      ing => !groundTruth.actualIngredients.some(
        actual => ing.name.toLowerCase().includes(actual)
      )
    );
    
    // Allow some inference, but flag excessive hallucination
    const hallucinationRate = hallucinatedIngredients.length / aiOutput.ingredients.length;
    expect(hallucinationRate).toBeLessThan(0.3); // Max 30% inferred ingredients
  });

  it('should maintain low hallucination rate across diverse inputs', async () => {
    const testCases = [
      { name: 'simple', ingredients: ['bread', 'butter'] },
      { name: 'complex', ingredients: ['rice', 'chicken', 'broccoli', 'soy sauce'] },
      { name: 'ambiguous', ingredients: ['mixed salad'] },
    ];
    
    const hallucinationRates: number[] = [];
    
    for (const testCase of testCases) {
      const result = await visionService.analyzeImage(getTestImage(testCase.name));
      const hallucinated = result.ingredients.filter(
        ing => !testCase.ingredients.some(actual => 
          ing.name.toLowerCase().includes(actual)
        )
      );
      
      hallucinationRates.push(hallucinated.length / result.ingredients.length);
    }
    
    const avgHallucinationRate = hallucinationRates.reduce((a, b) => a + b) / hallucinationRates.length;
    expect(avgHallucinationRate).toBeLessThan(0.2); // Average < 20%
  });
});
```

---

## Phase 5: Security Testing

### Security Test Suite

```typescript
// tests/security/security-tests.test.ts
import request from 'supertest';

describe('Security Tests', () => {
  describe('Authentication & Authorization', () => {
    it('should reject requests with expired JWT', async () => {
      // Arrange
      const expiredToken = generateExpiredJWT();
      
      // Act
      const response = await request(app.getServer())
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      
      // Assert
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject requests with invalid signature', async () => {
      // Arrange
      const tamperedToken = tamperJWTSignature(validToken);
      
      // Act
      const response = await request(app.getServer())
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
      
      // Assert
      expect(response.body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('should prevent IDOR (Insecure Direct Object Reference)', async () => {
      // Arrange
      const user1 = await createUser();
      const user2 = await createUser();
      const user1Rescue = await createRescue(user1.id);
      
      // Act - User 2 tries to access User 1's rescue
      const response = await request(app.getServer())
        .get(`/api/v1/rescue/${user1Rescue.id}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .expect(403);
      
      // Assert
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Input Validation', () => {
    it('should sanitize SQL injection attempts', async () => {
      // Arrange
      const maliciousInput = "'; DROP TABLE users; --";
      
      // Act
      const response = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ input: maliciousInput, inputType: 'text' })
        .expect(400); // Should be rejected as invalid
      
      // Assert - Table should still exist
      const tableExists = await checkTableExists('users');
      expect(tableExists).toBe(true);
    });

    it('should prevent XSS in text inputs', async () => {
      // Arrange
      const xssPayload = '<script>alert("XSS")</script>';
      
      // Act
      const response = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ input: xssPayload, inputType: 'text' });
      
      // Assert - Response should escape HTML
      expect(response.body.detectedFoods[0].name).not.toContain('<script>');
      expect(response.body.detectedFoods[0].name).toContain('&lt;script&gt;');
    });

    it('should limit input size to prevent DoS', async () => {
      // Arrange
      const massiveInput = 'a'.repeat(1000000); // 1MB
      
      // Act
      const response = await request(app.getServer())
        .post('/api/v1/meal/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ input: massiveInput, inputType: 'text' })
        .expect(413); // Payload too large
      
      // Assert
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits per user', async () => {
      // Arrange - Make many rapid requests
      const requests = Array(100).fill(null).map(() => 
        request(app.getServer())
          .get('/api/v1/user/profile')
          .set('Authorization', `Bearer ${validToken}`)
      );
      
      // Act
      const responses = await Promise.all(requests);
      
      // Assert - Some should be rate limited
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });

  describe('Data Protection', () => {
    it('should encrypt sensitive data at rest', async () => {
      // Arrange
      const user = await createUser({ password: 'SecurePassword123!' });
      
      // Act - Query database directly
      const dbUser = await rawQuery('SELECT * FROM users WHERE id = ?', [user.id]);
      
      // Assert - Password should be hashed, not plaintext
      expect(dbUser.password).not.toBe('SecurePassword123!');
      expect(dbUser.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt format
    });

    it('should not expose sensitive data in API responses', async () => {
      // Act
      const response = await request(app.getServer())
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
      
      // Assert
      expect(response.body.password).toBeUndefined();
      expect(response.body.hashedPassword).toBeUndefined();
      expect(response.body.jwtSecret).toBeUndefined();
    });
  });
});
```

---

## Test Coverage Requirements

### Minimum Coverage Thresholds

| Category | Minimum Coverage | Critical Files Require |
|----------|------------------|------------------------|
| Services | 90% | 95% |
| Controllers | 85% | 90% |
| Utilities | 95% | 100% |
| Components | 80% | 90% |
| Screens | 75% | 85% |
| AI Prompts | N/A | 100% scenario coverage |

### Coverage Enforcement

```json
// package.json
{
  "scripts": {
    "test:coverage": "jest --coverage --coverageThreshold='{\"global\":{\"statements\":85,\"branches\":80,\"functions\":85,\"lines\":85}}'",
    "test:ci": "jest --coverage --ci --coverageReporters=text-lcov | coveralls"
  },
  "jest": {
    "coverageThreshold": {
      "global": {
        "statements": 85,
        "branches": 80,
        "functions": 85,
        "lines": 85
      },
      "src/services/": {
        "statements": 90,
        "branches": 85,
        "functions": 90,
        "lines": 90
      }
    }
  }
}
```

---

## Continuous Testing Pipeline

### GitHub Actions Integration

```yaml
# .github/workflows/testing.yml
name: Testing Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: e2e-screenshots
          path: tests/e2e/screenshots

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:security

  ai-quality-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:ai
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:performance
      - uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: reports/performance

  # Block merge if any test fails
  require-all-tests-pass:
    needs: [unit-tests, integration-tests, e2e-tests, security-tests, ai-quality-tests]
    runs-on: ubuntu-latest
    steps:
      - run: echo "All tests passed!"
```

---

## Test Reporting & Monitoring

### Test Dashboard Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Unit Test Pass Rate | 100% | <99% |
| Integration Test Pass Rate | 100% | <98% |
| E2E Test Pass Rate | 95% | <90% |
| Average Test Duration | <5 min | >10 min |
| Flaky Test Rate | 0% | >1% |
| Coverage Trend | Increasing | Decreasing 2 weeks |
| Bug Escape Rate | <5% | >10% |

### Test Failure Triage Process

```
Test Failure Detected
        ↓
┌─────────────────────┐
│ Is it flaky?        │──Yes──→ Quarantine & investigate
└─────────┬───────────┘
          No
          ↓
┌─────────────────────┐
│ Is it environment?  │──Yes──→ Fix infrastructure
└─────────┬───────────┘
          No
          ↓
┌─────────────────────┐
│ Is it test code?    │──Yes──→ Fix test
└─────────┬───────────┘
          No
          ↓
┌─────────────────────┐
│ Is it product bug?  │──Yes──→ Create Jira ticket, block release
└─────────┬───────────┘
          No
          ↓
    Escalate to engineering lead
```

---

## Testing Best Practices

### DO ✅

- Write tests that verify real user behavior
- Test edge cases and error conditions
- Mock external dependencies (AI APIs, databases)
- Use realistic test data (not just "test test")
- Keep tests independent and isolated
- Name tests clearly: `should_do_X_when_Y`
- Run tests locally before committing
- Update tests when changing functionality
- Test both success AND failure paths
- Include accessibility tests for UI

### DON'T ❌

- Don't test implementation details
- Don't write tests that always pass
- Don't skip tests to make CI faster
- Don't use `it.skip` without creating follow-up ticket
- Don't write giant test files (>500 lines)
- Don't share state between tests
- Don't rely on test execution order
- Don't test third-party libraries
- Don't ignore flaky tests
- Don't achieve coverage by testing trivial code

---

**Document Owner:** Head of Engineering
**Last Updated:** 2024-01-15
**Review Cycle:** Monthly
**Next Review:** 2024-02-15
