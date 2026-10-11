import { createClient } from "npm:@supabase/supabase-js@2";

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function validStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const values = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestamp = values.find(([key]) => key === "t")?.[1];
  const signatures = values.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  ));
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    let mismatch = 0;
    for (let index = 0; index < expected.length; index += 1) {
      mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    }
    return mismatch === 0;
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "Use POST for Stripe webhooks." });
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !stripeSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Stripe webhook is not configured." });
  }

  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature") || "";
  if (!await validStripeSignature(payload, signature, webhookSecret)) {
    return jsonResponse(400, { error: "Invalid or expired Stripe signature." });
  }

  try {
    const event = JSON.parse(payload);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let subscription = null;
    let userId: string | null = null;
    let customerId: string | null = null;
    let fallbackPlan: string | null = null;
    let forcedStatus: string | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      userId = session.metadata?.userId || session.client_reference_id || null;
      customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
      fallbackPlan = session.metadata?.plan || null;
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription : session.subscription?.id;
      if (subscriptionId) {
        const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          headers: { Authorization: `Bearer ${stripeSecret}` },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message || "Could not retrieve the Stripe subscription.");
        subscription = result;
      } else {
        forcedStatus = "Pending";
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      subscription = event.data.object;
      userId = subscription.metadata?.userId || null;
      customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
    } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const linkedSubscription = invoice.subscription || invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof linkedSubscription === "string" ? linkedSubscription : linkedSubscription?.id;
      customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
      if (subscriptionId) {
        const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          headers: { Authorization: `Bearer ${stripeSecret}` },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message || "Could not retrieve the Stripe subscription.");
        subscription = result;
        userId = subscription.metadata?.userId || null;
      }
      if (event.type === "invoice.payment_failed") forcedStatus = "Past due";
    } else {
      return jsonResponse(200, { received: true });
    }

    if ((!userId || !/^[0-9a-f-]{36}$/i.test(userId)) && customerId) {
      const { data: ownerRow, error: ownerError } = await admin
        .from("workspace_records")
        .select("user_id")
        .eq("record_type", "settings")
        .filter("data->>stripeCustomerId", "eq", customerId)
        .maybeSingle();
      if (ownerError) throw ownerError;
      userId = ownerRow?.user_id || null;
    }
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      console.error("Stripe event is missing valid workspace metadata:", event.id);
      return jsonResponse(400, { error: "Stripe event is not linked to a valid workspace." });
    }
    const { data: settingsRow, error: settingsError } = await admin
      .from("workspace_records")
      .select("data")
      .eq("user_id", userId)
      .eq("record_type", "settings")
      .eq("record_key", "settings")
      .maybeSingle();
    if (settingsError) throw settingsError;
    const settings = settingsRow?.data || {};
    if (typeof settings.stripeLastEventCreated === "number" &&
      typeof event.created === "number" && settings.stripeLastEventCreated > event.created) {
      return jsonResponse(200, { received: true, ignored: "stale_event" });
    }
    const priceId = subscription?.items?.data?.[0]?.price?.id || null;
    const status = forcedStatus || (subscription?.status === "trialing" ? "Trial"
      : subscription?.status === "active" ? "Active"
        : subscription?.status === "past_due" || subscription?.status === "unpaid" ? "Past due"
          : subscription?.status === "canceled" ? "Canceled" : "Pending");
    const plan = fallbackPlan || (priceId === Deno.env.get("STRIPE_PRICE_SCALE") ? "Scale"
      : priceId === Deno.env.get("STRIPE_PRICE_GROWTH") ? "Growth" : settings.plan || "Starter");
    const updatedSettings = {
      ...settings,
      plan: status === "Canceled" ? "Starter" : plan,
      subscriptionStatus: status,
      stripeCustomerId: customerId || settings.stripeCustomerId || null,
      stripeSubscriptionId: subscription?.id || settings.stripeSubscriptionId || null,
      stripePriceId: priceId || settings.stripePriceId || null,
      stripeCurrentPeriodEnd: subscription?.current_period_end || settings.stripeCurrentPeriodEnd || null,
      stripeCancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end || false),
      stripeLastEventCreated: event.created,
    };
    const { error: saveError } = await admin.from("workspace_records").upsert({
      user_id: userId,
      record_type: "settings",
      record_key: "settings",
      data: updatedSettings,
    });
    if (saveError) throw saveError;
    return jsonResponse(200, { received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return jsonResponse(500, { error: "Stripe webhook processing failed." });
  }
});
