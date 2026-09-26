import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  timezone: z.string().max(50).optional(),
  locale: z.string().max(10).default('en-US'),
  verificationToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  verificationToken: z.string().optional(),
});

export const googleLoginSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().min(1),
  codeVerifier: z.string().min(1).optional(),
  // SECURITY: CSRF state parameter — the client must generate a random
  // state before redirecting to Google and echo it back on callback.
  state: z.string().min(16, 'CSRF state parameter required').optional(),
});

export const sendCodeSchema = z.object({
  email: z.string().email().max(255),
});

export const verifyCodeSchema = z.object({
  email: z.string().email().max(255),
  code: z.string().length(6, 'Code must be 6 digits'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
