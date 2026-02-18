const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { LATEST_API_VERSION } = require('@shopify/shopify-api');
const { Pool } = require('pg');
const Redis = require('ioredis');

const app = express();

// 1. Verbinding met de database en Redis via Render variabelen
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

// --- AUTOMATISCHE DATABASE TABEL CREATIE ---
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

// 2. De Shopify motor configureren
const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES.split(','),
    hostName: process.env.HOST.replace(/https?:\/\//, ''), // Veiligheidscheck: verwijdert eventuele https:// uit de HOST variabele
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
});

// 3. De endpoints instellen

// FIX: Deze vangt de /exitiframe error op
app.get('/exitiframe', (req, res) => {
  const shop = req.query.shop;
  const host = req.query.host;
  // We sturen de gebruiker terug naar de App interface in Shopify
  res.redirect(`https://${shop}/admin/apps/boring-stock-alert?host=${host}`);
});

// Start auth
app.get(shopify.config.auth.path, shopify.auth.begin());

// Callback na installatie
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res) => {
    try {
      const { shop, accessToken } = res.locals.shopify.session;
      
      await db.query(
        'INSERT INTO shops (shop_domain, access_token) VALUES ($1, $2) ON CONFLICT (shop_domain) DO UPDATE SET access_token = $2',
        [shop, accessToken]
      );

      const host = req.query.host;
      // BELANGRIJK: We bouwen de URL hier handmatig op om dubbele 'https' te voorkomen
      const cleanShop = shop.replace(/https?:\/\//, '');
      res.redirect(`https://${cleanShop}/admin/apps/boring-stock-alert?host=${host}`);
      
    } catch (error) {
      console.error("❌ Installatie fout:", error);
      res.status(500).send("Installatie mislukt.");
    }
  }
);

// Eenvoudige startpagina om te zien dat de app leeft
app.get('/', (req, res) => {
  res.send('<h1>Boring Stock Alert is Online!</h1><p>De app is succesvol gekoppeld aan Shopify.</p>');
});

app.get('/health', (req, res) => res.status(200).send('Boringly Healthy!'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Online op poort ${PORT}`));