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
} from '../middleware/rateLimiter';

const router: Router = Router();

// ─── Email / Password ──────────────────────────────────────────────────────────
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/verify-email', verifyEmailHandler);
router.post('/resend-verification', registerLimiter, resendVerification);
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordHandler);
router.post('/reset-password', resetPasswordHandler);

// ─── Google OAuth ──────────────────────────────────────────────────────────────
router.post('/google', googleAuthLimiter, googleAuth);
router.post('/google/complete-registration', googleAuthLimiter, googleCompleteRegistrationHandler);
router.post('/google/link', authenticate, googleLink);
router.post('/google/unlink', authenticate, googleUnlink);

// ─── Account management (authenticated) ───────────────────────────────────────
router.post('/set-password', authenticate, setPasswordHandler);
router.post('/change-password', authenticate, changePasswordHandler);

export { router as authRouter };
