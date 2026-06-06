// scripts/generate-vapid.mjs
// Run ONCE locally: node scripts/generate-vapid.mjs
// Output the keys, then paste them into Vercel env + Supabase Edge Function env.
// Do NOT commit private key.

import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('')
console.log('═══════════════════════════════════════════════════════════════════')
console.log('   VAPID Keys Generated — Save these securely!')
console.log('═══════════════════════════════════════════════════════════════════')
console.log('')
console.log('1️⃣  Vercel env (Project Settings → Environment Variables):')
console.log('')
console.log('   VITE_VAPID_PUBLIC_KEY =', keys.publicKey)
console.log('')
console.log('2️⃣  Supabase Edge Function env (Project Settings → Edge Functions → Secrets):')
console.log('')
console.log('   VAPID_PUBLIC_KEY  =', keys.publicKey)
console.log('   VAPID_PRIVATE_KEY =', keys.privateKey)
console.log('   VAPID_SUBJECT     = mailto:your-email@example.com')
console.log('')
console.log('═══════════════════════════════════════════════════════════════════')
console.log('⚠️  PRIVATE KEY: never put in git/frontend. Backend secret only.')
console.log('═══════════════════════════════════════════════════════════════════')
