import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

let database: NeonHttpDatabase | null = null;

export function getDb(): NeonHttpDatabase {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  database = drizzle(neon(connectionString));
  return database;
}
