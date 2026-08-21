/**
 * @meal-rescue/ai-pipeline
 *
 * Placeholder for Phase 2 (Core AI Pipeline).
 * The deterministic-first pipeline lives here:
 *
 *   Input -> AI Extraction -> Structured JSON -> Validation ->
 *   Constraint Engine -> Candidates -> LLM Ranking -> Safety Validation -> Output
 *
 * Kept as a separate package so the pipeline can be unit-tested in
 * isolation and reused by future services without touching the API layer.
 */
export const AI_PIPELINE_VERSION = '0.1.0';
