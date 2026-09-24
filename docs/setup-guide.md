Setup Project

1. Demo account

Live system (no installation needed):
- Web portal: https://capstone-food-res-q-web-web.vercel.app
- API docs (Swagger): https://capstone-foodresq-web.onrender.com/api/docs

● Role ADMIN:
Email: admin@foodresq.vn
Pass: Provider123

● Role PROVIDER (food provider — bakery / restaurant / supermarket):
Email: tiembanhmattroi@foodresq.vn
Pass: Provider123

● Role RECEIVER (Charity organization — creates kitchen campaigns):
Email: beptuthien@foodresq.vn
Pass: Provider123

● Role RECEIVER (Individual — reserves food, face eKYC enrolled):
Email: <điền email>
Pass: <điền mật khẩu>

● Role VOLUNTEER (Shipper):
Email: shipper1@foodresq.vn
Pass: Provider123

● Role VOLUNTEER (Chef):
Email: <điền email>
Pass: <điền mật khẩu>

● Role VOLUNTEER (Waiter):
Email: <điền email>
Pass: <điền mật khẩu>


2. Installation Guides

2.1 System Requirements

2.1.1 Back-End Application
Node.js version 22 LTS or newer
pnpm version 9 or newer (npm i -g pnpm)
PostgreSQL 17 with PostGIS extension (or the shared Supabase database)
Redis version 6.2 or newer (Windows: Memurai or WSL)
Docker version 24 or newer (optional — only for container deployment)

2.1.2 Front-End Application
Node.js version 22 LTS or newer
pnpm version 9 or newer

2.1.3 Mobile Application
Node.js version 22 LTS or newer
JDK 17 (Eclipse Temurin)
Android SDK (API 36) with an emulator or a physical Android device (USB debugging on)
Note: the app uses native Firebase modules, so Expo Go is NOT supported — a development build is required.


2.2 Installation Instruction

The project is a pnpm monorepo (Turborepo): apps/api (NestJS), apps/web (Next.js), apps/mobile (Expo React Native), packages/types (shared types). All three apps are in one repository.

Clone the source code (once):
Git clone "git clone https://github.com/trimikey/Capstone_FoodResQ_Web.git"
Open terminal in the source code folder
Run "pnpm install" to install packages for all apps

2.2.1 Back-End Application
Create apps/api/.env with those variables

# ---------- Database (PostgreSQL + PostGIS) ----------
DATABASE_URL=
DIRECT_URL=
# ---------- JWT ----------
JWT_SECRET=
JWT_REFRESH_SECRET=
# ---------- Redis ----------
REDIS_URL=
# ---------- Server ----------
PORT=3001
ALLOWED_ORIGINS=
FRONTEND_URL=
# ---------- Email (SMTP) ----------
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
# ---------- Firebase Admin (push notification, Google sign-in) ----------
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=
FIREBASE_SERVICE_ACCOUNT=
GOOGLE_CLIENT_ID=
# ---------- Cloudinary (image storage) ----------
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=

Development environment
Run "cp apps/api/.env.example apps/api/.env" to create the env file, then fill in the values
Make sure Redis is running at the address in REDIS_URL
Run "pnpm db:generate" to generate the Prisma client
Run "pnpm db:push" to create the database schema (skip when using the shared database)
Run "pnpm --filter @foodresq/api seed" to seed demo data (skip when using the shared database)
Run "pnpm --filter @foodresq/api dev" to run the API
The API runs at http://localhost:3001/api/v1
Swagger documentation runs at http://localhost:3001/api/docs

Production environment
Build the Docker image from the repository root: "docker build -f apps/api/Dockerfile -t foodresq-api ."
Run the container with the same variables as apps/api/.env and NODE_ENV=production
(The live API is deployed on Render using render.yaml in the repository root.)

2.2.2 Front-End Application
Create apps/web/.env with those variables

# ---------- Backend ----------
NEXT_PUBLIC_API_URL=
# ---------- Map ----------
NEXT_PUBLIC_MAPBOX_TOKEN=
# ---------- Auth ----------
NEXTAUTH_SECRET=
NEXTAUTH_URL=
# ---------- Firebase (web push notification) ----------
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
# ---------- Cloudinary ----------
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

Development environment
Run "pnpm --filter @foodresq/web dev" to run the web application
(or run "pnpm dev" at the root to start both API and Web together)
The web app runs at http://localhost:3000

Production environment
Run "pnpm --filter @foodresq/web build" to build the application
Run "pnpm --filter @foodresq/web start" to serve the built application
(The live web portal is deployed on Vercel.)

2.2.3 Mobile Application
Create apps/mobile/.env with those variables

# Backend API (use the machine LAN IP, not localhost, when running on a physical phone)
EXPO_PUBLIC_API_URL=

# Google OAuth web client id (for Google sign-in)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=

Development environment
Place the Firebase config file google-services.json in apps/mobile/
Start an Android emulator, or connect an Android phone with USB debugging enabled
Run "cd apps/mobile" then "npx expo run:android" to build and install the development app (first build takes about 10–15 minutes)
For later runs, run "pnpm mobile" at the root to start Metro, then open the installed FoodResQ app
When using a phone over USB, run "pnpm --filter mobile mobile:usb" so the phone can reach the local backend
