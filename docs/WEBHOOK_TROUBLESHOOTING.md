# Webhook Troubleshooting Guide

## Issue: Tool Call Not Updating After Image Generation

### Symptoms

- Image generation completes successfully (you can verify via Nanobanana dashboard)
- Tool call record in PocketBase still shows `status: "processing"`
- Result field doesn't contain the image URLs

### Root Causes & Solutions

#### 1. **Missing Admin Authentication** (Most Common)

**Problem**: Webhook cannot update `tool_calls` collection - no authentication.

**Symptoms**:
```
[Webhook] Looking for tool_call with external_id: abc123
[Webhook] No tool call record found for taskId: abc123
```

**Solution**: Set up admin authentication for webhooks.

**Quick Fix**:

1. **Create admin account in PocketBase**:
   - Open PocketBase admin UI: `http://localhost:8090/_/`
   - Settings → Admins → Create new admin
   - Use email: `webhooks@yourapp.com`
   - Generate a strong password

2. **Add to `.env`**:
   ```bash
   POCKETBASE_ADMIN_EMAIL=webhooks@yourapp.com
   POCKETBASE_ADMIN_PASSWORD=your_secure_password
   ```

3. **Restart server**:
   ```bash
   npm run dev
   ```

4. **Verify**:
   Check logs for:
   ```
   [PocketBase] Admin authenticated for webhook operations ✅
   ```

**See**: `POCKETBASE_ADMIN_SETUP.md` for detailed setup guide.

#### 2. **Webhook URL Not Accessible**

**Problem**: Nanobanana cannot reach your webhook endpoint.

**Check**:
```bash
# Test if your webhook is accessible
curl -X POST http://your-domain.com/api/webhooks/nanobanana \
  -H "Content-Type: application/json" \
  -d '{"code":200,"data":{"taskId":"test","state":"success","resultJson":"{}"}}}'
```

**Solutions**:
- **Local Development**: Use ngrok
  ```bash
  ngrok http 4000
  # Set NANOBANANA_CALLBACK_URL to ngrok URL
  ```

- **Production**: Ensure your server is publicly accessible

#### 3. **External ID Mismatch**

**Problem**: Tool call record's `external_id` doesn't match the webhook's `taskId`.

**Debug**:
```bash
# Check what's stored in PocketBase
curl "http://localhost:8090/api/collections/tool_calls/records" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Look for the external_id field
```

**Solution**: Verify tool call creation logs:
```
[ToolCalls] Created record: xyz123 for tool generate_image
```

Check if `external_id` was set correctly.

#### 4. **Webhook Payload Format**

**Problem**: Nanobanana sends payload in unexpected format.

**Debug**: Check server logs for:
```
[Webhook] Nanobanana callback received: {"code":200,"taskId":"...","state":"success"}
```

**Expected format**:
```json
{
  "code": 200,
  "data": {
    "taskId": "abc123",
    "state": "success",
    "resultJson": "{\"resultUrls\":[\"https://...\"]}",
    "costTime": 8,
    "consumeCredits": 100
  }
}
```

## Debugging Steps

### Step 1: Check Webhook is Receiving Data

```bash
# Watch server logs
tail -f logs/server.log | grep Webhook
```

Look for:
```
[Webhook] Nanobanana callback received: ...
[Webhook] Looking for tool_call with external_id: task_123
[Webhook] Found tool_call record: xyz, updating...
[Webhook] Updated tool call record: xyz
```

### Step 2: Manually Query Task Status

```bash
curl "http://localhost:4000/api/webhooks/nanobanana/status/YOUR_TASK_ID"
```

This bypasses the webhook and directly queries Nanobanana API.

### Step 3: Check PocketBase Records

```javascript
// In PocketBase admin console or via API
const toolCalls = await pb.collection('tool_calls').getFullList({
  filter: 'status="processing"',
  sort: '-created',
});

console.log(toolCalls);
```

### Step 4: Test Webhook Manually

```bash
# Simulate a success webhook
curl -X POST http://localhost:4000/api/webhooks/nanobanana \
  -H "Content-Type: application/json" \
  -d '{
    "code": 200,
    "data": {
      "taskId": "YOUR_ACTUAL_TASK_ID",
      "state": "success",
      "resultJson": "{\"resultUrls\":[\"https://example.com/image.jpg\"]}",
      "costTime": 8,
      "consumeCredits": 100
    }
  }'
```

Check server logs for errors.

### Step 5: Verify Database Update

```sql
-- Check tool_calls table
SELECT * FROM tool_calls WHERE external_id = 'YOUR_TASK_ID';
```

## Common Error Messages

### Error: "No tool call record found for taskId"

**Meaning**: Database doesn't have a record with that `external_id`.

**Solutions**:
1. Check if tool call was created:
   ```
   [Chat] Processing 1 tool call(s)
   [ToolCalls] Created record: xyz for tool generate_image
   ```

2. Verify `external_id` was set:
   ```javascript
   const externalId = parsedResult.taskId || null;
   ```

3. Check taskId is correct in webhook payload

### Error: "Failed to update tool call record: 403"

**Meaning**: PocketBase blocking the update - authentication issue.

**Solutions**:
1. Check admin credentials are configured (see #1 above)
2. Verify admin authentication succeeded in logs:
   ```
   [PocketBase] Admin authenticated for webhook operations
   ```
3. Test admin login manually:
   ```bash
   curl -X POST http://localhost:8090/api/admins/auth-with-password \
     -H "Content-Type: application/json" \
     -d '{"identity":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
   ```

### Error: "Failed to update tool call record: 404"

**Meaning**: Tool call record was deleted or doesn't exist.

**Solution**: Check database to confirm record exists

## Quick Fix Checklist

- [ ] PocketBase API rules allow unauthenticated updates
- [ ] Webhook URL is publicly accessible (use ngrok for local dev)
- [ ] Tool call record exists in database with correct `external_id`
- [ ] Server logs show webhook being received
- [ ] No errors in webhook processing logs
- [ ] JSON fields in PocketBase are configured correctly

## Testing Webhook Flow

### Complete Test

1. **Generate Image**:
   ```bash
   curl -X POST http://localhost:4000/api/chat/stream \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"generate a test image"}'
   ```

2. **Note the taskId** from response:
   ```json
   {"type":"tool_results","results":[{"data":{"taskId":"abc123"}}]}
   ```

3. **Wait for webhook** (5-30 seconds)

4. **Check update**:
   ```bash
   GET /api/conversations/{conversationId}
   ```

5. **Should see**:
   ```json
   {
     "tool_calls": [{
       "status": "completed",
       "result": {
         "resultUrls": ["https://..."]
       }
     }]
   }
   ```

## Production Checklist

- [ ] Webhook endpoint is HTTPS (required by most services)
- [ ] API rules are production-ready
- [ ] Error monitoring is set up
- [ ] Webhook retry logic is implemented (optional)
- [ ] Rate limiting is configured
- [ ] Logs are being collected
- [ ] Database backups are enabled

## Need More Help?

If webhook still not working:

1. **Enable verbose logging**:
   ```javascript
   // In webhooks.controller.js
   console.log('[Webhook] Full payload:', JSON.stringify(payload, null, 2));
   console.log('[Webhook] PocketBase URL:', config.pocketbase.url);
   ```

2. **Test with a simpler update**:
   ```javascript
   // Directly update without service functions
   const updated = await pb.collection('tool_calls').update(toolCall.id, {
     status: 'completed'
   });
   console.log('Direct update result:', updated);
   ```

3. **Check PocketBase logs** (if self-hosted)

4. **Contact support** with:
   - Server logs during webhook
   - PocketBase API rules
   - Database record for the tool_call
   - Webhook payload received

