# Deployment Guide for Render

## Quick Deploy to Render

### Option 1: Deploy via Dashboard (Recommended)

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Update deployment config"
   git push origin main
   ```

2. **Create New Web Service on Render**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

3. **Configure Service**
   - **Name**: `web-v-con`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free (or your choice)

4. **Environment Variables**
   Add these in the Environment section:
   ```
   API_KEY=your-production-api-key-here
   ALLOWED_ORIGINS=*
   ROOM_TTL_HOURS=24
   MAX_PARTICIPANTS_PER_ROOM=50
   ```

5. **Advanced Settings**
   - Health Check Path: `/health`
   - Auto-Deploy: Yes (optional)

6. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (3-5 minutes)
   - Your app will be available at: `https://your-app.onrender.com`

### Option 2: Deploy with render.yaml

1. **Push render.yaml to repo**
   ```bash
   git add render.yaml
   git commit -m "Add Render config"
   git push origin main
   ```

2. **Deploy from Render Dashboard**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Blueprint"
   - Connect repository with `render.yaml`
   - Click "Apply"

## Troubleshooting

### Health Check Timeouts

If deployment times out:
- Check logs in Render dashboard
- Verify `/health` endpoint responds: `curl https://your-app.onrender.com/health`
- Ensure PORT environment variable is used

### Static Files Not Loading

- Verify `static/` directory exists in repo
- Check file permissions
- Review build logs

### WebSocket Connection Fails

- Ensure your app URL uses `https://` (Render provides SSL)
- WebSocket URL should be `wss://your-app.onrender.com/ws`
- Check CORS settings in environment variables

### Memory/Performance Issues

- Upgrade from Free plan if needed
- Monitor resource usage in Render dashboard
- Consider adding Redis for multi-instance deployments

## Post-Deployment

1. **Test the deployment**
   ```bash
   # Check health
   curl https://your-app.onrender.com/health
   
   # Visit in browser
   https://your-app.onrender.com
   ```

2. **Create a test room**
   - Open the URL in your browser
   - Click "Create New Room"
   - Copy the room code
   - Open another browser tab and join with the code

3. **Test API**
   ```bash
   curl -X POST https://your-app.onrender.com/api/rooms \
     -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"ttl_hours": 24}'
   ```

## Production Checklist

- [ ] Change API_KEY from default
- [ ] Configure ALLOWED_ORIGINS for your domain
- [ ] Add TURN server configuration
- [ ] Set up monitoring/alerts
- [ ] Configure backup strategy for room data
- [ ] Review and adjust ROOM_TTL_HOURS
- [ ] Test on multiple devices/networks
- [ ] Set up custom domain (optional)

## Scaling Considerations

For production scale:
1. Upgrade to paid Render plan
2. Add Redis for room storage
3. Implement Redis pub/sub for multi-instance
4. Add TURN server (self-hosted or managed)
5. Consider SFU for large rooms (>6 participants)

## Support

- Render Docs: https://render.com/docs
- Render Status: https://status.render.com
- Project Issues: [Your GitHub Issues URL]
