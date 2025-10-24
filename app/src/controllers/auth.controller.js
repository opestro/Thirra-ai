import { createPocketBaseClient } from '../config/pocketbase.js';
import config from '../config/config.js';

const isProd = config.nodeEnv === 'production';
const sameSite = isProd ? 'None' : 'Lax';
const secure = isProd;

export async function signup(req, res, next) {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, name required' });
    }
    const pb = createPocketBaseClient();
    const record = await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password, // PB requires confirm; backend duplicates
      name,
      instruction: '',
    });
    res.status(201).json({ id: record.id, email: record.email, name: record.name, instruction: record.instruction });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    const pb = createPocketBaseClient();
    const authData = await pb.collection('users').authWithPassword(email, password);

    const cookie = pb.authStore.exportToCookie({ httpOnly: true, secure, sameSite });
    res.setHeader('Set-Cookie', cookie);

    res.json({
      token: authData.token,
      user: {
        id: authData.record.id,
        email: authData.record.email,
        name: authData.record.name,
        instruction: authData.record.instruction,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const pb = createPocketBaseClient();
    pb.authStore.clear();
    const cookie = pb.authStore.exportToCookie({ httpOnly: true, secure, sameSite });
    res.setHeader('Set-Cookie', cookie);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
}