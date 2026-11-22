import 'dotenv/config';
import { localJsonStore } from '../netlify/functions/db.js';

// The store imports the bundled document only when the database is empty.
const data = await localJsonStore.getWebsiteData();
console.log(`Shared database ready: ${data.products.length} products, ${data.categories.length} categories.`);
