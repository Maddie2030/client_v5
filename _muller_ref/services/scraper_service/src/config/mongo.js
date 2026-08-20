import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongodb:27017/mr_scraper";

let isConnected = false;

export async function connectMongo() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to ${MONGO_URI}`);
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err.message);
    throw err;
  }
}

export async function closeMongo() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  console.log("[MongoDB] Disconnected");
}
