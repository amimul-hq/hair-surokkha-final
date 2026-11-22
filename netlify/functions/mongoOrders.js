import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';

dotenv.config();

let isConnecting = false;

/**
 * Connect to MongoDB for orders collection mirroring
 * Reuses existing connection across warm serverless invocations
 */
export async function connectMongoOrders() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return null;
  }

  try {
    if (!isConnecting) {
      isConnecting = true;
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000
      });
      isConnecting = false;
    }
    return mongoose.connection;
  } catch (err) {
    isConnecting = false;
    console.warn('[MongoDB Orders] Connection failed:', err.message);
    return null;
  }
}

/**
 * Safely send an order to the MongoDB collection.
 * Non-blocking & fault-tolerant: will never crash the checkout flow if MongoDB is unreachable.
 */
export async function sendOrderToMongoDB(orderDoc) {
  if (!orderDoc || !orderDoc.orderId) return null;

  try {
    const conn = await connectMongoOrders();
    if (!conn) {
      console.warn(`[MongoDB Orders] Order #${orderDoc.orderId} not sent: MongoDB connection unavailable.`);
      return null;
    }

    const payload = JSON.parse(JSON.stringify(orderDoc));
    // Let MongoDB generate its native ObjectId so it doesn't conflict with local string _id
    delete payload._id;

    const saved = await Order.findOneAndUpdate(
      { orderId: orderDoc.orderId },
      payload,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    console.log(`🚀 [MongoDB Orders] Order #${orderDoc.orderId} successfully synced to MongoDB collection "${Order.collection.name}"`);
    return saved;
  } catch (err) {
    console.error(`❌ [MongoDB Orders] Failed to save order #${orderDoc?.orderId} to MongoDB:`, err.message);
    return null;
  }
}

/**
 * Utility to backfill/sync all local orders to MongoDB
 */
export async function syncAllLocalOrdersToMongoDB(ordersList = []) {
  if (!Array.isArray(ordersList) || ordersList.length === 0) return 0;
  let count = 0;
  for (const order of ordersList) {
    const res = await sendOrderToMongoDB(order);
    if (res) count++;
  }
  return count;
}
