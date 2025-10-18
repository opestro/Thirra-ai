export async function getMe(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req, res, next) {
  try {
    const { name, instruction } = req.body || {};
    if (typeof name === 'undefined' && typeof instruction === 'undefined') {
      return res.status(400).json({ error: 'name or instruction required' });
    }

    let record = null;

    if (typeof name !== 'undefined') {
      record = await req.pb.collection('users').update(req.user.id, { name });
    }

    if (typeof instruction !== 'undefined') {
      record = await req.pb.collection('users').update(req.user.id, { instruction });
    }

    record = record || await req.pb.collection('users').getOne(req.user.id);

    res.json({ id: record.id, email: record.email, name: record.name, instruction: record.instruction });
  } catch (err) {
    next(err);
  }
}

export async function updateName(req, res, next) {
  try {
    const { name } = req.body || {};
    if (typeof name === 'undefined') {
      return res.status(400).json({ error: 'name required' });
    }
    const updated = await req.pb.collection('users').update(req.user.id, { name });
    res.json({ id: updated.id, email: updated.email, name: updated.name, instruction: updated.instruction });
  } catch (err) {
    next(err);
  }
}

export async function updateInstruction(req, res, next) {
  try {
    const { instruction } = req.body || {};
    if (typeof instruction === 'undefined') {
      return res.status(400).json({ error: 'instruction required' });
    }
    const updated = await req.pb.collection('users').update(req.user.id, { instruction });
    res.json({ id: updated.id, email: updated.email, name: updated.name, instruction: updated.instruction });
  } catch (err) {
    next(err);
  }
}

export async function deleteMe(req, res, next) {
  try {
    await req.pb.collection('users').delete(req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}