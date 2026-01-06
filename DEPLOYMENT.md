# Deployment Instructions

## Cloudflare Pages

This Next.js app is configured for static export.

### Configuration in Cloudflare Pages Dashboard:

1. **Framework preset**: Next.js (Static HTML Export)
2. **Build command**: `npm run build`
3. **Build output directory**: `out`
4. **Node version**: 18 or higher

The app will be exported as static HTML and work correctly on Cloudflare Pages.

## Alternative: Vercel (Recommended)

For the best Next.js experience, deploy to Vercel:

```bash
npm install -g vercel
vercel
```

## Alternative: Netlify

1. **Build command**: `npm run build`
2. **Publish directory**: `out`
3. **Node version**: 18 or higher

