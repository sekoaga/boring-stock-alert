const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { LATEST_API_VERSION } = require('@shopify/shopify-api');
const { Pool } = require('pg');

const app = express();

// 1. Database verbinding
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Automatische tabel creatie bij opstarten
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

// 3. FORCEER SECURITY HEADERS (De oplossing voor 'verbinding geweigerd')
app.use((req, res, next) => {
  const shop = req.query.shop || req.headers['x-shop-id'];
  res.setHeader("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
  next();
});

// 4. Routes
app.get('/api/auth', shopify.auth.begin());

app.get('/api/auth/callback', shopify.auth.callback(), async (req, res) => {
  const { shop, accessToken } = res.locals.shopify.session;
  await db.query(
    'INSERT INTO shops (shop_domain, access_token) VALUES ($1, $2) ON CONFLICT (shop_domain) DO UPDATE SET access_token = $2',
    [shop, accessToken]
  );
  
  // Na installatie: stuur door naar de embedded app link
  const host = req.query.host;
  res.redirect(`https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/boring-stock-alert?host=${host}`);
});

// De pagina die daadwerkelijk in Shopify verschijnt
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Boring Stock Alert</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h1>🚀 Boring Stock Alert Dashboard</h1>
        <p>De verbinding is gelukt! De app draait nu binnen Shopify.</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server draait op poort ${PORT}`));