export async function getMe(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req, res, next) {
  try {
    const { name, instruction, email } = req.body || {};
    if (typeof name === 'undefined' && typeof instruction === 'undefined' && typeof email === 'undefined') {
      return res.status(400).json({ error: 'name or instruction required' });
    }

   

    const updatePayload = {};
    if (typeof name !== 'undefined') updatePayload.name = name;
    if (typeof instruction !== 'undefined') updatePayload.instruction = instruction;


    try {
      const record = await req.pb.collection('users').update(req.user.id, updatePayload);
      return res.json({ id: record.id, email: record.email, name: record.name, instruction: record.instruction });
    } catch (e) {
      return res.status(e?.status || 400).json({ error: e?.response?.message || e?.message || 'Failed to update user' });
    }
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

export async function changePassword(req, res, next) {
  try {
    const { oldPassword, newPassword} = req.body || {};
    if (!oldPassword || !newPassword ) {
      return res.status(400).json({ error: 'oldPassword and newPassword are required' });
    }

    try {
      await req.pb.collection('users').update(req.user.id, { oldPassword, password: newPassword , passwordConfirm: newPassword }); 
      return res.json({ success: true });
    } catch (e) {
      const data = e?.response?.data || {};
      const msgs = [];
      if (data?.oldPassword) msgs.push(data.oldPassword.message || 'Invalid current password');
      if (data?.password) msgs.push(data.password.message || 'Invalid password');
      if (data?.passwordConfirm) msgs.push(data.passwordConfirm.message || 'Passwords do not match');
      const msg = msgs.filter(Boolean).join(', ') || e?.response?.message || e?.message || 'Failed to change password';
      return res.status(e?.status || 400).json({ error: msg });
    }
  } catch (err) {
    next(err);
  }
}