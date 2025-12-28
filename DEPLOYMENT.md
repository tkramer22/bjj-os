# Vercel Deployment Guide for BJJ OS

This guide will help you deploy your Replit project to Vercel and connect your bjjos.app domain.

## Important Note About Replit → Vercel Deployment

⚠️ **Replit does not have direct Vercel deployment.** The workflow is:
1. Export your Replit project to GitHub
2. Deploy from GitHub to Vercel
3. Connect your custom domain in Vercel

## Step 1: Export to GitHub

### 1.1 Create GitHub Repository (if you haven't already)
1. Go to https://github.com and create a new repository
2. Name it something like `bjj-os` or `bjj-technique-sms`
3. Keep it private or public as you prefer
4. Do NOT initialize with README (we'll push existing code)

### 1.2 Connect Replit to GitHub
1. In your Replit workspace, open the **Git pane** (left sidebar)
2. Click **Initialize Git repository** (if not already initialized)
3. Click **Connect to GitHub**
4. Authorize Replit to access your GitHub account
5. Select the repository you just created
6. Push your code to GitHub

Alternatively, you can use the Shell:
```bash
git init
git add .
git commit -m "Initial commit - BJJ OS SMS System"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

## Step 2: Prepare Environment Variables

Before deploying, gather all your environment variables. You'll need these exact values:

### Required Environment Variables:
```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
YOUTUBE_API_KEY=your_youtube_api_key
DATABASE_URL=your_postgresql_connection_string
ADMIN_PASSWORD=your_admin_dashboard_password
SESSION_SECRET=your_session_secret_here
```

### Optional (if using Stripe):
```
STRIPE_SECRET_KEY=your_stripe_secret_key
```

**Important Notes:**
- `DATABASE_URL` should be a PostgreSQL connection string (e.g., from Neon, Supabase, or Vercel Postgres)
- `TWILIO_PHONE_NUMBER` should include country code (e.g., +14155551234)
- Keep your current `ADMIN_PASSWORD` from Replit
- Generate a new `SESSION_SECRET` or use your existing one

## Step 3: Deploy to Vercel

### 3.1 Import Project to Vercel
1. Go to https://vercel.com and sign in (or create an account)
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Connect your GitHub account if not already connected
5. Find and select your repository (e.g., `bjj-os`)
6. Click **"Import"**

### 3.2 Configure Project Settings

**Framework Preset:** Other (or Node.js)

**Root Directory:** `./` (leave as default)

**Build Command:**
```
npm run build
```

**Output Directory:** `dist` (Vercel usually auto-detects)

**Install Command:**
```
npm install
```

**Start Command:**
```
npm start
```

**Node.js Version:** 20.x (select in Project Settings)

### 3.3 Add Environment Variables
1. In the Vercel project settings, scroll to **"Environment Variables"**
2. Add each variable from Step 2 above:
   - Click **"Add New"**
   - Enter **Key** (e.g., `ANTHROPIC_API_KEY`)
   - Enter **Value** (your actual API key)
   - Select **"Production"**, **"Preview"**, and **"Development"**
   - Click **"Save"**
3. Repeat for ALL environment variables listed in Step 2

### 3.4 Deploy
1. Click **"Deploy"**
2. Wait for the build to complete (usually 2-5 minutes)
3. Vercel will provide a URL like `your-project.vercel.app`
4. Test this URL to ensure the app works

## Step 4: Connect bjjos.app Domain

### 4.1 Add Domain in Vercel
1. Go to your Vercel project dashboard
2. Click on **"Settings"** tab
3. Click **"Domains"** in the left sidebar
4. Click **"Add"**
5. Enter `bjjos.app`
6. Click **"Add"**

### 4.2 Configure DNS Records

Vercel will show you the DNS records you need to add. You'll see something like:

**For apex domain (bjjos.app):**
- Type: `A`
- Name: `@`
- Value: `76.76.21.21` (Vercel's IP)

**For www subdomain:**
- Type: `CNAME`
- Name: `www`
- Value: `cname.vercel-dns.com`

### 4.3 Update DNS at Your Domain Registrar
1. Go to your domain registrar (where you bought bjjos.app - e.g., Namecheap, GoDaddy, Google Domains, etc.)
2. Find DNS settings / DNS management
3. Add the `A` record:
   - Type: `A`
   - Host/Name: `@` (or leave empty for root)
   - Value/Points to: `76.76.21.21` (use the IP Vercel shows you)
   - TTL: 3600 (or Auto)
4. Add the `CNAME` record for www:
   - Type: `CNAME`
   - Host/Name: `www`
   - Value/Points to: `cname.vercel-dns.com` (use the value Vercel shows you)
   - TTL: 3600 (or Auto)
5. **Save changes**

### 4.4 Wait for DNS Propagation
- DNS changes can take 5 minutes to 48 hours (usually 15-30 minutes)
- Check status in Vercel's Domains tab
- When ready, you'll see a green checkmark ✓ next to bjjos.app

### 4.5 Enable HTTPS
- Vercel automatically provisions SSL certificates
- Once DNS is verified, HTTPS will be enabled automatically
- Your site will be accessible at `https://bjjos.app`

## Step 5: Configure Twilio Webhook URLs

After deployment, update your Twilio webhook URLs:

1. Go to Twilio Console → Phone Numbers
2. Select your SMS-enabled number
3. Under "Messaging", update webhook URL to:
   ```
   https://bjjos.app/api/sms-reply
   ```
4. Set HTTP method to `POST`
5. Save changes

## Step 6: Test Your Deployment

1. Visit `https://bjjos.app`
2. Test the landing page signup form
3. Go to `https://bjjos.app/admin/add-free-user`
4. Test creating a free user (you should receive SMS)
5. Reply to the SMS to test the onboarding flow
6. Check the admin dashboard at `https://bjjos.app/admin/schedules`

## Troubleshooting

### Build Fails on Vercel
- Check the build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version is 20.x

### App Won't Start
- Check that all environment variables are set correctly
- Verify `DATABASE_URL` is a valid PostgreSQL connection
- Check Vercel function logs for errors

### Domain Not Connecting
- Verify DNS records are correct (case-sensitive)
- Wait 30-60 minutes for DNS propagation
- Use https://dnschecker.org to check propagation status
- Ensure no conflicting CNAME/A records exist

### SMS Not Working
- Verify Twilio credentials in environment variables
- Check Twilio webhook URL is set to `https://bjjos.app/api/sms-reply`
- Check Twilio console for error logs

## Database Migration

If you're using a different database than Replit's:

1. Export your Replit database data (if needed)
2. Set up a production PostgreSQL database (Neon, Supabase, or Vercel Postgres)
3. Update `DATABASE_URL` environment variable in Vercel
4. Run database migrations:
   ```bash
   npm run db:push
   ```

## Updates and Redeployments

When you make changes:
1. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your change description"
   git push
   ```
2. Vercel will automatically redeploy (if auto-deploy is enabled)
3. Or manually trigger deployment from Vercel dashboard

## Production Checklist

Before going live:
- [ ] All environment variables are set in Vercel
- [ ] Database is configured and accessible
- [ ] Twilio webhooks point to bjjos.app
- [ ] Admin password is secure
- [ ] Domain bjjos.app is connected and verified
- [ ] HTTPS is enabled (automatic with Vercel)
- [ ] Test signup flow from landing page
- [ ] Test admin dashboard login
- [ ] Test SMS sending and replies
- [ ] Test referral code system

## Support Resources

- **Vercel Docs:** https://vercel.com/docs
- **Vercel Community:** https://github.com/vercel/vercel/discussions
- **DNS Help:** https://vercel.com/docs/concepts/projects/domains

---

**Questions?** The deployment process can take 30-60 minutes total. Most of that is DNS propagation. If you encounter issues, check the Troubleshooting section above.
