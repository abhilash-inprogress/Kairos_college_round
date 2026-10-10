# NEXUS — AI Business Operating Platform

NEXUS is a React dashboard for managing day-to-day business operations from one workspace. It brings together events, customer relationships, registrations, marketing campaigns, and workflow activity in a responsive interface.

The app is built with React and Vite. Supabase can provide user authentication and private, per-user workspace storage. Campaign email delivery can be enabled separately with a Supabase Edge Function and Resend. AI workflows and subscription changes are demonstrations only; this project does not call a real AI model or process payments.

## Features

- **Overview:** See a summary of workspace activity and key metrics.
- **Events and registrations:** Create and manage events, attendees, and registrations.
- **CRM:** Track customer and lead records.
- **Marketing:** Draft campaigns, request approval, and review campaign activity.
- **Website builder:** Configure event landing-page content.
- **AI Command Center:** Explore a simulated workflow and assistant experience.
- **Subscriptions:** Explore simulated plans and subscription preferences.
- **Authentication and storage:** Sign in with Supabase Auth and save a private workspace when Supabase is configured.
- **Optional campaign delivery:** Send approved campaign emails through a Supabase Edge Function backed by Resend.

The app includes sample/demo records to make the interface easy to explore. Demo contacts are excluded from real campaign delivery.

## Requirements

- Node.js 18 or newer
- npm
- A Supabase project for authentication and cloud workspace storage
- Optional: a Resend account and Supabase CLI for campaign email delivery

## Run locally

1. Clone the repository and open its directory:

   ```sh
   git clone https://github.com/abhilash-inprogress/Kairos_college_round.git
   cd Kairos_college_round
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Configure Supabase as described below.
4. Start the Vite development server:

   ```sh
   npm run dev
   ```

5. Open the local URL printed in the terminal (usually <http://localhost:5173>).

The application uses Supabase Auth to access the workspace. Configure the Supabase environment variables before signing in.

## Configure Supabase

### 1. Set frontend environment variables

Copy `.env.example` to `.env` in the repository root and provide your Supabase project URL and public anon/publishable key:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

Restart the Vite server after changing `.env`. In the Supabase dashboard, configure the Auth site URL and allowed redirect URLs to include your app URL (for local development, `http://localhost:5173`). Email confirmation settings are controlled by the Supabase project.

Only use the project's **public anon/publishable key** in this frontend configuration. Never put a service-role key, Resend API key, or other secret in a `VITE_*` variable or browser code.

### 2. Create the workspace table and sync function

In your Supabase project's **SQL Editor**, run the SQL in [`supabase/schema.sql`](./supabase/schema.sql). It creates the `workspace_records` table, enables Row Level Security (RLS), and creates the `sync_workspace_records` function used for workspace saves.

Do not disable RLS. Workspace records are scoped to the signed-in user's ID.

### 3. Sign in and save workspace data

Create an account or sign in through the app. After the schema is installed, workspace records—including events, customers, registrations, campaigns, settings, activity, and assistant demo history—are saved in Supabase for that user. You can inspect them in the Supabase **Table Editor** under `workspace_records`.

## Optional: enable campaign email

Campaign delivery is disabled until its Supabase Edge Function and Resend secrets are configured.

1. Create a Resend account, generate an API key, and verify a sender domain. Choose a sender address on that verified domain.
2. In Supabase **Edge Functions → Secrets**, set:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (for example, `NEXUS <events@your-verified-domain.com>`)
3. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), authenticate, and link this repository to your Supabase project:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

   `YOUR_PROJECT_REF` is the identifier at the start of your Supabase project URL, before `.supabase.co`.

4. Deploy the function:

   ```sh
   supabase functions deploy send-campaign
   ```

5. In the app, create or edit a campaign, request approval, approve it, and choose **Send email**.

The function requires a signed-in user and sends only to non-demo attendees registered for the campaign's linked event. It records delivery activity and blocks a repeat send when the result is uncertain, to reduce accidental duplicates. Check the Supabase Edge Function and Resend logs when troubleshooting delivery.

Never add Resend secrets to `.env`, frontend source, or other files tracked by Git.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Create a production build in `dist/`. |
| `npm run preview` | Preview the production build locally. |

## Production build

Build and preview the app locally:

```sh
npm run build
npm run preview
```

Deploy the generated `dist/` directory to a static hosting provider. Add the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values to that provider's build-time environment configuration, and add the deployed app URL to the Supabase Auth redirect allow-list.

## Project structure

```text
.
├── index.html                     # Vite HTML entry point
├── src/
│   ├── App.jsx                    # Main dashboard and workspace UI
│   ├── AuthGate.jsx               # Supabase sign-up/sign-in gate
│   ├── main.jsx                   # React application entry point
│   ├── styles.css                 # Application styles and typography
│   ├── supabase.js                # Supabase client configuration
│   └── workspaceStore.js          # Workspace persistence and email calls
├── supabase/
│   ├── functions/send-campaign/   # Optional campaign email Edge Function
│   └── schema.sql                 # Workspace table, RLS policies, and RPC
├── .env.example                   # Frontend environment variable template
└── vite.config.js                 # Vite configuration
```

## Troubleshooting

- **Authentication is not configured:** Check that `.env` contains both Supabase frontend variables, then restart `npm run dev`.
- **Workspace saves fail:** Confirm that `supabase/schema.sql` ran successfully and that RLS remains enabled.
- **Email delivery is unavailable:** Confirm the Edge Function is deployed, its secrets are configured, the sender domain is verified, and the campaign is approved.
- **The page does not load after deployment:** Configure the hosting provider to serve `index.html` for application routes and confirm the Supabase Auth redirect URLs include the deployed URL.

## Notes

- Subscription and AI experiences are simulated; no payments are processed and no live AI model is called.
- Supabase and Resend are third-party services and require their own accounts and configuration.
- The original standalone prototype is retained in the repository; the Vite app starts from `index.html`.
