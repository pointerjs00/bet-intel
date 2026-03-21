import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  verifyEmailHandler,
  resendVerification,
  forgotPasswordHandler,
  resetPasswordHandler,
  googleAuth,
  googleCompleteRegistrationHandler,
  googleLink,
  googleUnlink,
  setPasswordHandler,
  changePasswordHandler,
} from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  googleAuthLimiter,
  defaultLimiter,
} from '../middleware/rateLimiter';

const router: Router = Router();

// ─── Email / Password ──────────────────────────────────────────────────────────
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', defaultLimiter, refresh);
router.post('/logout', defaultLimiter, logout);
router.post('/verify-email', defaultLimiter, verifyEmailHandler);
router.post('/resend-verification', registerLimiter, resendVerification);
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordHandler);
router.post('/reset-password', defaultLimiter, resetPasswordHandler);

// ─── Google OAuth ──────────────────────────────────────────────────────────────
router.post('/google', googleAuthLimiter, googleAuth);
router.post('/google/complete-registration', googleAuthLimiter, googleCompleteRegistrationHandler);
router.post('/google/link', authenticate, defaultLimiter, googleLink);
router.post('/google/unlink', authenticate, defaultLimiter, googleUnlink);

// ─── Account management (authenticated) ───────────────────────────────────────
router.post('/set-password', authenticate, defaultLimiter, setPasswordHandler);
router.post('/change-password', authenticate, defaultLimiter, changePasswordHandler);

export { router as authRouter };
