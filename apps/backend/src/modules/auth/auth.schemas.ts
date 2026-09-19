import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character'),
  timezone: z.string().max(50).optional(),
  locale: z.string().max(10).default('en-US'),
  verificationToken: z.string().min(1, 'Email verification required'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  verificationToken: z.string().min(1, 'Email verification required'),
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
