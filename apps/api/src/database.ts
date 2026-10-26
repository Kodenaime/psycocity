import { createConnection } from "mongoose";

export function createDatabase(uri: string) {
  const connection = createConnection();
  // Runtime errors are surfaced through readiness and safe startup diagnostics,
  // never by printing a driver error that could contain credentials.
  connection.on("error", () => { /* Readiness probes fail closed. */ });

  async function isReady(): Promise<boolean> {
    if (connection.readyState !== 1 || !connection.db) return false;
    try {
      const hello = await connection.db.admin().command({ hello: 1 }, { timeoutMS: 1500 });
      return Boolean(hello.setName && hello.isWritablePrimary && hello.logicalSessionTimeoutMinutes != null);
    } catch {
      return false;
    }
  }

  async function connect() {
    try {
      if (connection.readyState === 0) {
        await connection.openUri(uri, {
          serverSelectionTimeoutMS: 2000,
          connectTimeoutMS: 2000,
          socketTimeoutMS: 3000,
          maxPoolSize: 10,
          autoIndex: false,
          bufferCommands: false,
        });
      }
      if (!(await isReady())) throw new Error("Unsupported database topology");
    } catch {
      await connection.close().catch(() => { /* Preserve the safe primary error. */ });
      throw new Error("MongoDB unavailable or not a writable replica set");
    }
  }

  return { connection, connect, isReady, close: () => connection.close() };
}
