# PocketBase Admin Setup for Webhooks

## Why Admin Access is Needed

Webhooks come from external services (like Nanobanana) and don't have user authentication. To update tool call records in your database, the webhook needs **admin access** to PocketBase.

## Quick Setup

### Step 1: Create Admin Account in PocketBase

1. **Open PocketBase Admin UI**: `http://localhost:8090/_/`

2. **Go to Settings** → **Admins**

3. **Create New Admin**:
   - Email: `webhooks@yourapp.com` (or any email)
   - Password: Generate a secure password
   - Confirm password

4. **Save** the admin account

### Step 2: Add Admin Credentials to `.env`

```bash
# PocketBase Admin (for webhook operations)
POCKETBASE_ADMIN_EMAIL=webhooks@yourapp.com
POCKETBASE_ADMIN_PASSWORD=your_secure_password_here
```

⚠️ **Important**: 
- Use a **different** admin account than your personal one
- Use a **strong password** (20+ characters recommended)
- **Never commit** `.env` to version control (it's in `.gitignore`)

### Step 3: Restart Your Server

```bash
npm run dev
```

You should see:
```
[PocketBase] Admin authenticated for webhook operations
```

### Step 4: Test Webhook

Generate an image and check logs:
```
[Webhook] Looking for tool_call with external_id: abc123
[Webhook] Found tool_call record: xyz, updating...
[Webhook] Updated tool call record: xyz  ✅
```

## Security Best Practices

### 1. Dedicated Webhook Admin

✅ **Do**: Create a separate admin account for webhooks
```bash
POCKETBASE_ADMIN_EMAIL=webhooks@yourapp.com  # Dedicated
```

❌ **Don't**: Use your personal admin account
```bash
POCKETBASE_ADMIN_EMAIL=you@yourapp.com  # Your personal account - risky!
```

**Why**: If the server is compromised, attackers get full admin access.

### 2. Strong Password

✅ **Do**: Use a 20+ character random password
```bash
# Generated with: openssl rand -base64 32
POCKETBASE_ADMIN_PASSWORD=J8x4Kd9mP2nQ7vR1wS5tY6zB3cF0hG8j
```

❌ **Don't**: Use weak or shared passwords
```bash
POCKETBASE_ADMIN_PASSWORD=admin123  # Weak!
```

### 3. Environment Variables

✅ **Do**: Store in `.env` file (git-ignored)
```bash
# .env
POCKETBASE_ADMIN_EMAIL=webhooks@yourapp.com
POCKETBASE_ADMIN_PASSWORD=secure_random_password
```

❌ **Don't**: Hardcode in source code
```javascript
// ❌ NEVER DO THIS
const adminEmail = 'admin@example.com';  // Visible in repo!
```

### 4. Production Configuration

For production, use environment variable management:

**Vercel/Netlify**:
- Add environment variables in dashboard
- Don't expose in logs

**Docker**:
```yaml
# docker-compose.yml
environment:
  - POCKETBASE_ADMIN_EMAIL=${PB_ADMIN_EMAIL}
  - POCKETBASE_ADMIN_PASSWORD=${PB_ADMIN_PASS}
```

**Traditional hosting**:
- Use `.env` file outside web root
- Restrict file permissions: `chmod 600 .env`

## Troubleshooting

### Error: "Admin authentication failed"

**Logs**:
```
[PocketBase] Admin authentication failed: Invalid credentials
[PocketBase] Webhook operations may fail without admin access
```

**Solutions**:

1. **Check credentials are correct**:
   ```bash
   # Test login manually
   curl -X POST http://localhost:8090/api/admins/auth-with-password \
     -H "Content-Type: application/json" \
     -d '{"identity":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
   ```

2. **Verify admin account exists**:
   - Open PocketBase admin UI
   - Go to Settings → Admins
   - Check if the account is there

3. **Check for typos in `.env`**:
   ```bash
   # Show current config (without password)
   node -e "console.log(require('dotenv').config()); console.log(process.env.POCKETBASE_ADMIN_EMAIL)"
   ```

### Error: "No admin credentials configured"

**Logs**:
```
[PocketBase] No admin credentials configured - webhooks may not work
```

**Solution**: Add credentials to `.env` (see Step 2 above)

### Webhook Still Can't Update

**Symptoms**: Webhook receives callback but can't update tool_call record.

**Debug**:
```bash
# Check if admin can access tool_calls collection
curl http://localhost:8090/api/collections/tool_calls/records \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Possible causes**:

1. **Admin authentication failed** (check logs)
2. **Collection API rules** are too restrictive
3. **External ID mismatch** (check taskId in logs)

**Solution**: Check `WEBHOOK_TROUBLESHOOTING.md` for detailed debugging steps.

## Alternative Approaches

### Option 1: Admin Auth (Recommended) ✅

**Pros**:
- Most secure
- Works for all users
- Standard pattern
- Full access to update records

**Cons**:
- Requires admin account setup
- Need to manage credentials

**When to use**: Production, self-hosted PocketBase

---

### Option 2: User Token in Callback URL

**Implementation**:
```javascript
// When creating image task
const userToken = req.pb.authStore.token;
const callbackUrl = `${config.appBaseUrl}/api/webhooks/nanobanana?token=${userToken}`;

// In webhook handler
const token = req.query.token;
const pb = new PocketBase(config.pocketbase.url);
pb.authStore.save(token);
```

**Pros**:
- No admin account needed
- User-specific access
- Simple implementation

**Cons**:
- Token exposed to external service (Nanobanana)
- Security risk if service is compromised
- Token might expire before webhook
- Token logged in Nanobanana's systems

**When to use**: NOT recommended for production

---

### Option 3: Open API Rules

**Implementation**:
```javascript
// In PocketBase: tool_calls collection → API Rules → Update
@request.auth.id = "" || turn.conversation.user = @request.auth.id
```

**Pros**:
- Simplest setup
- No credentials needed
- Fast

**Cons**:
- **SECURITY RISK**: Anyone can update any tool_call record
- Vulnerable to attacks
- No audit trail

**When to use**: Development only, NOT production

---

## Recommended Setup

| Environment | Approach | Why |
|------------|----------|-----|
| **Development** | Admin Auth | Test production setup |
| **Staging** | Admin Auth | Mirror production |
| **Production** | Admin Auth | Secure and reliable |

## Migration from Open API Rules

If you previously set up open API rules, secure them:

### Step 1: Set up admin auth (see above)

### Step 2: Update PocketBase API Rules

**Old (insecure)**:
```javascript
// tool_calls → Update rule
@request.auth.id = "" || turn.conversation.user = @request.auth.id
```

**New (secure)**:
```javascript
// tool_calls → Update rule
turn.conversation.user = @request.auth.id
```

This ensures only:
- ✅ Users can update their own tool calls
- ✅ Admin (webhook) can update any tool call
- ❌ Anonymous requests are blocked

### Step 3: Test

Generate an image and verify webhook works with admin auth.

## Monitoring

### Log Admin Authentication

The system automatically logs:
```
✅ [PocketBase] Admin authenticated for webhook operations
❌ [PocketBase] Admin authentication failed: ...
⚠️ [PocketBase] No admin credentials configured
```

### Check Authentication Status

```javascript
// In webhooks.controller.js (debugging)
console.log('[Webhook] PocketBase auth:', {
  isValid: pb.authStore.isValid,
  isAdmin: pb.authStore.isAdmin,
  token: pb.authStore.token ? 'present' : 'missing',
});
```

Expected output:
```
[Webhook] PocketBase auth: {
  isValid: true,
  isAdmin: true,    ← Should be true!
  token: 'present'
}
```

## Production Checklist

Before deploying to production:

- [ ] Created dedicated webhook admin account
- [ ] Generated strong password (20+ chars)
- [ ] Added credentials to production `.env`
- [ ] Tested webhook update works
- [ ] Restricted file permissions (`chmod 600 .env`)
- [ ] Verified credentials not in git history
- [ ] Set up credential rotation policy (every 90 days)
- [ ] Documented who has access to credentials
- [ ] Set up monitoring for auth failures

## Credential Rotation

Rotate admin password every 90 days:

1. **Generate new password**:
   ```bash
   openssl rand -base64 32
   ```

2. **Update in PocketBase**:
   - Settings → Admins → Edit webhook admin
   - Change password
   - Save

3. **Update `.env`**:
   ```bash
   POCKETBASE_ADMIN_PASSWORD=new_password_here
   ```

4. **Restart server**:
   ```bash
   pm2 restart thirra-ai
   # or
   npm run dev
   ```

5. **Verify**:
   Check logs for successful authentication.

## Support

If you encounter issues:

1. Check logs for authentication errors
2. Verify admin account exists in PocketBase
3. Test credentials manually (see Troubleshooting)
4. Review `WEBHOOK_TROUBLESHOOTING.md`
5. Check that server can reach PocketBase URL

## FAQ

**Q: Can I use my personal admin account?**
A: Not recommended. Create a dedicated webhook admin for security.

**Q: What if admin password expires?**
A: PocketBase admin passwords don't expire by default. Set up your own rotation policy.

**Q: Can multiple servers use the same admin account?**
A: Yes, but consider creating separate admin accounts per environment (dev, staging, prod).

**Q: Is it safe to store admin credentials in `.env`?**
A: Yes, as long as:
- `.env` is in `.gitignore`
- File permissions are restricted
- Server is secure
- Using strong password

**Q: What if someone gets the admin credentials?**
A: They have full database access. Immediately:
1. Change admin password in PocketBase
2. Update `.env` with new password
3. Restart server
4. Audit database for unauthorized changes
5. Review server security

**Q: Can I disable admin auth for development?**
A: Yes, but webhooks won't work. Better to set it up once and use for all environments.

