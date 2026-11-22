import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../netlify/functions/models/Order.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function backfillOrdersToMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found in environment.');
    process.exit(1);
  }

  const dataPath = path.resolve(__dirname, '..', 'netlify', 'functions', 'data', 'website-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`File not found: ${dataPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, 'utf8');
  const parsed = JSON.parse(raw);
  const orders = parsed.orders || [];

  console.log(`Found ${orders.length} local orders in website-data.json.`);
  console.log(`Connecting to MongoDB (${uri.split('@')[1]})...`);

  await mongoose.connect(uri);
  console.log(`✅ Connected to DB: "${mongoose.connection.name}"`);

  let synced = 0;
  for (const o of orders) {
    if (!o.orderId) continue;
    const clean = JSON.parse(JSON.stringify(o));
    delete clean._id;

    await Order.findOneAndUpdate(
      { orderId: o.orderId },
      clean,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    synced++;
    process.stdout.write(`Synced ${synced}/${orders.length} (${o.orderId})\r`);
  }

  console.log(`\n🎉 Successfully synced ${synced} orders to MongoDB collection "${Order.collection.name}"!`);
  const total = await Order.countDocuments();
  console.log(`Total orders in MongoDB: ${total}`);

  await mongoose.disconnect();
}

backfillOrdersToMongo().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

