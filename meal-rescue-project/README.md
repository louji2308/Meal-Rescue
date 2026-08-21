# Meal Rescue - Engineering Documentation Index

## 📚 Complete Documentation Suite

This repository contains **comprehensive, production-grade engineering documentation** for building Meal Rescue—a mobile application deployable to both Android Play Store and iOS App Store.

---

## 🎯 How to Use This Documentation

This documentation suite is designed to be consumed by **AI agents, engineering teams, and senior developers** building the Meal Rescue product. Each document serves a specific purpose and audience.

### For AI Agents Building the Product

**Read documents in this order:**

1. **Start Here:** `docs/01-product-vision.md` - Understand WHAT we're building and WHY
2. **Then Read:** `architecture/02-system-architecture.md` - Understand HOW the system works
3. **Implementation Guide:** `phases/03-implementation-plan.md` - Step-by-step build instructions
4. **AI Prompts:** `system-prompts/04-ai-system-prompts.md` - LLM prompts for all AI features
5. **Product Specs:** `product-specs/05-product-management.md` - User stories, acceptance criteria
6. **Testing:** `testing/06-testing-strategy.md` - How to validate everything works

### For Human Engineers

**Jump to what you need:**

| Role | Start With | Then Read |
|------|------------|-----------|
| **Backend Engineer** | `architecture/02-system-architecture.md` | `phases/03-implementation-plan.md` (Phase 1-2) |
| **Mobile Engineer** | `architecture/02-system-architecture.md` | `phases/03-implementation-plan.md` (Phase 3) |
| **ML Engineer** | `system-prompts/04-ai-system-prompts.md` | `testing/06-testing-strategy.md` (Phase 4) |
| **Product Manager** | `product-specs/05-product-management.md` | `docs/01-product-vision.md` |
| **QA Engineer** | `testing/06-testing-strategy.md` | `phases/03-implementation-plan.md` |

---

## 📁 Document Structure

```
meal-rescue-project/
│
├── docs/
│   └── 01-product-vision.md
│       │
│       ├── The One-Line Concept
│       ├── Core Philosophy (What We Are NOT)
│       ├── The Core Loop Diagram
│       ├── Detailed Use Case Walkthrough
│       ├── Three Additional Entry Points
│       ├── My Pantry Inventory Layer
│       ├── Learning & Personalization
│       ├── Feature Architecture
│       ├── Safety & Trust Principles
│       ├── Business Model
│       ├── Growth & Retention Strategy
│       ├── Roadmap (MVP → V2 → V3)
│       └── 60-Second Demo Script
│
├── architecture/
│   └── 02-system-architecture.md
│       │
│       ├── System Architecture Overview
│       ├── The AI Pipeline (CRITICAL)
│       ├── Structured Intermediate Output
│       ├── Backend Tool-Calling Architecture
│       ├── Tech Stack Details
│       ├── Data Model (First-Class Objects)
│       ├── API Endpoint Specifications
│       ├── Error Handling Strategy
│       ├── Latency & Cost Optimization
│       ├── Security Considerations
│       ├── Monitoring & Observability
│       └── Deployment Architecture
│
├── phases/
│   └── 03-implementation-plan.md
│       │
│       ├── Phase 1: Foundation & Setup (Week 1-2)
│       │   ├── Step 1.1: Repository Structure & Tooling
│       │   ├── Step 1.2: Backend Scaffolding
│       │   ├── Step 1.3: Mobile App Scaffolding
│       │   ├── Step 1.4: Authentication Setup
│       │   ├── Step 1.5: Environment Configuration
│       │   ├── Step 1.6: CI/CD Pipeline Setup
│       │   └── Step 1.7: Docker Configuration
│       │
│       ├── Phase 2: Core AI Pipeline (Week 3-4)
│       │   ├── Step 2.1: Vision Model Integration
│       │   ├── Step 2.2: Meal Understanding Engine
│       │   ├── Step 2.3: Constraint Engine Implementation
│       │   ├── Step 2.4: Candidate Generator
│       │   ├── Step 2.5: LLM Ranking & Explanation
│       │   └── Step 2.6: Safety & Validation Layer
│       │
│       ├── Phase 3: Mobile Frontend (Week 5-6)
│       ├── Phase 4: Personalization & Learning (Week 7-8)
│       ├── Phase 5: Advanced Features (Week 9-10)
│       ├── Phase 6: Testing & Quality Assurance (Week 11-12)
│       └── Phase 7: Deployment & Launch (Week 13-14)
│
├── system-prompts/
│   └── 04-ai-system-prompts.md
│       │
│       ├── Prompt Engineering Philosophy
│       ├── Research-Backed Principles Applied
│       │
│       ├── System Prompt 1: Vision-Based Meal Analysis
│       │   ├── Purpose
│       │   ├── Research References
│       │   ├── Complete Prompt Text
│       │   └── Example Response
│       │
│       ├── System Prompt 2: Text-Based Meal Extraction
│       ├── System Prompt 3: Rescue Candidate Ranking
│       ├── System Prompt 4: Preference Learning from Feedback
│       ├── System Prompt 5: Fridge Negotiator
│       ├── System Prompt 6: Leftover Alchemist
│       │
│       ├── Implementation Notes
│       ├── Prompt Testing Protocol
│       └── References & Research Sources
│
├── product-specs/
│   └── 05-product-management.md
│       │
│       ├── Executive Summary
│       ├── Product Principles
│       ├── Feature Prioritization (MoSCoW)
│       ├── User Stories (Detailed with Acceptance Criteria)
│       ├── Success Metrics
│       ├── Go-to-Market Strategy
│       ├── Competitive Landscape
│       ├── Roadmap Alignment
│       ├── Risk Assessment
│       ├── Pricing Strategy
│       ├── User Research Plan
│       └── Stakeholder Communication
│
└── testing/
    └── 06-testing-strategy.md
        │
        ├── Testing Pyramid
        ├── Test Distribution by Type
        │
        ├── Phase 1: Unit Testing
        │   ├── Backend Service Tests (with code examples)
        │   ├── Constraint Engine Tests
        │   ├── Mobile Component Tests
        │   └── Screen Tests
        │
        ├── Phase 2: Integration Testing
        │   ├── API Integration Tests
        │   └── Database Integration Tests
        │
        ├── Phase 3: End-to-End Testing (Chrome DevTools MCP)
        │   ├── E2E Test Architecture
        │   ├── Core Rescue Loop Tests
        │   └── Performance Validation
        │
        ├── Phase 4: AI Quality Testing
        │   ├── Prompt Quality Tests
        │   └── Hallucination Detection Tests
        │
        ├── Phase 5: Security Testing
        │   ├── Auth Tests
        │   ├── Input Validation Tests
        │   └── Data Protection Tests
        │
        ├── Test Coverage Requirements
        ├── Continuous Testing Pipeline
        └── Testing Best Practices (DO / DON'T)
```

---

## 🔑 Key Concepts

### The Minimum Intervention Engine

The **core innovation** of Meal Rescue. Rather than generating many recipes, it runs candidates through a funnel:

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

**Objective Function:**
```
Best Rescue = maximum practical improvement 
            + maximum preference preservation 
            + minimum friction
```

### The AI Pipeline Principle

**CRITICAL:** Don't let the LLM directly decide everything.

```
User Input → AI Extraction → Structured JSON → Validation → 
Deterministic Constraint Engine → Candidate Set → 
LLM Ranking/Explanation → Safety & Rule Validation → Final Recommendation
```

### First-Class Rescue Object

A `Rescue` is a first-class database object containing:
- Original meal
- Detected ingredients
- Constraints applied
- Candidates generated
- Selected recommendation
- User decision
- Outcome tracking
- Satisfaction feedback

This enables **actual learning** from behavior, not just event logging.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React Native / Expo | Cross-platform mobile app (iOS + Android) |
| **Backend** | Node.js — Fastify | High-performance API server |
| **Database** | PostgreSQL | Relational data with complex queries |
| **Auth** | Firebase Auth | Mobile-friendly authentication |
| **Storage** | Google Cloud Storage | Image storage with CDN |
| **AI Layer** | GPT-4 Vision + LLM | Meal analysis and ranking |
| **Payments** | RevenueCat | Subscription management |
| **Notifications** | OneSignal | Contextual push notifications |

---

## 📊 Success Metrics

### North Star Metric

**Weekly Active Users Completing Full Loop**
- Definition: Users who capture meal → get rescue → provide feedback within 7 days
- Target: 40% of signups by week 4

### Key Performance Indicators

| Metric | Formula | Target (Month 3) |
|--------|---------|------------------|
| **Successful Rescue Rate** | accepted ÷ total recommendations | >65% |
| **Rescue Satisfaction Rate** | "Better" feedback ÷ completed rescues | >60% |
| **Day 7 Retention** | D7 active ÷ Day 0 signups | >20% |
| **Free → Pro Conversion** | Pro users ÷ total users | >5% |

---

## 🚀 Quick Start for Development

### Prerequisites

```bash
# Install global tools
npm install -g turbo expo-cli typescript

# Clone repository
git clone <repo-url>
cd meal-rescue-project

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

### Run Locally

```bash
# Start backend
cd apps/backend
npm run dev

# Start mobile app
cd apps/mobile
npm run start

# Run tests
npm run test
```

### Deploy to Stores

```bash
# Build for iOS
cd apps/mobile
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

---

## 🧪 Testing Requirements

### Before Any PR Can Merge

- ✅ All unit tests pass (100%)
- ✅ All integration tests pass (100%)
- ✅ All E2E tests pass (>95%)
- ✅ Code coverage meets thresholds (>85%)
- ✅ No security vulnerabilities detected
- ✅ AI prompt quality tests pass
- ✅ Performance targets met (P95 < 3s)

### Chrome DevTools MCP Integration

Connect testing to Chrome DevTools MCP for:
- Real-time performance profiling
- Network request inspection
- Memory leak detection
- Accessibility auditing
- Visual regression testing

---

## 📱 App Store Deployment

### iOS App Store

**Requirements:**
- Apple Developer Account ($99/year)
- App icon (1024x1024)
- Screenshots (6.5", 5.5", 12.9")
- Privacy policy URL
- Terms of service URL
- App Store Connect metadata

**Review Guidelines:**
- Avoid medical/health claims
- Clearly state subscription terms
- Provide account deletion option
- Follow App Store Review Guidelines

### Google Play Store

**Requirements:**
- Google Play Console account ($25 one-time)
- App icon (512x512)
- Screenshots (phone, tablet)
- Privacy policy URL
- Content rating questionnaire

**Review Process:**
- Initial review: 2-7 days
- Subsequent updates: 1-3 days
- Must comply with Play Store policies

---

## 🔐 Security & Compliance

### Data Protection

- All user data encrypted at rest (AES-256)
- All API calls over HTTPS only
- JWT tokens expire after 24 hours
- Images auto-delete after 7 days
- No health data stored without explicit consent

### Compliance

- GDPR compliant (EU users)
- CCPA compliant (California users)
- COPPA compliant (no users under 13)
- No medical device claims (not FDA regulated)

---

## 📈 Scaling Considerations

### When to Scale

| Metric | Threshold | Action |
|--------|-----------|--------|
| Daily Active Users | >10,000 | Add backend nodes |
| API Latency P95 | >3 seconds | Optimize queries, add caching |
| Database Connections | >80% pool | Add read replicas |
| AI API Costs | >$5,000/month | Implement caching, smaller models |

### Horizontal Scaling Strategy

```
Load Balancer (AWS ALB)
       ↓
┌─────────────┬─────────────┬─────────────┐
│  Backend 1  │  Backend 2  │  Backend 3  │
└──────┬──────┴──────┬──────┴──────┬──────┘
       │             │             │
       └─────────────┴─────────────┘
                     ↓
           ┌─────────────────┐
           │   PostgreSQL    │
           │  (Primary +     │
           │   Read Replica) │
           └─────────────────┘
```

---

## 🤝 Contributing

### Commit Message Convention

```
feat: Add Fridge Negotiator feature
fix: Resolve image upload timeout issue
docs: Update architecture diagram
style: Format code with prettier
refactor: Extract constraint engine logic
test: Add integration tests for rescue API
chore: Update dependencies
```

### Pull Request Process

1. Create feature branch from `develop`
2. Make changes with tests
3. Run full test suite locally
4. Open PR against `develop`
5. Wait for CI/CD to pass
6. Address code review feedback
7. Squash merge when approved

---

## 📞 Support & Contact

### Documentation Issues

If you find errors or gaps in this documentation:
1. Check existing issues in the repository
2. Create a new issue with `[DOCS]` prefix
3. Include which document and section
4. Suggest improvements if possible

### Technical Support

For implementation questions:
- Review the relevant documentation section first
- Search existing issues
- Ask in the development Slack channel
- Tag the appropriate team lead

---

## 📄 License

**Proprietary - All Rights Reserved**

This documentation and the Meal Rescue concept are proprietary. Unauthorized use, copying, or distribution is prohibited.

---

## 🙏 Acknowledgments

This documentation was created with input from:
- Product research on 50+ food-tech applications
- Analysis of academic papers on LLM prompting
- Best practices from production mobile apps
- Senior engineering team expertise

---

## 📅 Document Maintenance

| Document | Owner | Review Cycle | Last Updated |
|----------|-------|--------------|--------------|
| Product Vision | Head of Product | Monthly | 2024-01-15 |
| System Architecture | Head of Engineering | Bi-weekly | 2024-01-15 |
| Implementation Plan | Tech Lead | Weekly | 2024-01-15 |
| AI System Prompts | ML Lead | Weekly | 2024-01-15 |
| Product Management | Head of Product | Bi-weekly | 2024-01-15 |
| Testing Strategy | QA Lead | Monthly | 2024-01-15 |

---

## ✨ Final Note

**This documentation suite is designed to enable a small team (or even a single developer) to build a production-ready, App Store-deployable mobile application with strong AI capabilities.**

Every section includes:
- Clear explanations
- Code examples
- Real-world constraints
- Edge case handling
- Testing requirements

**Build like a senior engineer. Test like a QA team. Ship like a startup.**

---

**Last Updated:** 2024-01-15  
**Version:** 1.0.0  
**Status:** Ready for Implementation
