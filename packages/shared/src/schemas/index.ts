import { z } from 'zod';
import { BoletinStatus, Sport } from '../types';

// ─── Reusable field schemas ───────────────────────────────────────────────────

/**
 * Password rules: min 8 chars, at least one uppercase letter,
 * one digit, and one special character.
 */
const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
  .regex(/[0-9]/, 'Deve conter pelo menos um número')
  .regex(/[^A-Za-z0-9]/, 'Deve conter pelo menos um caracter especial');

/**
 * Username: 3–20 chars, alphanumeric + underscores only.
 */
export const usernameSchema = z
  .string()
  .min(3, 'Mínimo 3 caracteres')
  .max(20, 'Máximo 20 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e underscores');

// ─── Auth schemas ─────────────────────────────────────────────────────────────

/**
 * Email + password login.
 * Used on both client (form validation) and server (request body parsing).
 */
export const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string().min(1, 'Password obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Core registration fields — used on the server to validate the request body.
 * Does not include client-only fields (confirmPassword, acceptTerms).
 */
export const registerBaseSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().min(1, 'Nome obrigatório').max(100).optional(),
});

export type RegisterBaseInput = z.infer<typeof registerBaseSchema>;

/**
 * Full registration schema — used for client-side form validation.
 * Adds confirmPassword matching and terms acceptance on top of registerBaseSchema.
 * Backend should use registerBaseSchema to avoid parsing client-only fields.
 */
export const registerSchema = registerBaseSchema
  .extend({
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      invalid_type_error: 'Deves aceitar os termos de serviço',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As passwords não coincidem',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Second step of Google Sign-In onboarding: choose a username.
 * tempToken is the short-lived token returned by POST /api/auth/google when isNewUser=true.
 */
export const googleCompleteRegistrationSchema = z.object({
  tempToken: z.string().min(1, 'Token inválido'),
  username: usernameSchema,
});

export type GoogleCompleteRegistrationInput = z.infer<
  typeof googleCompleteRegistrationSchema
>;

/** Initiates a password-reset flow; endpoint always returns success to prevent enumeration. */
export const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Completes a password reset using the token from the reset email. */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token inválido'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As passwords não coincidem',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Allows a Google-only user to add a password, promoting authProvider to HYBRID.
 * Requires an active session (authenticated endpoint).
 */
export const setPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As passwords não coincidem',
    path: ['confirmPassword'],
  });

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/** Resends the verification email. */
export const resendVerificationSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// ─── Boletin schemas ──────────────────────────────────────────────────────────

/** A single selection inside a new boletin. */
export const createBoletinItemSchema = z.object({
  eventId: z.string().cuid('ID de evento inválido'),
  siteId: z.string().cuid('ID de site inválido'),
  /** e.g. "1X2", "Over/Under 2.5" */
  market: z.string().min(1, 'Mercado obrigatório'),
  /** e.g. "1", "X", "2", "Over" */
  selection: z.string().min(1, 'Seleção obrigatória'),
  /** Decimal odds value, European format */
  oddValue: z
    .number({ invalid_type_error: 'Odd inválida' })
    .min(1.01, 'Odd mínima é 1.01')
    .max(1000, 'Odd máxima é 1000'),
});

export type CreateBoletinItemInput = z.infer<typeof createBoletinItemSchema>;

/** Creates a new boletin (betting slip). */
export const createBoletinSchema = z.object({
  name: z.string().max(100, 'Nome máximo 100 caracteres').optional(),
  stake: z
    .number({ invalid_type_error: 'Valor de aposta inválido' })
    .positive('O valor da aposta deve ser positivo')
    .max(100_000, 'Valor máximo de aposta é €100.000'),
  items: z
    .array(createBoletinItemSchema)
    .min(1, 'O boletin deve ter pelo menos uma seleção')
    .max(20, 'Máximo 20 seleções por boletin'),
  notes: z.string().max(500, 'Notas máximo 500 caracteres').optional(),
  isPublic: z.boolean().default(false),
});

export type CreateBoletinInput = z.infer<typeof createBoletinSchema>;

/** Partially updates an existing boletin. */
export const updateBoletinSchema = z.object({
  name: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  status: z.nativeEnum(BoletinStatus).optional(),
  actualReturn: z
    .number()
    .nonnegative('O retorno não pode ser negativo')
    .optional(),
  isPublic: z.boolean().optional(),
});

export type UpdateBoletinInput = z.infer<typeof updateBoletinSchema>;

/** Share a boletin with one or more friends. */
export const shareBoletinSchema = z.object({
  userIds: z
    .array(z.string().cuid())
    .min(1, 'Seleciona pelo menos um amigo')
    .max(50),
  message: z.string().max(200).optional(),
});

export type ShareBoletinInput = z.infer<typeof shareBoletinSchema>;

// ─── Odds filter schema ───────────────────────────────────────────────────────

/**
 * Query parameter schema for GET /api/odds.
 * Uses z.coerce to handle string query params arriving as strings from the URL.
 * The `sites` field accepts a comma-separated string and transforms it to string[].
 */
export const filterSchema = z.object({
  /** Comma-separated betting site slugs, e.g. "betclic,bet365" */
  sites: z
    .string()
    .optional()
    .transform((val) => val?.split(',').filter(Boolean) ?? []),
  sport: z.nativeEnum(Sport).optional(),
  league: z.string().optional(),
  /** Free-text search across homeTeam and awayTeam (case-insensitive contains) */
  search: z.string().max(100).optional(),
  dateFrom: z.string().datetime({ message: 'Data inválida' }).optional(),
  dateTo: z.string().datetime({ message: 'Data inválida' }).optional(),
  minOdds: z.coerce.number().min(1.01).max(1000).optional(),
  maxOdds: z.coerce.number().min(1.01).max(1000).optional(),
  market: z.string().optional(),
  /** Only show upcoming or live events */
  status: z.enum(['UPCOMING', 'LIVE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type FilterInput = z.infer<typeof filterSchema>;

// ─── User profile schemas ─────────────────────────────────────────────────────

/** Updates the authenticated user's own profile. */
export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(300, 'Bio máximo 300 caracteres').optional(),
  avatarUrl: z.string().url('URL de avatar inválido').optional(),
  expoPushToken: z
    .string()
    .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, 'Token Expo inválido')
    .nullable()
    .optional(),
  /** Betting site slugs the user prefers */
  preferredSites: z.array(z.string()).optional(),
  /** ISO 4217 currency code */
  currency: z.string().length(3, 'Código de moeda inválido').optional(),
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Changes the authenticated user's password (requires old password for confirmation). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Password atual obrigatória'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As passwords não coincidem',
    path: ['confirmPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── Notification schema ──────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export const userSearchQuerySchema = z.object({
  query: z.string().trim().min(1, 'Pesquisa obrigatória').max(50, 'Pesquisa demasiado longa'),
});

export type UserSearchQueryInput = z.infer<typeof userSearchQuerySchema>;

export const usernameAvailabilityQuerySchema = z.object({
  username: usernameSchema,
});

export type UsernameAvailabilityQueryInput = z.infer<typeof usernameAvailabilityQuerySchema>;

// ─── Stats schemas ───────────────────────────────────────────────────────────

export const statsPeriodSchema = z.enum(['week', 'month', 'year', 'all']);

export const statsQuerySchema = z.object({
  period: statsPeriodSchema.default('all'),
});

export type StatsQueryInput = z.infer<typeof statsQuerySchema>;
