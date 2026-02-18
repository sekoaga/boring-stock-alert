const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { LATEST_API_VERSION } = require('@shopify/shopify-api');
const { Pool } = require('pg');
const Redis = require('ioredis');

const app = express();

// 1. Verbinding met de database en Redis via de Render variabelen
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

// --- AUTOMATISCHE DATABASE TABEL CREATIE ---
// Dit zorgt ervoor dat je geen handmatige 'Shell' of 'Connect' nodig hebt
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
    console.log("✅ Database tabel 'shops' is gecontroleerd/aangemaakt.");
  } catch (err) {
    console.error("❌ Fout bij aanmaken database tabel:", err);
  }
};
initDb();
// --------------------------------------------

// 2. De Shopify motor configureren
const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES.split(','),
    hostName: process.env.HOST,
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
});

// 3. De endpoints instellen
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res) => {
    try {
      // Hier slaan we de shop op in de database na installatie
      const { shop, accessToken } = res.locals.shopify.session;
      await db.query(
        'INSERT INTO shops (shop_domain, access_token) VALUES ($1, $2) ON CONFLICT (shop_domain) DO UPDATE SET access_token = $2',
        [shop, accessToken]
      );
      shopify.redirectToEmbeddedAppPortal(req, res);
    } catch (error) {
      console.error("❌ Fout tijdens opslaan shop data:", error);
      res.status(500).send("Er is een fout opgetreden bij het installeren van de app.");
    }
  }
);

// Health check voor Render
app.get('/health', (req, res) => res.status(200).send('Boringly Healthy!'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Boring Stock Alert draait op poort ${PORT}`));