import { supabase } from "./supabase.js";

const collectionTypes = [
  ["events", "event"],
  ["customers", "customer"],
  ["registrations", "registration"],
  ["campaigns", "campaign"],
  ["activity", "activity"],
];

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function toOperations(previousState, nextState, previousChat = [], nextChat = []) {
  const operations = [];

  for (const [property, recordType] of collectionTypes) {
    const previousRecords = new Map((previousState?.[property] || []).map((record) => [record.id, record]));
    const nextRecords = new Map((nextState[property] || []).map((record) => [record.id, record]));

    for (const [recordKey, data] of nextRecords) {
      if (JSON.stringify(previousRecords.get(recordKey)) !== JSON.stringify(data)) {
        operations.push({ operation: "upsert", record_type: recordType, record_key: recordKey, data });
      }
    }
    for (const recordKey of previousRecords.keys()) {
      if (!nextRecords.has(recordKey)) operations.push({ operation: "delete", record_type: recordType, record_key: recordKey });
    }
  }

  const previousSettings = previousState && {
    plan: previousState.plan,
    billing: previousState.billing,
    subscriptionStatus: previousState.subscriptionStatus,
    counter: previousState.counter,
    stripeCustomerId: previousState.stripeCustomerId || null,
    stripeSubscriptionId: previousState.stripeSubscriptionId || null,
    stripePriceId: previousState.stripePriceId || null,
    stripeCurrentPeriodEnd: previousState.stripeCurrentPeriodEnd || null,
    stripeCancelAtPeriodEnd: Boolean(previousState.stripeCancelAtPeriodEnd),
    stripeLastEventCreated: previousState.stripeLastEventCreated || null,
  };
  const nextSettings = {
    plan: nextState.plan,
    billing: nextState.billing,
    subscriptionStatus: nextState.subscriptionStatus,
    counter: nextState.counter,
    stripeCustomerId: nextState.stripeCustomerId || null,
    stripeSubscriptionId: nextState.stripeSubscriptionId || null,
    stripePriceId: nextState.stripePriceId || null,
    stripeCurrentPeriodEnd: nextState.stripeCurrentPeriodEnd || null,
    stripeCancelAtPeriodEnd: Boolean(nextState.stripeCancelAtPeriodEnd),
    stripeLastEventCreated: nextState.stripeLastEventCreated || null,
  };
  if (JSON.stringify(previousSettings) !== JSON.stringify(nextSettings)) {
    operations.push({ operation: "upsert", record_type: "settings", record_key: "settings", data: nextSettings });
  }
  if (!previousState) {
    operations.push({ operation: "upsert", record_type: "workspace_meta", record_key: "initialized", data: { initialized: true } });
  }

  const previousMessages = new Map(previousChat.map((message) => [message.id, message]));
  const nextMessages = new Map(nextChat.map((message) => [message.id, message]));
  for (const [recordKey, data] of nextMessages) {
    if (JSON.stringify(previousMessages.get(recordKey)) !== JSON.stringify(data)) {
      operations.push({ operation: "upsert", record_type: "chat_message", record_key: recordKey, data });
    }
  }
  for (const recordKey of previousMessages.keys()) {
    if (!nextMessages.has(recordKey)) operations.push({ operation: "delete", record_type: "chat_message", record_key: recordKey });
  }

  return operations;
}

export async function loadWorkspace(seedState) {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("workspace_records")
    .select("record_type, record_key, data, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const records = rows || [];
  const metadata = records.find((row) => row.record_type === "workspace_meta" && row.record_key === "initialized");
  if (!metadata) {
    await saveWorkspace(null, seedState);
    return { state: seedState, chat: [] };
  }

  const state = { ...seedState };
  for (const [property, recordType] of collectionTypes) {
    state[property] = records
      .filter((row) => row.record_type === recordType)
      .map((row) => row.data);
  }
  state.events = state.events.map((event) => ({
    ...event,
    ...(event.isDemo === undefined &&
      (["e1", "e2", "e3"].includes(event.id) ||
        event.description === "Created via AI Command Center demo workflow.")
      ? { isDemo: true }
      : {}),
  }));
  const demoEventIds = new Set(state.events.filter((event) => event.isDemo === true).map((event) => event.id));
  state.customers = state.customers.map((customer) => ({
    ...customer,
    ...(customer.isDemo === undefined && /^c[1-8]$/.test(customer.id) ? { isDemo: true } : {}),
  }));
  state.registrations = state.registrations.map((registration) => ({
    ...registration,
    ...(registration.isDemo === undefined && /^REG-90[0-8]$/.test(registration.id) ? { isDemo: true } : {}),
  }));
  state.campaigns = state.campaigns.map((campaign) => ({
    ...campaign,
    ...(campaign.isDemo === undefined &&
      (campaign.id === "m1" || demoEventIds.has(campaign.eventId))
      ? { isDemo: true }
      : {}),
  }));
  state.activity = state.activity.map((item) => ({
    ...item,
    ...(item.isDemo === undefined &&
      (/^activity-[1-4]$/.test(item.id) || item.status === "Simulated" ||
        item.message?.includes("AI workflow"))
      ? { isDemo: true }
      : {}),
  }));
  const settings = records.find((row) => row.record_type === "settings")?.data;
  if (settings) {
    Object.assign(state, settings);
    if (!settings.stripeSubscriptionId && !settings.stripeCustomerId) {
      state.plan = "Starter";
      state.subscriptionStatus = "Free";
    }
  }

  const chat = records
    .filter((row) => row.record_type === "chat_message")
    .map((row) => row.data)
    .sort((left, right) => left.createdAt - right.createdAt);
  return { state, chat };
}

export async function saveWorkspace(previousState, nextState, previousChat = [], nextChat = []) {
  const operations = toOperations(previousState, nextState, previousChat, nextChat);
  if (!operations.length) return;
  const { error } = await requireSupabase().rpc("sync_workspace_records", { operations });
  if (error) throw error;
}

export async function sendCampaignEmail(campaignId) {
  const { data, error } = await requireSupabase().functions.invoke("send-campaign", {
    body: { campaignId },
  });
  if (error) {
    if (error.name === "FunctionsFetchError") {
      throw new Error("Could not get a response from the send-campaign Supabase Edge Function. Confirm it is deployed to the linked project; refresh the campaign status and check function logs before retrying because the request may have been processed.");
    }
    const response = error.context instanceof Response ? error.context : null;
    const result = response ? await response.clone().json().catch(() => null) : null;
    const message = result?.error || error.message;
    throw new Error(result?.warning ? `${message} ${result.warning}` : message);
  }
  if (!data || !["Sent", "Delivery needs review", "Ready"].includes(data.status) ||
    !Number.isInteger(data.sent) || !Number.isInteger(data.failed)) {
    throw new Error("The email service returned an invalid result. Check the Supabase Edge Function logs before retrying.");
  }
  return data;
}

export async function proposeAiWorkflow(prompt) {
  const { data, error } = await requireSupabase().functions.invoke("ai-workflow", {
    body: { prompt },
  });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    const result = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(result?.error || error.message);
  }
  return data;
}

export async function startStripeCheckout(plan) {
  const { data, error } = await requireSupabase().functions.invoke("stripe-billing", {
    body: { action: "checkout", plan },
  });
  if (error) {
    if (error.name === "FunctionsFetchError") {
      throw new Error("Could not reach the Supabase stripe-billing Edge Function. Deploy it to your Supabase project and check the browser's network connection.");
    }
    const response = error.context instanceof Response ? error.context : null;
    const result = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(result?.error || error.message);
  }
  return data;
}

export async function openStripePortal() {
  const { data, error } = await requireSupabase().functions.invoke("stripe-billing", {
    body: { action: "portal" },
  });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    const result = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(result?.error || error.message);
  }
  return data;
}

export async function syncStripeSubscription(sessionId) {
  const { data, error } = await requireSupabase().functions.invoke("stripe-billing", {
    body: { action: "sync", ...(sessionId ? { sessionId } : {}) },
  });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    const result = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(result?.error || error.message);
  }
  return data;
}
