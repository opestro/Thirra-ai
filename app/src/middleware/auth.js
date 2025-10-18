import { createPocketBaseClient } from '../config/pocketbase.js';

export async function requireAuth(req, res, next) {
  try {
    const pb = createPocketBaseClient();

    // Try cookie-based session first
    pb.authStore.loadFromCookie(req.headers.cookie || '');
    try {
      if (pb.authStore.isValid) {
        await pb.collection('users').authRefresh();
      }
    } catch (_) {
      // ignore and try Bearer fallback
    }

    // Fallback to Bearer token if cookie missing/invalid
    if (!pb.authStore.isValid) {
      const authHeader = req.headers.authorization || '';
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        pb.authStore.save(token, null);
        await pb.collection('users').authRefresh();
      }
    }

    if (!pb.authStore.isValid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.pb = pb;
    req.user = pb.authStore.record;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}