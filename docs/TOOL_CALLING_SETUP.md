# Tool Calling Setup Guide

Quick guide to get tool calling (image generation) working in your Thirra AI app.

## Prerequisites

✅ Thirra AI app running  
✅ PocketBase running  
✅ OpenRouter API key configured  

## Step 1: Get Nanobanana API Key

1. Visit https://kie.ai
2. Sign up / Log in
3. Navigate to API settings
4. Copy your API key

## Step 2: Configure Environment

Add to your `.env` file:

```bash
NANOBANANA_API_KEY=your_actual_api_key_here
```

**Optional**: Custom webhook URL (defaults to your APP_BASE_URL):
```bash
NANOBANANA_CALLBACK_URL=https://your-domain.com/api/webhooks/nanobanana
```

## Step 3: Set Up PocketBase Admin (Required for Webhooks)

**Why needed**: Webhooks from Nanobanana need admin access to update tool call records.

1. **Open PocketBase Admin UI**: `http://localhost:8090/_/`
2. **Go to Settings** → **Admins**
3. **Create New Admin**:
   - Email: `webhooks@yourapp.com` (or any email)
   - Password: Generate a strong random password (20+ chars)
   - Save

4. **Add to `.env`**:
   ```bash
   POCKETBASE_ADMIN_EMAIL=webhooks@yourapp.com
   POCKETBASE_ADMIN_PASSWORD=your_secure_password_here
   ```

**⚠️ Important**: Use a dedicated admin account (not your personal one) for security.

See [POCKETBASE_ADMIN_SETUP.md](POCKETBASE_ADMIN_SETUP.md) for detailed security best practices.

## Step 4: Update PocketBase Schema

### Option A: Via Admin UI

1. Open PocketBase Admin: `http://localhost:8090/_/`
2. Go to **Collections**
3. Click **New Collection**

**Create `tool_calls` Collection:**

| Field | Type | Settings |
|-------|------|----------|
| `turn` | Relation | Required, Single, → turns |
| `tool_name` | Text | Required, Max: 100 |
| `tool_call_id` | Text | Required, Max: 100 |
| `arguments` | JSON | Required |
| `result` | JSON | Optional |
| `status` | Select | Required, Options: pending, processing, completed, failed |
| `error` | Text | Optional |
| `external_id` | Text | Optional, Max: 200 |
| `metadata` | JSON | Optional |

**API Rules:**
- **List/Search**: `@request.auth.id != "" && turn.conversation.user = @request.auth.id`
- **View**: `@request.auth.id != "" && turn.conversation.user = @request.auth.id`
- **Create**: `@request.auth.id != ""`
- **Update**: `turn.conversation.user = @request.auth.id`
- **Delete**: `@request.auth.id != "" && turn.conversation.user = @request.auth.id`

**Note**: Update rule allows admin (webhook) to update records, but users can only update their own.

**Update `turns` Collection:**

Add these fields:

| Field | Type | Settings |
|-------|------|----------|
| `has_tool_calls` | Bool | Optional, Default: false |
| `tool_count` | Number | Optional, Default: 0, Min: 0 |

### Option B: Via SQL (Advanced)

See [POCKETBASE_SCHEMA_TOOLS.md](POCKETBASE_SCHEMA_TOOLS.md) for SQL commands.

## Step 5: Restart Server

```bash
cd app
npm run dev
```

You should see:
```
[PocketBase] Admin authenticated for webhook operations ✅
[AI] Tools enabled: generate_image
```

**If you see**: `[PocketBase] No admin credentials configured` → Go back to Step 3!

## Step 6: Test It!

### Test 1: Manual API Test

```bash
curl -X POST http://localhost:4000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PB_AUTH_TOKEN" \
  -d '{
    "prompt": "Generate an image of a beautiful sunset over the ocean"
  }'
```

**Expected Response:**
```json
{"type":"init","conversation":{...}}
{"type":"chunk","text":"I'll generate that image for you."}
{"type":"tool_calls","count":1,"tools":[{"name":"generate_image","args":{...}}]}
{"type":"tool_results","results":[{"tool":"generate_image","success":true,"data":{"taskId":"task_123",...}}]}
{"type":"final","data":{...}}
```

### Test 2: Check Tool Call Record

```bash
# Query PocketBase directly
curl "http://localhost:8090/api/collections/tool_calls/records" \
  -H "Authorization: Bearer YOUR_PB_AUTH_TOKEN"
```

### Test 3: Query Task Status

```bash
curl "http://localhost:4000/api/webhooks/nanobanana/status/task_123"
```

## Step 7: Setup Webhook (Production)

For production, your webhook endpoint must be publicly accessible.

### Option A: Use ngrok (Development/Testing)

```bash
# In a new terminal
ngrok http 4000

# Copy the https URL (e.g., https://abc123.ngrok.io)
# Add to .env:
NANOBANANA_CALLBACK_URL=https://abc123.ngrok.io/api/webhooks/nanobanana
```

### Option B: Deploy to Production

1. Deploy your app to a public server
2. Webhook URL will be: `https://your-domain.com/api/webhooks/nanobanana`
3. No additional config needed (auto-generated from APP_BASE_URL)

## Troubleshooting

### ❌ "Tools enabled" not showing in logs

**Issue**: Tool not registered

**Solution:**
```bash
# Check NANOBANANA_API_KEY is set
echo $NANOBANANA_API_KEY

# Restart server
npm run dev
```

### ❌ LLM not calling tool

**Issue**: Model doesn't understand when to use tool

**Solution:** Be more explicit in your prompt:
```
"Use the image generation tool to create a sunset picture"
```

Or check logs for tool binding:
```
[AI] Tools enabled: generate_image
```

### ❌ Tool execution fails

**Issue**: API key invalid or API down

**Check logs:**
```
[Image Tool] API Error: 401 - Unauthorized
```

**Solution:**
- Verify API key is correct
- Check API status: https://kie.ai/status
- Check network connectivity

### ❌ Webhook not received

**Issue**: Callback URL not accessible

**Solutions:**

1. **Check URL accessibility:**
```bash
curl https://your-callback-url/api/webhooks/nanobanana
```

2. **For local development, use ngrok:**
```bash
ngrok http 4000
```

3. **Check webhook logs:**
```
[Webhook] Nanobanana callback received: {...}
```

### ❌ PocketBase collection not found

**Issue**: `tool_calls` collection not created

**Error:**
```
Failed to create record: Collection 'tool_calls' not found
```

**Solution:** Go back to Step 3 and create the collection

### ❌ Tool call record not updating

**Issue**: Webhook can't find record by external_id

**Check logs:**
```
[Webhook] No tool call record found for taskId: task_123
```

**Solution:**
- Verify record was created with correct `external_id`
- Check PocketBase API rules allow updates
- Verify webhook endpoint has PocketBase access

## Verify Everything Works

### Complete Flow Test

1. **Send request:**
```bash
curl -X POST http://localhost:4000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"prompt": "Generate an image of a cat"}'
```

2. **Check response includes tool_calls:**
```json
{"type":"tool_calls","count":1,...}
{"type":"tool_results","results":[{"tool":"generate_image","success":true,...}]}
```

3. **Verify PocketBase record:**
```bash
# Should show new tool_call record
curl "http://localhost:8090/api/collections/tool_calls/records?sort=-created" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

4. **Wait for webhook (5-30 seconds):**
```
[Webhook] Nanobanana callback received: {code: 200, ...}
[Webhook] Updated tool call record: xyz123
```

5. **Check updated record:**
```bash
# Status should be "completed" with result
curl "http://localhost:8090/api/collections/tool_calls/records/RECORD_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Next Steps

✅ **Working?** Great! Try these:
- Test with different prompts
- Test with image editing (pass `image_urls`)
- Monitor costs in Nanobanana dashboard
- Add rate limiting per user

📚 **Learn More:**
- [TOOL_CALLING.md](TOOL_CALLING.md) - Full documentation
- [POCKETBASE_SCHEMA_TOOLS.md](POCKETBASE_SCHEMA_TOOLS.md) - Schema details
- [nanobanana.md](nanobanana.md) - API documentation

🛠️ **Add More Tools:**
- See "Adding New Tools" section in TOOL_CALLING.md
- Popular tools: web search, calculator, database queries
- LangChain has many pre-built tools

## Production Checklist

Before going live:

- [ ] NANOBANANA_API_KEY is set securely (not in code)
- [ ] Webhook URL is publicly accessible
- [ ] PocketBase schema is created
- [ ] API rules are configured correctly
- [ ] Webhook security is enabled (HMAC/IP whitelist)
- [ ] Rate limiting is configured
- [ ] Error monitoring is set up
- [ ] Cost tracking is implemented
- [ ] Tested end-to-end flow
- [ ] Documented for your team

## Common Use Cases

### 1. Image Generation

```
User: "Create a logo for my coffee shop"
LLM: [calls generate_image]
Result: Image URL
```

### 2. Image Editing

```
User: "Turn this photo into a cartoon" + [attach image]
LLM: [calls generate_image with image_urls]
Result: Edited image URL
```

### 3. Multiple Tools (Future)

```
User: "Search for sunset photos and generate a similar one"
LLM: [calls web_search, then generate_image]
Result: Generated image based on search results
```

## Support

Need help?
- Check logs: Look for `[AI]`, `[Tools]`, `[Webhook]` prefixes
- Enable debug mode: Set `NODE_ENV=development`
- Check API status: https://kie.ai
- Review docs: [TOOL_CALLING.md](TOOL_CALLING.md)

Happy coding! 🎨✨

