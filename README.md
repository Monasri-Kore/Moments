# Moments 📸
Student photo & video sharing platform — shared albums, friends, likes, comments.

## Deploy to Railway (get a live link in 15 mins)

### Step 1 — Create GitHub account
Go to https://github.com and sign up (free).

### Step 2 — Create a new repository
- Click "+" → "New repository"
- Name it: moments
- Set to Public
- Click "Create repository"

### Step 3 — Upload these files
On the repository page click "uploading an existing file".
Upload ALL files keeping the same folder structure:
```
moments/
├── server.js
├── db.js
├── package.json
├── railway.json
├── .env
├── middleware/auth.js
├── routes/auth.js
├── routes/albums.js
├── routes/media.js
├── routes/friends.js
├── routes/notifications.js
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```
Click "Commit changes".

### Step 4 — Deploy on Railway
1. Go to https://railway.app → sign up with GitHub (free)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your "moments" repository
4. Click "Deploy Now"
5. Go to Settings → Environment Variables → add:
   - JWT_SECRET = any long random text (e.g. moments_secret_abc123xyz789)
   - PORT = 3000
6. Go to Settings → Networking → click "Generate Domain"
7. Your live URL appears! Share it with friends 🎉

## Local development
```
npm install
node server.js
# Open http://localhost:3000
```
