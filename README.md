# Thali

A meal tracker: tell it what you ate (text or a photo), it estimates calories and
protein, tracks it against a daily limit, and charts your week. The limit can be set
manually or worked out from your current weight, target weight, and timeframe.

This is a plain Node/Express app plus a static frontend, so it deploys the same way
on **Render** or **Vercel**. It calls an LLM through **OpenRouter**, and your OpenRouter
API key stays server-side the whole time — it's never sent to the browser.

## How it's structured

```
thali/
  server.js            Express server — serves the frontend + /api/estimate (Render, or any Node host)
  api/estimate.js       Same endpoint, packaged as a Vercel serverless function
  estimate-logic.js      Shared logic both of the above call into — talks to OpenRouter
  public/
    index.html           Frontend markup
    styles.css            Frontend styles
    app.js                 Frontend logic (localStorage for your meal log + settings)
  package.json
  vercel.json             Routes for Vercel
  .env.example
```

Your meal log and daily limit are saved in the browser via `localStorage` — private to
whichever browser/device you're using, no database needed. The backend's only job is to
hold your OpenRouter API key and call the model on your behalf so the key never reaches
the browser.

## 1. Get an OpenRouter API key

Create one at [openrouter.ai/keys](https://openrouter.ai/keys). Add some credit — model
usage is billed per token through OpenRouter regardless of which underlying model you pick.

**Pick a vision-capable model**, since photo meals need the model to actually see the
image. Good options, from cheapest to most capable:
- `openai/gpt-4o-mini` (default — cheap, solid at reading food photos)
- `google/gemini-2.0-flash-001` (also cheap, fast)
- `anthropic/claude-3.5-sonnet` (pricier, most accurate on ambiguous or mixed plates)

Browse the full list and live pricing at [openrouter.ai/models](https://openrouter.ai/models)
— filter by "image input" to see all vision-capable options.

## 2. Run it locally (optional, to test first)

```bash
npm install
cp .env.example .env
# edit .env and paste in your OPENROUTER_API_KEY
npm start
```

Open `http://localhost:3000`.

## 3. Deploy on Render

1. Push this folder to a GitHub repo.
2. In Render, click **New → Web Service**, connect the repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** Node
4. Under **Environment Variables**, add:
   - `OPENROUTER_API_KEY` = your key
   - `OPENROUTER_MODEL` = e.g. `openai/gpt-4o-mini` (optional — this is the default)
5. Deploy. Render gives you a `https://your-app.onrender.com` URL — that's the whole app.

Render's free tier spins down when idle and takes a few seconds to wake back up on the
next request — normal for free hosting, not a bug.

## 4. Deploy on Vercel

1. Push this folder to a GitHub repo.
2. In Vercel, click **Add New → Project**, import the repo. `vercel.json` in this
   project tells Vercel how to route `/api/estimate` and the static frontend, so no
   extra configuration is needed.
3. Under **Settings → Environment Variables**, add:
   - `OPENROUTER_API_KEY` = your key
   - `OPENROUTER_MODEL` = e.g. `openai/gpt-4o-mini` (optional)
4. Deploy.

Note: Vercel serverless functions cap request bodies around 4.5MB. The app already
resizes photos client-side before sending them, so this shouldn't come up in practice —
but if you ever see an error on photo uploads, that's the likely cause.

## Notes

- **Model choice matters for photo accuracy.** Not every OpenRouter model handles
  images — stick to the vision-capable ones listed above. If you set `OPENROUTER_MODEL`
  to a text-only model, photo logging will fail (text logging will still work fine).
- **Multiple people using the same deployment:** right now everyone shares the same
  OpenRouter API key (billed to you) but each person's meal log stays private to their
  own browser, since it's stored client-side. There's no login system — anyone with the
  URL can use it.
- **Accuracy:** estimates are a solid ballpark from a language model reading a
  description or photo, not a lab measurement. Good for tracking trends, not precise
  enough for medical or clinical use.
