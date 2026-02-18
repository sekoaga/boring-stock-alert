const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { LATEST_API_VERSION } = require('@shopify/shopify-api');
const { Pool } = require('pg');

const app = express();

// 1. Database verbinding
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Tabel automatisch aanmaken
const initDb = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS shops (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) UNIQUE NOT NULL,
        access_token TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log("✅ Database tabel 'shops' is klaar.");
  } catch (err) {
    console.error("❌ Database fout:", err);
  }
};
initDb();

// 2. Shopify configuratie
const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES.split(','),
    hostName: process.env.HOST.replace(/https?:\/\//, ''), 
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
});

// 3. De Fix voor 'Cannot GET /exitiframe'
// Deze route vertelt Shopify wat er moet gebeuren als de installatie klaar is
app.get('/exitiframe', (req, res) => {
  const shop = req.query.shop;
  const host = req.query.host;
  res.redirect(`https://${shop}/admin/apps/boring-stock-alert?host=${host}`);
});

// 4. Beveiliging (CSP)
app.use((req, res, next) => {
  const shop = req.query.shop;
  res.setHeader("Content-Security-Policy", `frame-ancestors https://*.myshopify.com https://admin.shopify.com;`);
  next();
});

// 5. Auth Routes
app.get('/api/auth', shopify.auth.begin());

app.get('/api/auth/callback', shopify.auth.callback(), async (req, res) => {
  try {
    const { shop, accessToken } = res.locals.shopify.session;
    await db.query(
      'INSERT INTO shops (shop_domain, access_token) VALUES ($1, $2) ON CONFLICT (shop_domain) DO UPDATE SET access_token = $2',
      [shop, accessToken]
    );
    const host = req.query.host;
    res.redirect(`https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/boring-stock-alert?host=${host}`);
  } catch (error) {
    res.status(500).send("Fout tijdens installatie.");
  }
});

// 6. Het Dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head><meta charset="UTF-8"><title>Boring Stock Alert</title></head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 100px;">
        <h1>🚀 Boring Stock Alert Dashboard</h1>
        <p>Gefeliciteerd! De verbinding is nu 100% gelukt.</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Online op poort ${PORT}`));