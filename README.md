# NEXUS · AI Business Operating Platform

React dashboard served by Vite on Node.js. The original single-file prototype remains in the repository; the React app starts at `index.html`.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

## Configure authentication

Authentication uses Supabase Auth. Copy `.env.example` to `.env` and set:

- `VITE_SUPABASE_URL` to the project URL from Supabase project settings.
- `VITE_SUPABASE_ANON_KEY` to the project's public anon/publishable key.

Restart Vite after changing environment variables. In Supabase Auth settings, configure the site URL and allowed redirect URLs to include the app URL (for local development, `http://localhost:5173`). Email confirmation behavior is controlled by the Supabase project's Authentication settings. Only use the public anon/publishable key in the frontend; never expose a service-role key.

## Connect workspace data

After configuring Supabase, open the project's **SQL Editor**, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it while signed into the Supabase dashboard. It creates a user-private `workspace_records` table, enables Row Level Security, and adds the `sync_workspace_records` function the app uses for atomic saves. Do not disable Row Level Security or put a service-role key in `.env`.

Restart the app with `npm run dev` and sign in. On a user's first visit, the sample workspace is saved to Supabase; later changes to events, customers, registrations, campaigns, landing pages, subscription-demo preferences, workflow activity, and AI demo conversation history are saved to that user's records. The `workspace_records` table is visible in Supabase **Table Editor**. Each row has a `record_type`, `record_key`, and JSON `data`; rows are isolated by authenticated user.

## Enable real campaign email

Campaign delivery uses a Supabase Edge Function so the Resend API key is never sent to the browser.

1. Create a Resend account and API key. Verify a sender domain in Resend; use an address on that domain for `RESEND_FROM_EMAIL`. Resend's unverified test sender can only deliver to the address associated with your Resend account.
2. In Supabase **Edge Functions → Secrets**, add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (for example, `NEXUS <events@your-verified-domain.com>`). Do not put either value in the Vite `.env` file or frontend code.
3. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), run `supabase login`, then from this repository run `supabase link --project-ref YOUR_PROJECT_REF` and `supabase functions deploy send-campaign`. The project ref is the part before `.supabase.co` in your project URL. The function requires a valid Supabase sign-in token.
4. In NEXUS, create or edit a campaign, request approval, approve it, and click **Send email**. Confirm the prompt to send. Messages go only to non-demo attendees registered for that campaign's linked event; the sample/demo contacts are excluded. The campaign and activity record show the delivery result.

Resend and Supabase function logs can be used to check delivery attempts. If a send has an uncertain or partial result, NEXUS marks it **Delivery needs review** and blocks another send to avoid accidental duplicate emails.

## Production build

```sh
npm run build
npm run preview
```

Supabase handles account creation, email/password sign-in, session persistence, and sign-out. Workspace records are stored in Supabase after the database setup above. Campaign email uses Resend after the Edge Function setup above. Subscription changes and AI workflows remain explicitly simulated; the app does not process payments or call a real AI model.