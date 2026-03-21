// Augments the Express Request type to carry the authenticated user payload.
// This file is picked up automatically by TypeScript because src/**/* is in tsconfig include.

export {};

declare global {
  namespace Express {
    interface Request {
      /** Present on authenticated routes after the `authenticate` middleware runs. */
      user?: {
        sub: string;
        email: string;
        username: string;
      };
    }
  }
}
