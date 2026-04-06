import { z } from 'zod';
import { BoletinStatus, ItemResult, Sport } from '../types';

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
  homeTeam: z.string().min(1, 'Equipa da casa obrigatória').max(100),
  awayTeam: z.string().min(1, 'Equipa visitante obrigatória').max(100),
  competition: z.string().min(1, 'Competição obrigatória').max(100),
  sport: z.nativeEnum(Sport).default(Sport.FOOTBALL),
  /** e.g. "Resultado Final (1X2)", "Ambas Marcam" */
  market: z.string().min(1, 'Mercado obrigatório'),
  /** e.g. "1", "X", "2", "Over 2.5" */
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
  siteSlug: z.string().max(50).optional(),
  stake: z
    .number({ invalid_type_error: 'Valor de aposta inválido' })
    .positive('O valor da aposta deve ser positivo')
    .max(100_000, 'Valor máximo de aposta é €100.000'),
  items: z
    .array(createBoletinItemSchema)
    .min(1, 'O boletim deve ter pelo menos uma seleção')
    .max(20, 'Máximo 20 seleções por boletim'),
  notes: z.string().max(500, 'Notas máximo 500 caracteres').optional(),
  isPublic: z.boolean().default(false),
  betDate: z.string().datetime({ offset: true }).optional(),
});

export type CreateBoletinInput = z.infer<typeof createBoletinSchema>;

/** Partially updates an existing boletin. */
export const updateBoletinSchema = z.object({
  name: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  siteSlug: z.string().max(50).nullable().optional(),
  stake: z
    .number()
    .positive('A stake deve ser positiva')
    .optional(),
  status: z.nativeEnum(BoletinStatus).optional(),
  actualReturn: z
    .number()
    .nonnegative('O retorno não pode ser negativo')
    .optional(),
  cashoutAmount: z
    .number()
    .nonnegative('O valor do cashout não pode ser negativo')
    .optional(),
  isPublic: z.boolean().optional(),
  betDate: z.string().datetime({ offset: true }).nullable().optional(),
});

export type UpdateBoletinInput = z.infer<typeof updateBoletinSchema>;

/** Updates individual boletin item results (mark selections as won/lost). */
export const updateBoletinItemsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().cuid(),
        result: z.nativeEnum(ItemResult),
      }),
    )
    .min(1, 'Seleciona pelo menos um item'),
});

export type UpdateBoletinItemsInput = z.infer<typeof updateBoletinItemsSchema>;

/** Share a boletin with one or more friends. */
export const shareBoletinSchema = z.object({
  userIds: z
    .array(z.string().cuid())
    .min(1, 'Seleciona pelo menos um amigo')
    .max(50),
  message: z.string().max(200).optional(),
});

export type ShareBoletinInput = z.infer<typeof shareBoletinSchema>;

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
