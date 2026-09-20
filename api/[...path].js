// Vercel serverless entry point. Local development still uses `node server.js`.
//
// Vercel serves public/ straight from its CDN, so this function only ever handles /api/*.
// The assistant is built once per warm instance, not once per request.
import { createApp } from "../server.js";

const app = createApp();

export default async function handler(req, res) {
  const { handler: route } = await app;
  return route(req, res);
}
