// Shared connection helper for the Ledgerly scripts. Loads Backend/.env and prints which database
// it is about to use (credentials masked) so you can confirm the target before anything runs.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

const connect = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set in Backend/.env");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const { host, name } = mongoose.connection;
  console.log(`Connected to MongoDB host "${host}", database "${name}"`);
};

const disconnect = () => mongoose.disconnect();

module.exports = { APPLY, connect, disconnect, mongoose };
