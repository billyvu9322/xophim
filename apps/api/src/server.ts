import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
    app.log.info(`XoPhim API listening on :${env.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
