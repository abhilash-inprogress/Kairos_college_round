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
  };
  const nextSettings = {
    plan: nextState.plan,
    billing: nextState.billing,
    subscriptionStatus: nextState.subscriptionStatus,
    counter: nextState.counter,
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
  const settings = records.find((row) => row.record_type === "settings")?.data;
  if (settings) Object.assign(state, settings);

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
    const response = error.context instanceof Response ? error.context : null;
    const result = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(result?.error || error.message);
  }
  return data;
}
