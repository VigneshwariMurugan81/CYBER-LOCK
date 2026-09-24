// CYBER-LOCK admin sync backend.
// GET  -> returns every team's stored progress as { TEAMKEY: {...session}, ... }
// POST -> upserts one team's progress, or deletes it when { action: "reset" } is sent.
//
// Uses Netlify Blobs, which needs no database setup — Netlify provisions the
// store automatically the first time this function runs on your deployed site.

import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("cyberlock-teams");

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const all = {};
    await Promise.all(
      blobs.map(async (b) => {
        try {
          const val = await store.get(b.key, { type: "json" });
          if (val) all[b.key] = val;
        } catch (e) {
          // skip unreadable entries rather than failing the whole request
        }
      })
    );
    return new Response(JSON.stringify(all), {
      headers: { "content-type": "application/json" },
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (!body || !body.key) {
      return new Response(JSON.stringify({ error: "Missing key" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (body.action === "reset") {
      await store.delete(body.key);
    } else {
      await store.setJSON(body.key, body.data ?? {});
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "content-type": "application/json" },
  });
};

export const config = { path: "/.netlify/functions/sync" };

