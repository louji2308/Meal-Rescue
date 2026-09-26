/**
 * Paywall Teaser Service tests — the "only the last best move" contract.
 *
 * These cover the deterministic guardrails that own the paywall's copy:
 *   1. Model promise → validated → returned only when it clears every check.
 *   2. Every model failure/junk/fabrication path degrades to deterministic
 *      copy — the paywall never renders blank or broken.
 *   3. The evaluation edge cases: no history, keep-as-is, disliked outcome,
 *      and "never repeat the last move in the hook".
 */
import { PaywallTeaserService } from '../src/services/paywall-teaser.service';

describe('paywall teaser service', () => {
  describe('provider failure / misconfiguration degrades gracefully', () => {
    it('returns deterministic copy instead of throwing when the provider fails', async () => {
      const service = new PaywallTeaserService(async () => {
        throw new Error('GROQ_API_KEY not configured');
      });
      const teaser = await service.generate({
        foods: ['rice'],
        added: ['a fried egg'],
      });

      expect(teaser.source).toBe('fallback');
      expect(teaser.opener.length).toBeGreaterThan(4);
      expect(teaser.hook.length).toBeGreaterThan(4);
      expect(teaser.opener).not.toMatch(/undefined|NaN/);
    });
  });

  describe('deterministic fallback copy quality', () => {
    it('references the last move concretely and never repeats it in the hook', async () => {
      const service = new PaywallTeaserService(async () => {
        throw new Error('network down');
      });
      const teaser = await service.generate({
        foods: ['rice'],
        added: ['a fried egg'],
        label: 'Add a fried egg on top',
      });

      expect(teaser.opener).toMatch(/egg/i);
      expect(teaser.opener).toMatch(/rice/i);
      expect(teaser.hook).toMatch(/^Wait till you see what/);
      expect(teaser.hook).not.toMatch(/egg/i);
    });

    it('uses a cold-start opener when there is no previous move at all', async () => {
      const service = new PaywallTeaserService(async () => {
        throw new Error('network down');
      });
      const teaser = await service.generate(null);

      expect(teaser.source).toBe('fallback');
      expect(teaser.opener).not.toMatch(/you liked|remember when/i);
      expect(teaser.hook).toMatch(/^Wait till you see what/);
    });

    it('does NOT fabricate a liked move for a keep-as-is decision', async () => {
      const service = new PaywallTeaserService(async () => {
        throw new Error('network down');
      });
      const teaser = await service.generate({
        foods: ['rice'],
        added: ['eggs'],
        actionType: 'KEEP_AS_IS',
        decision: 'kept_as_is',
        label: 'Looks great — no changes needed.',
      });

      expect(teaser.opener).not.toMatch(/you liked|egg/i);
      expect(teaser.hook).toMatch(/^Wait till you see what/);
    });

    it('does NOT claim the user loved a move they reported as not for them', async () => {
      const service = new PaywallTeaserService(async () => {
        throw new Error('network down');
      });
      const teaser = await service.generate({
        foods: ['pasta'],
        added: ['sardines'],
        outcome: 'not_for_me',
      });

      expect(teaser.opener).not.toMatch(/you liked|sardine/i);
    });
  });

  describe('model output validation', () => {
    it('returns model copy verbatim when it clears every check', async () => {
      const service = new PaywallTeaserService(async () =>
        JSON.stringify({
          opener: 'You liked what crispy garlic did to your noodles.',
          hook: 'Wait till you see what toasted sesame does.',
        }),
      );
      const teaser = await service.generate({ foods: ['noodles'], added: ['crispy garlic'] });

      expect(teaser.source).toBe('ai');
      expect(teaser.modelVersion).toMatch(/paywall-teaser/i);
      expect(teaser.opener).toBe('You liked what crispy garlic did to your noodles.');
      expect(teaser.hook).toBe('Wait till you see what toasted sesame does.');
    });

    it('rejects emoji / too-long / markdown garbage and falls back', async () => {
      const junk: string[] = [
        JSON.stringify({ opener: '🤖', hook: 'Wait till you see what garlic does.' }),
        JSON.stringify({ opener: 'a'.repeat(90), hook: 'Wait till you see what garlic does.' }),
        JSON.stringify({ opener: 'You liked the egg!', hook: '```code```' }),
        JSON.stringify({ opener: 'Upgrade to Pro now.', hook: 'No ads ever.' }),
      ];
      const service = new PaywallTeaserService(
        async () => junk[Math.floor(Math.random() * junk.length)] ?? '{',
      );

      const teaser = await service.generate({ foods: ['rice'], added: ['a fried egg'] });
      expect(teaser.source).toBe('fallback');
      expect(teaser.opener.length).toBeGreaterThan(4);
      expect(teaser.hook.length).toBeGreaterThan(4);
    });

    it('rejects a fabricated "you liked" when there is no real previous move', async () => {
      const service = new PaywallTeaserService(async () =>
        JSON.stringify({
          opener: 'You liked what egg did to the rice.',
          hook: 'Wait till you see what garlic does.',
        }),
      );
      const teaser = await service.generate(null);

      expect(teaser.source).toBe('fallback');
      expect(teaser.opener).not.toMatch(/you liked/i);
    });

    it('rejects a hook that repeats the previous move ingredient', async () => {
      const service = new PaywallTeaserService(async () =>
        JSON.stringify({
          opener: 'The egg worked.',
          hook: 'Wait till you see what egg does to the top.',
        }),
      );
      const teaser = await service.generate({ foods: ['rice'], added: ['egg'] });

      expect(teaser.source).toBe('fallback');
      expect(teaser.hook).not.toMatch(/egg/i);
    });

    it('strips markdown fences from an otherwise valid response', async () => {
      const service = new PaywallTeaserService(async () =>
        [
          '```json',
          JSON.stringify({
            opener: 'That move on rice? It earned a repeat.',
            hook: 'Wait till you see what chili crisp does.',
          }),
          '```',
        ].join('\n'),
      );
      const teaser = await service.generate({ foods: ['rice'], added: ['egg'] });

      expect(teaser.source).toBe('ai');
      expect(teaser.hook).toBe('Wait till you see what chili crisp does.');
    });
  });
});
