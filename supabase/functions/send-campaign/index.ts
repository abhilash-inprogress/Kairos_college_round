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

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const renderText = (template: string, name: string, event: string) =>
  template.replace(/{{\s*name\s*}}/gi, name).replace(/{{\s*event\s*}}/gi, event);

const renderHtml = (template: string, name: string, event: string) =>
  escapeHtml(renderText(template, name, event)).replace(/\r?\n/g, "<br>");

const demoEmails = new Set([
  "ishaan@cloudnine.io",
  "tara@helixworks.com",
  "neil@harborlane.co",
]);

type Customer = {
  id: string;
  email: string;
  name?: string;
  isDemo?: boolean;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Use POST to send a campaign." });

  const authorization = request.headers.get("Authorization");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!authorization) return jsonResponse(401, { error: "Sign in before sending a campaign." });
  if (!resendApiKey || !from || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: "Email delivery is not configured. Set the Resend API key and verified sender in Supabase Edge Function secrets." });
  }

  let recoveryClient: ReturnType<typeof createClient> | null = null;
  let deliveryClaim: { userId: string; campaignId: string; attemptId: string; outcomeUnknown: boolean } | null = null;
  let claimedCampaignData: Record<string, unknown> | null = null;
  let sent = 0;
  let totalRecipients = 0;
  let stage = "validating the campaign";
  try {
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse(401, { error: "Sign in before sending a campaign." });
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return jsonResponse(401, { error: "Your session is invalid or expired. Please sign in again." });

    const requestBody = await request.json().catch(() => null);
    const campaignId = typeof requestBody?.campaignId === "string" ? requestBody.campaignId.trim() : "";
    if (!campaignId || campaignId.length > 200) return jsonResponse(400, { error: "A valid campaign ID is required." });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    recoveryClient = admin;
    stage = "loading the campaign";
    const { data: campaignRow, error: campaignError } = await admin
      .from("workspace_records")
      .select("data")
      .eq("user_id", user.id)
      .eq("record_type", "campaign")
      .eq("record_key", campaignId)
      .maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaignRow) return jsonResponse(404, { error: "Campaign not found in your workspace." });

    const campaign = campaignRow.data;
    if (campaign.status !== "Ready") return jsonResponse(409, { error: "Approve this campaign before sending it. Campaigns can only be sent once they are Ready." });

    stage = "loading the linked event";
    const { data: eventRow, error: eventError } = await admin
      .from("workspace_records")
      .select("data")
      .eq("user_id", user.id)
      .eq("record_type", "event")
      .eq("record_key", campaign.eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!eventRow) return jsonResponse(400, { error: "The campaign's linked event could not be found." });

    stage = "loading event registrations";
    const { data: registrations, error: registrationError } = await admin
      .from("workspace_records")
      .select("data")
      .eq("user_id", user.id)
      .eq("record_type", "registration")
      .filter("data->>eventId", "eq", campaign.eventId);
    if (registrationError) throw registrationError;

    const eventRegistrations = (registrations || [])
      .map((row) => row.data)
      .filter((registration) =>
        registration.eventId === campaign.eventId &&
        registration.isDemo !== true &&
        !/^REG-90[0-8]$/.test(String(registration.id))
      );
    const customerIds = [...new Set(eventRegistrations.map((registration) => registration.customerId).filter(Boolean))];
    if (!customerIds.length) return jsonResponse(400, { error: "There are no non-demo attendees registered for this event yet." });

    stage = "loading attendee contacts";
    const { data: customerRows, error: customerError } = await admin
      .from("workspace_records")
      .select("data")
      .eq("user_id", user.id)
      .eq("record_type", "customer")
      .in("record_key", customerIds);
    if (customerError) throw customerError;

    const customers = new Map<string, Customer>(
      (customerRows || []).map((row) => [row.data.id, row.data as Customer] as [string, Customer]),
    );
    const recipientByEmail = new Map<string, Customer>();
    for (const registration of eventRegistrations) {
      const customer = customers.get(registration.customerId);
      if (!customer || customer.isDemo === true || typeof customer.email !== "string") continue;
      const email = customer.email.trim().toLowerCase();
      if (!demoEmails.has(email)) recipientByEmail.set(email, { ...customer, email });
    }
    const recipients = [...recipientByEmail.values()];
    if (!recipients.length) return jsonResponse(400, { error: "No eligible attendee email addresses were found for this event." });
    if (recipients.some((customer) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) {
      return jsonResponse(400, { error: "At least one attendee has an invalid email address. Correct the contact record before sending." });
    }
    totalRecipients = recipients.length;

    stage = "claiming the campaign for delivery";
    const attemptId = crypto.randomUUID();
    const sendingCampaign = { ...campaign, status: "Sending", sendAttemptId: attemptId };
    const { data: claimedRows, error: claimError } = await admin
      .from("workspace_records")
      .update({ data: sendingCampaign, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("record_type", "campaign")
      .eq("record_key", campaignId)
      .filter("data->>status", "eq", "Ready")
      .select("record_key");
    if (claimError) throw claimError;
    if (!claimedRows?.length) return jsonResponse(409, { error: "This campaign is already being sent or has already been sent." });
    deliveryClaim = { userId: user.id, campaignId, attemptId, outcomeUnknown: false };
    claimedCampaignData = sendingCampaign;

    let lastProviderError = "";
    for (let offset = 0; offset < recipients.length; offset += 100) {
      const batch = recipients.slice(offset, offset + 100).map((customer) => ({
        from,
        to: [customer.email],
        subject: renderText(String(campaign.subject || ""), customer.name || "there", eventRow.data.title),
        text: renderText(String(campaign.body || ""), customer.name || "there", eventRow.data.title),
        html: renderHtml(String(campaign.body || ""), customer.name || "there", eventRow.data.title),
      }));
      try {
        stage = `sending batch ${Math.floor(offset / 100) + 1} through Resend`;
        const response = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `nexus-${campaignId}-${attemptId}-${Math.floor(offset / 100)}`,
          },
          body: JSON.stringify(batch),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastProviderError = typeof result.message === "string" ? result.message : `Resend returned HTTP ${response.status}.`;
          if (response.status >= 500) deliveryClaim.outcomeUnknown = true;
          break;
        }
        if (!Array.isArray(result.data)) {
          lastProviderError = "Resend returned an unexpected response. Check Resend logs before retrying.";
          deliveryClaim.outcomeUnknown = true;
          break;
        }
        const accepted = result.data.length;
        sent += Math.min(accepted, batch.length);
        if (accepted < batch.length) {
          lastProviderError = "Resend accepted fewer emails than requested.";
          deliveryClaim.outcomeUnknown = true;
          break;
        }
      } catch {
        lastProviderError = "Could not reach the Resend email service.";
        deliveryClaim.outcomeUnknown = true;
        break;
      }
    }

    const failed = recipients.length - sent;
    const status = sent === recipients.length
      ? "Sent"
      : sent > 0 || deliveryClaim.outcomeUnknown
      ? "Delivery needs review"
      : "Ready";
    const completedAt = new Date().toISOString();
    const finalCampaign = {
      ...sendingCampaign,
      status,
      deliverySummary: { sent, failed, completedAt, error: lastProviderError || undefined },
    };
    stage = "saving the delivery result";
    const { data: updatedRows, error: updateError } = await admin
      .from("workspace_records")
      .update({ data: finalCampaign, updated_at: completedAt })
      .eq("user_id", user.id)
      .eq("record_type", "campaign")
      .eq("record_key", campaignId)
      .eq("data->>sendAttemptId", attemptId)
      .select("record_key");
    if (updateError) throw updateError;
    if (!updatedRows?.length) throw new Error("The campaign delivery claim changed before its final status could be saved.");

    const activityId = crypto.randomUUID();
    const activity = {
      id: activityId,
      type: "Campaign",
      message: status === "Sent"
        ? `Campaign sent to ${sent} attendee${sent === 1 ? "" : "s"}: ${campaign.name}`
        : status === "Delivery needs review"
        ? `Campaign delivery needs review (${sent} confirmed sent, ${failed} unconfirmed): ${campaign.name}`
        : `Campaign delivery failed: ${campaign.name}`,
      status: status === "Sent" ? "Success" : status === "Ready" ? "Error" : "Warning",
      createdAt: Date.now(),
    };
    const { error: activityError } = await admin
      .from("workspace_records")
      .upsert({
        user_id: user.id,
        record_type: "activity",
        record_key: activityId,
        data: activity,
        updated_at: completedAt,
      });
    if (activityError) {
      console.error("Campaign delivery succeeded but its activity record could not be saved:", activityError.message);
      return jsonResponse(200, {
        status,
        sent,
        failed,
        error: lastProviderError || undefined,
        warning: "Delivery status was saved, but the activity log could not be updated. Check Supabase logs.",
      });
    }

    return jsonResponse(200, {
      status,
      sent,
      failed,
      error: lastProviderError || undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`send-campaign failed while ${stage}:`, errorMessage);
    if (deliveryClaim && recoveryClient) {
      const status = totalRecipients > 0 && sent === totalRecipients
        ? "Sent"
        : sent > 0 || deliveryClaim.outcomeUnknown ? "Delivery needs review" : "Ready";
      const completedAt = new Date().toISOString();
      const { error: recoveryError } = await recoveryClient
        .from("workspace_records")
        .update({
          data: {
            ...claimedCampaignData,
            status,
            deliverySummary: { sent, failed: null, completedAt, error: "Delivery finalization failed; review provider and function logs before retrying." },
          },
          updated_at: completedAt,
        })
        .eq("user_id", deliveryClaim.userId)
        .eq("record_type", "campaign")
        .eq("record_key", deliveryClaim.campaignId)
        .eq("data->>sendAttemptId", deliveryClaim.attemptId);
      if (recoveryError) console.error("Could not recover campaign status:", recoveryError.message);
    }
    return jsonResponse(500, {
      error: `Campaign delivery failed while ${stage}. ${errorMessage}.`,
      ...(deliveryClaim && (sent > 0 || deliveryClaim.outcomeUnknown)
        ? { warning: "Some messages may have been accepted. Check the campaign status and Resend logs before retrying." }
        : {}),
    });
  }
});
