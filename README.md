# duit.io — Vite Project Structure

Refactored from single `index.html` to proper Vite project.

## Structure

```
duit.io/
├── index.html                 # HTML shell only
├── package.json               # Dependencies
├── vite.config.js             # Vite config
├── vercel.json                # Vercel deployment
├── .gitignore
├── api/
│   └── ai-proxy.js            # Serverless function (Gemini proxy)
├── public/                    # Static assets (icons, manifest, sw.js)
│   ├── manifest.json
│   ├── sw.js
│   ├── icon.svg
│   └── icon-*.png
└── src/
    ├── css/
    │   ├── main.css           # Imports all CSS
    │   ├── base.css           # Reset, variables, typography
    │   ├── components.css     # Reusable UI components
    │   ├── layout.css         # Sidebar, topbar, mobile nav
    │   ├── modals.css         # Sheets, modals, overlays
    │   ├── pages.css          # Page-specific styles
    │   ├── camera.css         # In-app camera
    │   └── themes.css         # Light theme overrides
    └── js/
        ├── app.js             # Entry point — boot, auth, routing
        ├── lib/
        │   ├── config.js      # Constants (banks, categories, colors)
        │   ├── store.js       # Global state
        │   ├── supabase.js    # All DB operations
        │   ├── categories.js  # Category CRUD + group management
        │   ├── router.js      # Client-side routing
        │   ├── toast.js       # Toast notifications
        │   └── utils.js       # Pure helper functions
        ├── ui/
        │   ├── shell.js       # App shell HTML (sidebar, nav)
        │   ├── theme.js       # Dark/light theme
        │   ├── camera.js      # In-app camera
        │   ├── modals.js      # Shared modals (tx, account, budget...)
        │   └── charts.js      # Chart.js wrappers
        └── pages/
            ├── dashboard.js
            ├── accounts.js
            ├── transactions.js
            ├── transfer.js
            ├── budget.js
            ├── recurring.js
            ├── debts.js
            ├── scan.js
            ├── splitbill.js
            ├── bills.js
            ├── advisor.js
            ├── categories.js
            ├── notifications.js
            └── reports.js
```

## Setup

```bash
npm install
npm run dev      # localhost:3000
npm run build    # build to dist/
```

## Deploy to Vercel

Vercel auto-detects Vite. Just push to GitHub — Vercel runs `npm run build` automatically.

Set environment variable in Vercel:
- `GEMINI_API_KEY` = your Gemini API key

## Why Vite?

- **Hot module replacement** — instant updates while developing
- **Tree shaking** — only bundles code that's actually used
- **Code splitting** — Supabase and Chart.js load as separate chunks
- **Proper imports** — `import { fn } from './module'` instead of globals
- **TypeScript ready** — can add `.ts` files anytime
