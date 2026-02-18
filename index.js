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
// Dit zorgt ervoor dat de tabel 'shops' altijd bestaat zonder dat je een shell nodig hebt.
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

// FIX: Deze specifieke route vangt de "Cannot GET /exitiframe" fout op
app.get('/exitiframe', (req, res) => {
  const shop = req.query.shop;
  const destination = req.query.redirectUri || `https://${shop}/admin/apps/boring-stock-alert`;
  res.redirect(destination);
});

// Start van de Shopify installatie
app.get(shopify.config.auth.path, shopify.auth.begin());

// Callback na goedkeuring door de gebruiker
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res) => {
    try {
      const { shop, accessToken } = res.locals.shopify.session;
      
      // Sla de winkelgegevens op in de database
      await db.query(
        'INSERT INTO shops (shop_domain, access_token) VALUES ($1, $2) ON CONFLICT (shop_domain) DO UPDATE SET access_token = $2',
        [shop, accessToken]
      );

      // Stuur de gebruiker direct naar de juiste plek in de Shopify Admin
      const host = req.query.host;
      res.redirect(`https://${shop}/admin/apps/boring-stock-alert?host=${host}`);
      
    } catch (error) {
      console.error("❌ Installatie fout:", error);
      res.status(500).send("Er is een fout opgetreden tijdens de installatie.");
    }
  }
);

// Health check voor Render monitoring
app.get('/health', (req, res) => res.status(200).send('Boringly Healthy!'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Boring Stock Alert draait op poort ${PORT}`));