# 🚀 Render Deployment Guide

## Quick Deploy to Render

### 1. Prerequisites
- GitHub account with this repository
- Render account (free tier available)

### 2. Deploy Steps

#### Option A: One-Click Deploy (Recommended)

1. **Fork/Push this repository to GitHub**

2. **Go to Render Dashboard**
   - Visit https://render.com
   - Click "New" → "Blueprint"

3. **Connect Repository**
   - Select your repository
   - Render will detect `render.yaml` automatically

4. **Set API Key** (CRITICAL)
   ```bash
   # Generate a secure API key locally:
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   
   - In Render dashboard, find your service
   - Go to "Environment" tab
   - Set `API_KEY` to the generated value
   - Click "Save Changes"

5. **Deploy**
   - Render will automatically deploy your service
   - Wait 2-3 minutes for deployment to complete

6. **Get Your API URL**
   - Copy your service URL: `https://your-app.onrender.com`
   - Save the API key you generated

---

#### Option B: Manual Deploy

1. **Go to Render Dashboard** → "New" → "Web Service"

2. **Connect Repository**
   - Connect your GitHub account
   - Select this repository

3. **Configure Service**
   ```
   Name: webrtc-signaling-api
   Runtime: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2
   ```

4. **Add Environment Variables**
   ```
   API_KEY = [generate secure key]
   ALLOWED_ORIGINS = *
   ROOM_TTL_HOURS = 24
   MAX_PARTICIPANTS_PER_ROOM = 50
   ```

5. **Set Health Check**
   ```
   Health Check Path: /health
   ```

6. **Deploy**

---

## 3. Post-Deployment

### Verify Deployment

```bash
# Check health
curl https://your-app.onrender.com/health

# Test API (replace with your API key)
curl -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"owner_id":"test","ttl_hours":1}' \
     https://your-app.onrender.com/api/rooms
```

### Access API Documentation

- Swagger UI: `https://your-app.onrender.com/api/docs`
- ReDoc: `https://your-app.onrender.com/api/redoc`

---

## 4. Configuration

### Environment Variables

Configure in Render Dashboard → Environment:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | ✅ Yes | - | Secure API authentication key |
| `ALLOWED_ORIGINS` | No | `*` | CORS allowed origins (comma-separated) |
| `ROOM_TTL_HOURS` | No | `24` | Default room lifetime in hours |
| `MAX_PARTICIPANTS_PER_ROOM` | No | `50` | Maximum participants per room |

### For Production

**Security:**
- Use a strong API key (32+ characters)
- Set specific `ALLOWED_ORIGINS` (your domain)
- Enable HTTPS (automatic on Render)
- Rotate API keys periodically

**Performance:**
- Consider upgrading from free tier for better performance
- Free tier: Services spin down after 15 min of inactivity
- Paid tier: Always-on + better resources

---

## 5. Monitoring

### Health Check

Render automatically monitors `/health` endpoint:
- ✅ Returns 200 = Healthy
- ❌ Returns non-200 = Unhealthy → Auto-restart

### View Logs

```bash
# In Render Dashboard
→ Select your service
→ Click "Logs" tab
→ View real-time logs
```

### Metrics

Monitor from Render Dashboard:
- Response times
- Error rates
- Memory usage
- CPU usage

---

## 6. Auto-Deploy

Render automatically deploys on git push to main branch.

To disable:
1. Go to service settings
2. Toggle "Auto-Deploy" off

---

## 7. Custom Domain (Optional)

### Add Your Domain

1. Go to service settings
2. Click "Custom Domain"
3. Add your domain: `video-api.yourdomain.com`
4. Update DNS records as instructed
5. Update `ALLOWED_ORIGINS` to include your domain

---

## 8. Scaling

### Free Tier Limitations
- 750 hours/month
- Spins down after 15 min inactivity
- 512 MB RAM
- Shared CPU

### Upgrade for Production
- **Starter ($7/mo)**: Always-on, 512 MB RAM
- **Standard ($25/mo)**: 2 GB RAM, better performance
- **Pro ($85/mo)**: 4 GB RAM, dedicated resources

### Auto-Scaling
Render handles load balancing automatically on paid tiers.

---

## 9. Backup & Recovery

### Data Persistence

Room data is stored in `data/rooms.json`:
- Mounted on persistent disk (configured in `render.yaml`)
- Survives restarts
- 1 GB storage included

### Backup Strategy

For production:
1. Enable disk backup in Render
2. Or periodically save data to external storage (S3, etc.)

---

## 10. Troubleshooting

### Service Won't Start

**Check Logs:**
```
Render Dashboard → Logs
```

**Common Issues:**
- Missing `API_KEY` env var → Add it in Environment tab
- Port binding error → Ensure using `$PORT` in start command
- Dependency errors → Check `requirements.txt`

### WebSocket Connection Fails

**Verify:**
- URL uses `wss://` (not `ws://`)
- Firewall allows WebSocket connections
- CORS settings allow your origin

### API Returns 401

- Verify `X-API-Key` header is included
- Check API key matches environment variable
- Key is case-sensitive

---

## 11. Cost Estimate

### Free Tier (Perfect for Testing)
- **Cost:** $0/month
- **Limits:** 750 hours, sleeps after 15min
- **Good for:** Development, small projects

### Starter Tier (Recommended for Production)
- **Cost:** $7/month
- **Features:** Always-on, 512 MB RAM
- **Good for:** Small ed-tech platform (< 50 concurrent users)

### Standard Tier
- **Cost:** $25/month
- **Features:** 2 GB RAM, better performance
- **Good for:** Growing platform (50-200 concurrent users)

---

## 12. Integration with Your Ed-Tech Platform

See [API_INTEGRATION.md](./API_INTEGRATION.md) for:
- Complete API reference
- Frontend integration examples
- Security best practices
- Usage patterns for ed-tech

---

## 🎉 You're Live!

Your WebRTC signaling API is now deployed on Render and ready to handle video conferencing for your ed-tech platform.

**Your Setup:**
- ✅ API URL: `https://your-app.onrender.com`
- ✅ API Key: Securely stored in Render
- ✅ Auto-deploy: Enabled on git push
- ✅ Health monitoring: Active
- ✅ Documentation: Available at `/api/docs`

**Next Steps:**
1. Save your API URL and key
2. Integrate with your frontend
3. Test with real users
4. Monitor logs and metrics
5. Consider upgrading for production

Need help? Check the logs or refer to [API_INTEGRATION.md](./API_INTEGRATION.md)!
