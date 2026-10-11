# NEXUS — AI Business Operating Platform

NEXUS is a React dashboard for managing day-to-day business operations from one workspace. It brings together events, customer relationships, registrations, marketing campaigns, billing, and workflow activity in a responsive interface.

The app is built with React and Vite. Supabase provides authentication and private, per-user workspace storage. Optional Supabase Edge Functions connect the workflow planner to OpenAI, subscriptions to Stripe, and campaign email delivery to Resend.

## Features

- **Overview:** See a summary of workspace activity and key metrics.
- **Events and registrations:** Create and manage events, attendees, and registrations.
- **CRM:** Create, find, and update customer and lead records.
- **Marketing:** Draft campaigns, request approval, and review campaign activity.
- **Website builder:** Edit event landing pages, publish public registration links, and collect registrations.
- **AI Command Center:** Get an OpenAI-generated event launch proposal and approve it before saving the event and campaign draft.
- **Subscriptions:** Start Stripe Checkout and manage paid plans in the Stripe billing portal.
- **Authentication and storage:** Sign in with Supabase Auth and save a private workspace when Supabase is configured.
- **Optional campaign delivery:** Send approved campaign emails through a Supabase Edge Function backed by Resend.

The app includes sample/demo records to make the interface easy to explore. Demo contacts are excluded from real campaign delivery.

## Requirements

- Node.js 18 or newer
- npm
- A Supabase project for authentication and cloud workspace storage
- Supabase CLI to deploy the optional OpenAI, Stripe, and Resend Edge Functions
- Optional: OpenAI API access, a Stripe account, and a Resend account for their respective integrations

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

3. Configure Supabase as described below. Sign-in and workspace persistence require Supabase.
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

### 2. Create the workspace table and functions

In your Supabase project's **SQL Editor**, run the SQL in [`supabase/schema.sql`](./supabase/schema.sql). It creates the `workspace_records` table, enables Row Level Security (RLS), and creates the workspace sync and public event registration functions.
If Supabase was already set up for this project, run the updated SQL once to add the public-page RPCs and customer/slug uniqueness indexes.

Do not disable RLS. Workspace records are scoped to the signed-in user's ID.

### 3. Sign in and save workspace data

Create an account or sign in through the app. After the schema is installed, workspace records—including events, customers, registrations, campaigns, billing state, activity, and assistant history—are saved in Supabase for that user. You can inspect them in the Supabase **Table Editor** under `workspace_records`.

## Enable AI workflow proposals

The AI agent can propose one supported workflow: create an event, prepare its registration-page content, and draft a linked campaign. It does not create attendees, publish pages, or send email. Workspace changes are only saved after the user reviews and approves the proposal.

1. Add the OpenAI API key to Supabase Edge Function secrets; never put it in a `VITE_*` variable or browser code:

   ```sh
   supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
   ```

   Optionally set `OPENAI_MODEL` to a model available to your account; the default is `gpt-4o-mini`.
2. Deploy the function:

   ```sh
   supabase functions deploy ai-workflow
   ```

## Enable Stripe subscriptions

Create recurring monthly Stripe Prices that match the plan cards (Growth: USD 49/month, Scale: USD 149/month), then set Edge Function secrets:

```sh
supabase secrets set STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY STRIPE_PRICE_GROWTH=YOUR_GROWTH_PRICE_ID STRIPE_PRICE_SCALE=YOUR_SCALE_PRICE_ID APP_URL=https://your-app.example
```

For local testing, set `APP_URL=http://localhost:5173`. Configure the Stripe Customer Portal to allow subscription changes only between the Growth and Scale Prices above, plus cancellation. Add a Stripe webhook endpoint pointing to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, and `invoice.paid`. Set the webhook signing secret:

```sh
supabase secrets set STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET
supabase functions deploy stripe-billing
supabase functions deploy stripe-webhook
```

The webhook signature is verified before it updates a user's subscription record. The browser only receives Stripe-hosted Checkout or billing-portal URLs; the Stripe secret and price configuration stay in Edge Function secrets.

## Publish an event page

In the signed-in app, open **Website Builder**, edit and save the content, enter a URL slug, and enable public registration. The page is available at `https://your-app.example/events/YOUR_SLUG`. Deploy the Vite single-page app with a history fallback to `index.html` so `/events/...` routes load. The public SQL functions expose only a published event's page details and allow a registration subject to duplicate, date, and capacity checks.

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

4. Deploy the email function:

   ```sh
   supabase functions deploy send-campaign
   ```

5. In the app, create or edit a campaign, request approval, approve it, and choose **Send email**.

The function requires a signed-in user and sends only to non-demo attendees registered for the campaign's linked event. It records delivery activity and blocks a repeat send when the result is uncertain, to reduce accidental duplicates. A successful response means Resend accepted the messages for processing, not that they reached recipients' inboxes. If **Send email** fails, keep the on-page error visible and check that `send-campaign` is deployed to the same Supabase project as the app, the two Resend secrets are set, the sender address belongs to a verified Resend domain, and real non-demo attendee records exist in the linked event. Check the Supabase Edge Function and Resend logs for provider or delivery errors; do not retry when the campaign says **Delivery needs review**.

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
│   ├── main.jsx                   # React application entry point and public-event routing
│   ├── PublicEventPage.jsx        # Public event page and attendee form
│   ├── styles.css                 # Application styles and typography
│   ├── supabase.js                # Supabase client configuration
│   └── workspaceStore.js          # Workspace persistence and email calls
├── supabase/
│   ├── functions/                 # AI, Stripe, and campaign email Edge Functions
│   ├── config.toml                # Webhook JWT configuration
│   └── schema.sql                 # Workspace table, RLS policies, and RPCs
├── .env.example                   # Frontend environment variable template
└── vite.config.js                 # Vite configuration
```

## Troubleshooting

- **Authentication is not configured:** Check that `.env` contains both Supabase frontend variables, then restart `npm run dev`.
- **Workspace saves fail:** Confirm that `supabase/schema.sql` ran successfully and that RLS remains enabled.
- **AI workflows are unavailable:** Confirm `OPENAI_API_KEY` is set as a Supabase Edge Function secret and `ai-workflow` is deployed.
- **Stripe billing is unavailable:** Check the Stripe secret, recurring Price IDs, `APP_URL`, Customer Portal configuration, webhook endpoint, and `stripe-billing` / `stripe-webhook` deployments.
- **A published event page is unavailable:** Confirm the schema functions have been applied, the event is published, and static hosting falls back to `index.html` for `/events/...`.
- **Email delivery fails:** Read the full Marketing page error for the failing step and provider/database message. Confirm the Edge Function is redeployed, its secrets are configured, the sender domain is verified, and the campaign is approved. If the error says messages may have been accepted or the status is **Delivery needs review**, check Supabase and Resend logs before retrying.
- **The page does not load after deployment:** Configure the hosting provider to serve `index.html` for application routes and confirm the Supabase Auth redirect URLs include the deployed URL.

## Notes

- OpenAI, Stripe, Supabase, and Resend are third-party services and require their own accounts, secrets, and configuration.
- The original standalone prototype is retained in the repository; the Vite app starts from `index.html`.
