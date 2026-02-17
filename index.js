const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: 'Boring Stock Alert' });
});

app.get('/api/auth', (req, res) => {
  res.send('OAuth endpoint - Shopify auth starts here');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Boring Stock Alert running on port ${PORT}`);
});
