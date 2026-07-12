# ChatLink WhatsApp Generator

Create WhatsApp Click-to-Chat links, print-friendly QR codes, and self-hosted short QR redirects.

## Run locally

1. Install dependencies: `pnpm install`
2. Generate the Prisma client: `pnpm db:generate`
3. Create the SQLite database: `pnpm db:push`
4. Start the app: `pnpm start`

Open `http://localhost:3000`.

## Hosting

When hosted, QR codes automatically use the current public domain in the format `/chatlink/<code>`. This compact QR redirects to the WhatsApp link and can be scanned by any phone.

On `localhost`, a phone cannot open a `localhost` redirect because it refers to the phone itself. The app therefore encodes the direct `wa.me` URL locally. Deploy the app on a public HTTPS domain before printing or sharing QR codes; the app will then generate the compact redirect QR automatically.

## GitHub Pages

Pushing to the `main` branch deploys the static generator to GitHub Pages. It creates WhatsApp links and direct QR codes in the browser, but does not save history or provide compact redirect QR codes because GitHub Pages cannot run the Node.js server.
