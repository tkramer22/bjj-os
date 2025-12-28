#!/bin/bash

# BJJ OS Deployment Script with Automatic Cache Busting
# This script ensures all users see the latest version immediately

set -e

echo "🚀 Starting deployment..."

# 1. Increment app version (forces cache clear on all clients)
echo "📦 Incrementing app version..."
node scripts/increment-version.js

# 2. Build the application
echo "🔨 Building application..."
npm run build

# 3. Restart the server (assuming you're using a process manager)
echo "🔄 Restarting server..."
# Uncomment the appropriate command for your deployment:
# pm2 restart bjj-os
# systemctl restart bjj-os
# Or just exit if using Replit auto-deploy

echo "✅ Deployment complete!"
echo "✅ All users will receive the latest version on next page load"
