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

// 3. DE FIX VOOR "VERBINDING GEWEIGERD"
// We dwingen de browser om het frame te accepteren voor ELKE shop
app.use((req, res, next) => {
  const shop = req.query.shop || (req.headers['x-shop-id']);
  if (shop) {
    res.setHeader("Content-Security-Policy", `frame-ancestors https://${shop} https://admin.shopify.com;`);
  } else {
    res.setHeader("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
  }
  next();
});

// 4. Routes voor Auth en de beruchte exitiframe
app.get('/exitiframe', (req, res) => {
  const shop = req.query.shop;
  const host = req.query.host;
  res.redirect(`https://${shop}/admin/apps/boring-stock-alert?host=${host}`);
});

app.get('/api/auth', shopify.auth.begin());

app.get('/api/auth/callback', shopify.auth.callback(), async (req, res) => {
  try {
    const { shop, accessToken } = res.locals.shopify.session;
    await db.query(
      'INSERT INTO shops (shop_domain, access_token) VALUES ($1, $2) ON CONFLICT (shop_domain) DO UPDATE SET access_token = $2',
      [shop, accessToken]
    );
    const host = req.query.host;
    // Direct naar de admin omgeving sturen
    res.redirect(`https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/boring-stock-alert?host=${host}`);
  } catch (error) {
    res.status(500).send("Fout tijdens installatie.");
  }
});

// 5. Het Dashboard (De pagina die binnen Shopify geladen wordt)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Boring Stock Alert</title>
        <style>body { font-family: sans-serif; text-align: center; padding-top: 50px; }</style>
      </head>
      <body>
        <h1>🚀 Boring Stock Alert is LIVE</h1>
        <p>Als je dit ziet, werkt de verbinding eindelijk.</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server draait op poort ${PORT}`));