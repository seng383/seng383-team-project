require('dotenv').config();
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const port = process.env.PORT || 3001;
const db = openDatabase();

createApp(db).listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
