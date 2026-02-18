const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { LATEST_API_VERSION } = require('@shopify/shopify-api');
const { Pool } = require('pg');

const app = express();

// 1. Database verbinding
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Automatische tabel creatie
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

// 3. Middleware voor Security Headers (DIT IS DE FIX VOOR DE GEWEIGERDE VERBINDING)
app.use((req, res, next) => {
  const shop = req.query.shop;
  if (shop) {
    res.setHeader("Content-Security-Policy", `frame-ancestors https://${shop} https://admin.shopify.com;`);
  }
  next();
});

// 4. Routes
app.get('/exitiframe', (req, res) => {
  const shop = req.query.shop;
  res.redirect(`https://${shop}/admin/apps/boring-stock-alert`);
});

app.get(shopify.config.auth.path, shopify.auth.begin());

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
      res.redirect(`https://${shop.replace(/https?:\/\//, '')}/admin/apps/boring-stock-alert?host=${host}`);
    } catch (error) {
      res.status(500).send("Installatie mislukt.");
    }
  }
);

// Het dashboard dat in Shopify verschijnt
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://unpkg.com/@shopify/app-bridge"></script>
        <script>
          var AppBridge = window['app-bridge'];
          var createApp = AppBridge.default;
          var app = createApp({
            apiKey: "${process.env.SHOPIFY_API_KEY}",
            host: "${new URLSearchParams(window.location.search).get('host')}",
          });
        </script>
      </head>
      <body>
        <h1>🚀 Boring Stock Alert Dashboard</h1>
        <p>De verbinding is eindelijk gelukt!</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server op poort ${PORT}`));