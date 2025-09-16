# Vercel Environment Variables Setup

## Required Environment Variables:

Add these in Vercel Dashboard → Project Settings → Environment Variables:

```
MONGODB_URI=mongodb+srv://sk8113347_db_user:sDOTrPq6tzLJnbrA@cluster0.qjf61mx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

CLOUDINARY_CLOUD_NAME=dlfhykisk
CLOUDINARY_API_KEY=239914458915717
CLOUDINARY_API_SECRET=7ZoO1BbNZm2oLK64uEHBzEU0VIs

NODE_ENV=production
```

## MongoDB Atlas Setup:

1. Go to MongoDB Atlas → Network Access
2. Add IP Address: `0.0.0.0/0` (Allow from anywhere)
3. Confirm the database user is active
4. Test connection string

## Deployment Steps:

1. Set environment variables in Vercel
2. Redeploy the project
3. Check Vercel function logs for connection status