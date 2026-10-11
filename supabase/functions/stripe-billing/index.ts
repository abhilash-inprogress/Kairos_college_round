import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const stripeRequest = async (path: string, secret: string, body?: URLSearchParams) => {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(body ? { body } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const message = typeof result?.error?.message === "string" ? result.error.message : "Stripe could not complete the billing request.";
    throw new Error(message);
  }
  return result;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Use POST for billing actions." });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/+$/, "");
  if (!authorization) return jsonResponse(401, { error: "Sign in before managing billing." });
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: "Stripe billing is missing Supabase function credentials. Check the deployed Edge Function configuration." });
  }
  if (!stripeSecret) {
    return jsonResponse(500, { error: "Stripe is not connected: STRIPE_SECRET_KEY is missing from Supabase Edge Function secrets." });
  }
  if (!appUrl) {
    return jsonResponse(500, { error: "Billing return URLs are not configured: set APP_URL in Supabase Edge Function secrets." });
  }
  if (!/^https:\/\/[^/]+$/.test(appUrl) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(appUrl)) {
    return jsonResponse(500, { error: "APP_URL must be an HTTPS origin, or localhost for development." });
  }

  try {
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse(401, { error: "Sign in before managing billing." });
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return jsonResponse(401, { error: "Your session is invalid or expired. Please sign in again." });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: settingsRow, error: settingsError } = await admin
      .from("workspace_records")
      .select("data")
      .eq("user_id", user.id)
      .eq("record_type", "settings")
      .eq("record_key", "settings")
      .maybeSingle();
    if (settingsError) throw settingsError;
    const settings = settingsRow?.data || {};
    const requestBody = await request.json().catch(() => null);

    if (requestBody?.action === "checkout") {
      const plan = requestBody.plan;
      const priceId = plan === "Growth"
        ? Deno.env.get("STRIPE_PRICE_GROWTH")
        : plan === "Scale" ? Deno.env.get("STRIPE_PRICE_SCALE") : null;
      if (!priceId) return jsonResponse(400, { error: "Choose a paid plan with a configured Stripe Price ID." });
      const price = await stripeRequest(`prices/${encodeURIComponent(priceId)}`, stripeSecret);
      const expectedAmount = plan === "Growth" ? 4900 : 14900;
      if (!price.active || price.currency !== "usd" || price.unit_amount !== expectedAmount ||
        price.recurring?.interval !== "month") {
        return jsonResponse(500, { error: `The Stripe Price configured for ${plan} must be active and cost USD ${plan === "Growth" ? "49" : "149"} per month.` });
      }

      const form = new URLSearchParams();
      form.set("mode", "subscription");
      form.set("line_items[0][price]", priceId);
      form.set("line_items[0][quantity]", "1");
      form.set("client_reference_id", user.id);
      form.set("success_url", `${appUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`);
      form.set("cancel_url", `${appUrl}/?billing=cancel`);
      form.set("metadata[userId]", user.id);
      form.set("metadata[plan]", plan);
      form.set("subscription_data[metadata][userId]", user.id);
      form.set("subscription_data[metadata][plan]", plan);
      if (typeof settings.stripeCustomerId === "string" && settings.stripeCustomerId) {
        form.set("customer", settings.stripeCustomerId);
      } else if (user.email) {
        form.set("customer_email", user.email);
      }

      const checkout = await stripeRequest("checkout/sessions", stripeSecret, form);
      if (typeof checkout.url !== "string") throw new Error("Stripe did not return a checkout URL.");
      return jsonResponse(200, { url: checkout.url });
    }

    if (requestBody?.action === "portal") {
      if (typeof settings.stripeCustomerId !== "string" || !settings.stripeCustomerId) {
        return jsonResponse(409, { error: "No Stripe customer is linked to this workspace yet." });
      }
      const form = new URLSearchParams({
        customer: settings.stripeCustomerId,
        return_url: `${appUrl}/?billing=portal`,
      });
      const portal = await stripeRequest("billing_portal/sessions", stripeSecret, form);
      if (typeof portal.url !== "string") throw new Error("Stripe did not return a billing portal URL.");
      return jsonResponse(200, { url: portal.url });
    }

    if (requestBody?.action === "sync") {
      if (typeof requestBody.sessionId === "string") {
        const sessionId = requestBody.sessionId.trim();
        if (!/^cs_(?:test|live)_[a-zA-Z0-9]+$/.test(sessionId)) {
          return jsonResponse(400, { error: "The Stripe Checkout session ID is invalid." });
        }
        const session = await stripeRequest(
          `checkout/sessions/${encodeURIComponent(sessionId)}?expand%5B%5D=subscription`,
          stripeSecret,
        );
        if (session.client_reference_id !== user.id || session.metadata?.userId !== user.id) {
          return jsonResponse(403, { error: "This Checkout session does not belong to your workspace." });
        }
        if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) {
          return jsonResponse(409, { error: "Stripe has not completed payment for this Checkout session." });
        }
        let subscription = session.subscription;
        if (typeof subscription === "string") {
          subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscription)}`, stripeSecret);
        }
        if (!subscription || typeof subscription !== "object") {
          return jsonResponse(409, { error: "Stripe has not attached a subscription to this Checkout session yet." });
        }
        const priceId = subscription.items?.data?.[0]?.price?.id || null;
        const plan = priceId === Deno.env.get("STRIPE_PRICE_SCALE") ? "Scale"
          : priceId === Deno.env.get("STRIPE_PRICE_GROWTH") ? "Growth" : null;
        if (!plan) return jsonResponse(409, { error: "This subscription price is not configured for a workspace plan." });
        const status = subscription.status === "trialing" ? "Trial"
          : subscription.status === "active" ? "Active"
            : subscription.status === "past_due" || subscription.status === "unpaid" ? "Past due" : "Pending";
        const next = {
          ...settings,
          plan,
          subscriptionStatus: status,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: subscription.current_period_end || null,
          stripeCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        };
        const { error: updateError } = await admin.from("workspace_records").upsert({
          user_id: user.id,
          record_type: "settings",
          record_key: "settings",
          data: next,
        });
        if (updateError) throw updateError;
        return jsonResponse(200, { plan, subscriptionStatus: status });
      }
      if (typeof settings.stripeCustomerId !== "string" || !settings.stripeCustomerId) {
        return jsonResponse(409, { error: "No Stripe customer is linked to this workspace yet." });
      }
      const customer = encodeURIComponent(settings.stripeCustomerId);
      const subscriptions = await stripeRequest(`subscriptions?customer=${customer}&status=all&limit=100`, stripeSecret);
      const current = subscriptions.data?.find((subscription: { status: string }) =>
        ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(subscription.status)
      );
      if (!current) {
        const latest = subscriptions.data?.[0];
        const next = {
          ...settings,
          plan: "Starter",
          subscriptionStatus: latest?.status === "canceled" ? "Canceled" : "Free",
          stripeSubscriptionId: latest?.id || null,
          stripePriceId: latest?.items?.data?.[0]?.price?.id || null,
          stripeCurrentPeriodEnd: latest?.current_period_end || null,
          stripeCancelAtPeriodEnd: Boolean(latest?.cancel_at_period_end),
        };
        const { error: updateError } = await admin.from("workspace_records").upsert({
          user_id: user.id,
          record_type: "settings",
          record_key: "settings",
          data: next,
        });
        if (updateError) throw updateError;
        return jsonResponse(200, { plan: next.plan, subscriptionStatus: next.subscriptionStatus });
      }

      const priceId = current.items?.data?.[0]?.price?.id || null;
      const plan = priceId === Deno.env.get("STRIPE_PRICE_SCALE") ? "Scale"
        : priceId === Deno.env.get("STRIPE_PRICE_GROWTH") ? "Growth" : "Starter";
      const status = current.status === "trialing" ? "Trial"
        : current.status === "active" ? "Active"
          : current.status === "past_due" || current.status === "unpaid" ? "Past due" : "Pending";
      const next = {
        ...settings,
        plan,
        subscriptionStatus: status,
        stripeCustomerId: settings.stripeCustomerId,
        stripeSubscriptionId: current.id,
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: current.current_period_end || null,
        stripeCancelAtPeriodEnd: Boolean(current.cancel_at_period_end),
      };
      const { error: updateError } = await admin.from("workspace_records").upsert({
        user_id: user.id,
        record_type: "settings",
        record_key: "settings",
        data: next,
      });
      if (updateError) throw updateError;
      return jsonResponse(200, { plan, subscriptionStatus: status });
    }

    return jsonResponse(400, { error: "Unknown billing action." });
  } catch (error) {
    console.error("Stripe billing request failed:", error);
    return jsonResponse(502, { error: error instanceof Error ? error.message : "Stripe billing request failed." });
  }
});
