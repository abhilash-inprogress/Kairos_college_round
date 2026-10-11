import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  loadWorkspace,
  openStripePortal,
  proposeAiWorkflow,
  saveWorkspace,
  sendCampaignEmail,
  startStripeCheckout,
  syncStripeSubscription,
} from "./workspaceStore.js";

const DAY = 86_400_000;
const DEMO_EMAILS = new Set([
  "ishaan@cloudnine.io",
  "tara@helixworks.com",
  "neil@harborlane.co",
]);
const dateIn = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const formatDate = (date) =>
  new Date(`${date}T00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const timeAgo = (timestamp) => {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

const navItems = [
  ["overview", "Overview", "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"],
  ["ai", "AI Command Center", "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"],
  ["events", "Events & Webinars", "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"],
  ["crm", "CRM", "M16 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 4-6 8-6s8 2 8 6"],
  ["marketing", "Marketing", "M3 11v3l14 6V5L3 11z"],
  ["site", "Website Builder", "M3 4h18v16H3zM3 9h18"],
  ["subs", "Subscriptions", "M2 6h20v12H2zM2 10h20"],
  ["log", "Workflow Activity", "M4 6h16M4 12h16M4 18h10"],
];

const makeEvent = (id, title, days, time, capacity, description) => ({
  id,
  title,
  date: dateIn(days),
  time,
  capacity,
  description,
  page: { headline: "", subheading: "", cta: "Reserve my seat" },
  isDemo: true,
});

function initialState() {
  const customers = [
    ["c1", "Aarav Mehta", "aarav@finedge.in", "Customer", "Referral"],
    ["c2", "Priya Nair", "priya@orbitlabs.io", "Active", "LinkedIn"],
    ["c3", "Rohan Shah", "rohan@brightcart.com", "Lead", "Website"],
    ["c4", "Sana Khan", "sana@pixelforge.dev", "Active", "Webinar"],
    ["c5", "Vikram Rao", "vikram@northwind.co", "Customer", "Referral"],
    ["c6", "Meera Iyer", "meera@lumenhq.com", "Lead", "LinkedIn"],
    ["c7", "Kabir Singh", "kabir@stackpilot.io", "Lead", "Webinar"],
    ["c8", "Ananya Das", "ananya@verdant.in", "Active", "Website"],
  ].map(([id, name, email, status, source]) => ({ id, name, email, status, source, isDemo: true }));
  const events = [
    makeEvent("e1", "Product Launch Webinar", 6, "16:00", 150, "Live walkthrough of our Q4 product release with a Q&A session."),
    makeEvent("e2", "AI for Operations Workshop", 13, "11:30", 5, "Hands-on session on automating business workflows with AI."),
    makeEvent("e3", "Customer Success Roundtable", -4, "15:00", 40, "Past session: best practices from our top customers."),
  ];
  const links = [[4, 1, 3], [3, 1, 2], [6, 1, 1], [2, 1, 0], [7, 2, 1], [1, 3, 9], [2, 3, 8], [5, 3, 7], [8, 3, 6]];
  const registrations = links.map(([customer, event, ago], index) => ({
    id: `REG-${900 + index}`,
    customerId: `c${customer}`,
    eventId: `e${event}`,
    createdAt: Date.now() - ago * DAY - index * 3_600_000,
    isDemo: true,
  }));
  const activity = [
    ["CRM", "CRM: existing customer linked (priya@orbitlabs.io)", "Success", 49],
    ["Registration", "Registration: Priya Nair → Product Launch Webinar", "Success", 50],
    ["Campaign", "Campaign draft created: Launch reminder – 24h", "Success", 200],
    ["Event", "Event created: Product Launch Webinar", "Success", 300],
  ].map(([type, message, status, minutes], index) => ({
    id: `activity-${index + 1}`,
    type,
    message,
    status,
    createdAt: Date.now() - minutes * 60_000,
    isDemo: true,
  }));
  return {
    customers,
    events,
    registrations,
    campaigns: [{
      id: "m1",
      name: "Launch reminder – 24h",
      eventId: "e1",
      subject: "Tomorrow: {{event}}",
      body: "Hi {{name}},\n\nA quick reminder that {{event}} starts soon. We saved your seat.\n\nSee you there,\nTeam Kairos",
      status: "Draft",
      isDemo: true,
    }],
    activity,
    plan: "Starter",
    billing: "monthly",
    subscriptionStatus: "Free",
    counter: 20,
  };
}

const icon = (path) => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Pill = ({ children }) => (
  <span className={`pill ${String(children).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`}>{children}</span>
);
const PageHeader = ({ title, description, action }) => (
  <div className="page-header">
    <div><h1>{title}</h1><p className="sub">{description}</p></div>
    {action}
  </div>
);
const Empty = ({ children }) => <div className="empty-state">{children}</div>;

export default function App({ user, onSignOut }) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const [view, setView] = useState("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("e1");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [command, setCommand] = useState("");
  const [chat, setChat] = useState([]);
  const [workflowProposal, setWorkflowProposal] = useState(null);
  const [customerForm, setCustomerForm] = useState(null);
  const [campaignForm, setCampaignForm] = useState(null);
  const [pageDraft, setPageDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [campaignError, setCampaignError] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [sendingCampaignId, setSendingCampaignId] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const mutationQueue = useRef(Promise.resolve());
  const chatRef = useRef([]);

  useEffect(() => {
    let active = true;
    setWorkspaceLoading(true);
    setWorkspaceError("");
    loadWorkspace(initialState())
      .then(({ state: loadedState, chat: loadedChat }) => {
        if (!active) return;
        stateRef.current = loadedState;
        setState(loadedState);
        chatRef.current = loadedChat;
        setChat(loadedChat);
      })
      .catch((error) => {
        if (active) setWorkspaceError(error instanceof Error ? error.message : "Could not load workspace data.");
      })
      .finally(() => {
        if (active) setWorkspaceLoading(false);
      });
    return () => { active = false; };
  }, [user.id, reloadToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingReturn = params.get("billing");
    if (!billingReturn) return;
    setView("subs");
    const clearReturnUrl = () => window.history.replaceState({}, "", window.location.pathname);
    if (billingReturn === "success") {
      const sessionId = params.get("session_id");
      if (!sessionId) {
        setToast("Checkout returned without a session ID. Use Refresh subscription to check Stripe.");
        clearReturnUrl();
        return;
      }
      setBillingBusy(true);
      syncStripeSubscription(sessionId)
        .then(async () => {
          const { state: latestState, chat: latestChat } = await loadWorkspace(initialState());
          stateRef.current = latestState;
          setState(latestState);
          chatRef.current = latestChat;
          setChat(latestChat);
          clearReturnUrl();
          notify("Stripe checkout confirmed and subscription saved.");
        })
        .catch((error) => {
          notify(error instanceof Error ? `Could not confirm Stripe checkout: ${error.message}` : "Could not confirm Stripe checkout. Refresh this page to retry.");
        })
        .finally(() => setBillingBusy(false));
    } else {
      clearReturnUrl();
      if (billingReturn === "cancel") setToast("Checkout was canceled. No subscription was started.");
      else if (billingReturn === "portal") void refreshBilling();
    }
  }, []);

  const customersById = useMemo(
    () => Object.fromEntries(state.customers.map((customer) => [customer.id, customer])),
    [state.customers],
  );
  const eventById = (id) => state.events.find((event) => event.id === id);
  const registrationsFor = (id) => state.registrations.filter((registration) => registration.eventId === id);
  const upcoming = [...state.events].filter((event) => event.isDemo !== true && event.date >= dateIn(0)).sort((a, b) => a.date.localeCompare(b.date));

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }
  function commitState(update) {
    const task = mutationQueue.current.then(async () => {
      const previous = stateRef.current;
      const next = typeof update === "function" ? update(previous) : update;
      await saveWorkspace(previous, next, chatRef.current, chatRef.current);
      stateRef.current = next;
      setState(next);
    });
    mutationQueue.current = task.catch(() => {});
    return task.catch((error) => {
      notify(`Could not save workspace data: ${error instanceof Error ? error.message : "Please try again."}`);
      return false;
    }).then((result) => result !== false);
  }
  function commitChat(update) {
    const task = mutationQueue.current.then(async () => {
      const previous = chatRef.current;
      const next = typeof update === "function" ? update(previous) : update;
      await saveWorkspace(stateRef.current, stateRef.current, previous, next);
      chatRef.current = next;
      setChat(next);
    });
    mutationQueue.current = task.catch(() => {});
    return task.catch((error) => {
      notify(`Could not save workflow conversation: ${error instanceof Error ? error.message : "Please try again."}`);
      return false;
    }).then((result) => result !== false);
  }
  function appendChat(message) {
    const id = globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return commitChat((current) => [...current, { ...message, id, createdAt: Date.now() }]);
  }
  async function signOut() {
    try {
      await onSignOut();
    } catch (error) {
      notify(error instanceof Error ? `Sign out failed: ${error.message}` : "Sign out failed. Please try again.");
    }
  }
  function log(type, message, status = "Success") {
    return commitState((current) => ({
      ...current,
      activity: [{ id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-${Math.random()}`, type, message, status, createdAt: Date.now() }, ...current.activity],
    }));
  }
  function navigate(nextView) {
    setView(nextView);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function registerPerson(eventId, name, email) {
    const event = eventById(eventId);
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) return "Full name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return "Please enter a valid email address.";
    if (event.date < dateIn(0)) return "Registration is closed: this event has already taken place.";
    const existing = state.customers.find((customer) => customer.email === cleanEmail);
    if (existing && state.registrations.some((item) => item.eventId === eventId && item.customerId === existing.id)) {
      log("Registration", `Duplicate blocked: ${cleanEmail} → ${event.title}`, "Error");
      return `${cleanEmail} is already registered for this event.`;
    }
    const count = registrationsFor(eventId).length;
    if (count >= event.capacity) return `This event is full (${event.capacity} seats).`;
    const customer = existing
      ? existing.isDemo === true ? { ...existing, name: cleanName, isDemo: false } : existing
      : {
      id: `c${state.counter + 1}`,
      name: cleanName,
      email: cleanEmail,
      status: "Lead",
      source: "Event registration",
      };
    const registration = {
      id: `REG-${1000 + state.counter + 2}`,
      customerId: customer.id,
      eventId,
      createdAt: Date.now(),
    };
    const saved = await commitState((current) => ({
      ...current,
      counter: current.counter + (existing ? 1 : 2),
      customers: existing
        ? current.customers.map((item) => item.id === customer.id ? customer : item)
        : [...current.customers, customer],
      registrations: [...current.registrations, registration],
      activity: [
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-crm`, type: "CRM", message: `${existing ? "Existing customer reused: " : "New customer created: "}${cleanEmail}`, status: "Success", createdAt: Date.now() },
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-registration`, type: "Registration", message: `${customer.name} → ${event.title}`, status: "Success", createdAt: Date.now() },
        ...current.activity,
      ],
    }));
    if (!saved) return "Registration could not be saved. Please try again.";
    return null;
  }

  async function saveEvent(eventData) {
    const current = eventData.id ? eventById(eventData.id) : null;
    const capacity = Number(eventData.capacity);
    if (!eventData.title.trim() || !eventData.date || !eventData.time || !Number.isInteger(capacity) || capacity < 1) {
      setModal((currentModal) => ({ ...currentModal, error: "Enter a title, date, time, and a whole-number capacity of at least 1." }));
      return;
    }
    if (current && capacity < registrationsFor(current.id).length) {
      setModal((currentModal) => ({ ...currentModal, error: `Capacity cannot be below current registrations (${registrationsFor(current.id).length}).` }));
      return;
    }
    const event = {
      ...(current || { id: `e${state.counter + 1}`, page: { headline: "", subheading: "", cta: "Reserve my seat" } }),
      title: eventData.title.trim(),
      date: eventData.date,
      time: eventData.time,
      capacity,
      description: eventData.description.trim(),
      isDemo: false,
    };
    const saved = await commitState((s) => ({
      ...s,
      counter: current ? s.counter : s.counter + 1,
      events: current ? s.events.map((item) => item.id === current.id ? event : item) : [...s.events, event],
      activity: [{ id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-event`, type: "Event", message: `${current ? "Event updated: " : "Event created: "}${event.title}`, status: "Success", createdAt: Date.now() }, ...s.activity],
    }));
    if (!saved) return;
    setModal(null);
    notify("Event saved.");
  }
  function openEventForm(event = null) {
    setModal({
      type: "event",
      event: event ? { ...event } : { title: "", date: dateIn(7), time: "16:00", capacity: 100, description: "" },
    });
  }
  function openRegistration(event) {
    if (event.date < dateIn(0)) {
      setModal({ type: "message", title: event.title, text: "Registration is closed because this event has already taken place." });
      return;
    }
    setModal({ type: "register", eventId: event.id });
  }
  async function saveCampaign(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const campaign = {
      id: campaignForm?.id || `m${state.counter + 1}`,
      name: String(data.get("name")).trim(),
      eventId: String(data.get("eventId")),
      subject: String(data.get("subject")).trim(),
      body: String(data.get("body")).trim(),
      status: "Draft",
      isDemo: false,
    };
    if (!campaign.name || !campaign.subject || !campaign.body) return;
    const saved = await commitState((s) => ({
      ...s,
      counter: campaignForm?.id ? s.counter : s.counter + 1,
      campaigns: campaignForm?.id ? s.campaigns.map((item) => item.id === campaign.id ? campaign : item) : [...s.campaigns, campaign],
      activity: [{ id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-campaign`, type: "Campaign", message: `Campaign draft saved: ${campaign.name}`, status: "Success", createdAt: Date.now() }, ...s.activity],
    }));
    if (!saved) return;
    setCampaignForm(null);
    notify("Campaign draft saved.");
  }
  async function saveCustomer(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const customer = {
      ...customerForm,
      name: String(data.get("name")).trim(),
      email: String(data.get("email")).trim().toLowerCase(),
      status: String(data.get("status")),
      source: String(data.get("source")).trim(),
      isDemo: false,
    };
    if (!customer.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email) || !customer.source) {
      setCustomerForm((current) => ({ ...current, error: "Enter a name, valid email address, and source." }));
      return;
    }
    const duplicate = stateRef.current.customers.some((item) =>
      item.email.toLowerCase() === customer.email && item.id !== customer.id
    );
    if (duplicate) {
      setCustomerForm((current) => ({ ...current, error: "A customer with this email address already exists." }));
      return;
    }
    const isNew = !customer.id;
    customer.id = customer.id || globalThis.crypto?.randomUUID?.() || `customer-${Date.now()}`;
    delete customer.error;
    const saved = await commitState((current) => ({
      ...current,
      customers: isNew
        ? [...current.customers, customer]
        : current.customers.map((item) => item.id === customer.id ? customer : item),
      activity: [{
        id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-customer`,
        type: "CRM",
        message: `${isNew ? "Customer created" : "Customer updated"}: ${customer.email}`,
        status: "Success",
        createdAt: Date.now(),
      }, ...current.activity],
    }));
    if (!saved) return;
    setCustomerForm(null);
    notify(`Customer ${isNew ? "created" : "updated"}.`);
  }
  function openCustomerForm(customer = null) {
    setCustomerForm(customer
      ? { ...customer }
      : { name: "", email: "", status: "Lead", source: "Manual entry" });
  }
  async function redirectToStripeSession(createSession, expectedHost) {
    setBillingBusy(true);
    setBillingError("");
    try {
      const result = await createSession();
      const url = new URL(result?.url || "");
      if (url.protocol !== "https:" || url.hostname !== expectedHost) {
        throw new Error("Stripe returned an unexpected billing URL.");
      }
      window.location.assign(url.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the billing session.";
      setBillingError(message);
      notify(message);
      setBillingBusy(false);
    }
  }
  function beginCheckout(plan) {
    return redirectToStripeSession(() => startStripeCheckout(plan), "checkout.stripe.com");
  }
  function manageBilling() {
    return redirectToStripeSession(openStripePortal, "billing.stripe.com");
  }
  async function refreshBilling() {
    setBillingBusy(true);
    setBillingError("");
    try {
      await syncStripeSubscription();
      const { state: latestState, chat: latestChat } = await loadWorkspace(initialState());
      stateRef.current = latestState;
      setState(latestState);
      chatRef.current = latestChat;
      setChat(latestChat);
      notify("Stripe subscription details refreshed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not refresh Stripe subscription details.";
      setBillingError(message);
      notify(message);
    } finally {
      setBillingBusy(false);
    }
  }
  async function selectPlan(planName) {
    if (planName !== "Starter") return beginCheckout(planName);
    if (stateRef.current.stripeCustomerId) return manageBilling();
    const saved = await commitState((current) => ({
      ...current,
      plan: "Starter",
      subscriptionStatus: "Free",
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
      stripeCancelAtPeriodEnd: false,
    }));
    if (saved) notify("Starter is your current free plan.");
  }
  async function setCampaignStatus(campaign, status) {
    const saved = await commitState((s) => ({
      ...s,
      campaigns: s.campaigns.map((item) => item.id === campaign.id ? { ...item, status } : item),
      activity: [{ id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-campaign-status`, type: "Campaign", message: `Campaign moved to ${status}: ${campaign.name}`, status: "Success", createdAt: Date.now() }, ...s.activity],
    }));
    if (!saved) return;
    notify(`Campaign → ${status}`);
  }
  async function sendCampaign(campaign) {
    const event = eventById(campaign.eventId);
    const emails = new Set(registrationsFor(campaign.eventId)
      .filter((registration) => registration.isDemo !== true && !/^REG-90[0-8]$/.test(String(registration.id)))
      .map((registration) => customersById[registration.customerId])
      .filter((customer) => customer && customer.isDemo !== true && customer.email)
      .map((customer) => customer.email.trim().toLowerCase())
      .filter((email) => !DEMO_EMAILS.has(email)));
    if (!emails.size) {
      const message = "No eligible attendees yet. Register real attendees for the linked event first; sample demo attendees are excluded.";
      setCampaignError(message);
      notify(message);
      return;
    }
    const confirmed = window.confirm(
      `Send "${campaign.name}" to ${emails.size} attendee${emails.size === 1 ? "" : "s"} registered for "${event?.title || "the linked event"}"? This sends real email and cannot be undone. Sample demo attendees are excluded.`,
    );
    if (!confirmed) return;

    setSendingCampaignId(campaign.id);
    setCampaignError("");
    try {
      const result = await sendCampaignEmail(campaign.id);
      let refreshWarning = "";
      try {
        const { state: latestState, chat: latestChat } = await loadWorkspace(initialState());
        stateRef.current = latestState;
        setState(latestState);
        chatRef.current = latestChat;
        setChat(latestChat);
      } catch {
        refreshWarning = " The email request completed, but workspace status could not be refreshed. Check the campaign status and provider logs before retrying.";
      }
      if (result.status === "Sent") {
        if (refreshWarning || result.warning) {
          const message = `Resend accepted the campaign for ${result.sent} attendee${result.sent === 1 ? "" : "s"}.${result.warning ? ` ${result.warning}` : ""}${refreshWarning}`;
          setCampaignError(message);
          notify(message);
        } else {
          notify(`Resend accepted the campaign for ${result.sent} attendee${result.sent === 1 ? "" : "s"}.`);
        }
      } else if (result.status === "Delivery needs review") {
        const message = `Delivery needs review: ${result.sent} accepted, ${result.failed} not confirmed. Check Resend and Supabase logs; do not retry blindly.${refreshWarning}`;
        setCampaignError(message);
        notify(message);
      } else {
        const message = `No emails were accepted by Resend. ${result.error || "Review the campaign and provider settings, then try again."}${refreshWarning}`;
        setCampaignError(message);
        notify(message);
      }
    } catch (error) {
      let currentCampaignStatus = "";
      try {
        const { state: latestState, chat: latestChat } = await loadWorkspace(initialState());
        stateRef.current = latestState;
        setState(latestState);
        chatRef.current = latestChat;
        setChat(latestChat);
        currentCampaignStatus = latestState.campaigns.find((item) => item.id === campaign.id)?.status || "";
      } catch {
        // Keep the original send error visible if the status refresh also fails.
      }
      const message = currentCampaignStatus === "Sent"
        ? "The campaign is marked Sent in the workspace. Check Resend delivery logs to confirm inbox delivery; do not send it again."
        : ["Sending", "Delivery needs review", "Partially sent"].includes(currentCampaignStatus)
        ? `The send request may have reached Resend. Campaign status is "${currentCampaignStatus}"; check provider logs before retrying.`
        : error instanceof Error
        ? `Campaign could not be sent: ${error.message}`
        : "Campaign could not be sent. Check the Supabase function logs.";
      setCampaignError(message);
      notify(message);
    } finally {
      setSendingCampaignId("");
    }
  }
  async function saveLandingPage() {
    if (!selectedEvent || !pageDraft) return;
    const currentEvent = eventById(selectedEvent);
    if (!currentEvent) return;
    const slug = (pageDraft.slug || currentEvent.title).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
    if (!slug) {
      notify("Choose a title that can be used to create a public page URL.");
      return;
    }
    if (pageDraft.published && state.events.some((event) =>
      event.id !== selectedEvent && event.page?.published && event.page.slug?.toLowerCase() === slug
    )) {
      notify("That public URL is already used by another event.");
      return;
    }
    const page = { ...pageDraft, slug };
    const saved = await commitState((s) => ({
      ...s,
      events: s.events.map((event) => event.id === selectedEvent ? { ...event, page } : event),
      activity: [{ id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-website`, type: "Website", message: `Landing page saved for ${eventById(selectedEvent)?.title}`, status: "Success", createdAt: Date.now() }, ...s.activity],
    }));
    if (!saved) return;
    setPageDraft(page);
    notify("Landing page saved.");
  }
  async function runCommand(text = command) {
    const clean = text.trim();
    if (!clean || busy) return;
    setCommand("");
    setWorkflowProposal(null);
    if (!await appendChat({ role: "user", text: clean })) return;
    setBusy(true);
    try {
      const result = await proposeAiWorkflow(clean);
      if (!result?.supported) {
        await appendChat({
          role: "assistant",
          text: result?.reason || "The workflow agent could not prepare a supported proposal.",
        });
        return;
      }
      setWorkflowProposal(result.proposal);
      await log("AI", `Workflow proposal prepared: ${result.proposal.title}`, "Success");
      await appendChat({
        role: "assistant",
        text: "I prepared an event launch workflow. Review the event details, registration page content, and campaign draft below; nothing is saved until you approve it.",
        steps: [
          ["Create event", "Proposed"],
          ["Prepare registration page", "Proposed"],
          ["Draft linked campaign", "Proposed"],
        ],
      });
    } catch (error) {
      await appendChat({
        role: "assistant",
        text: error instanceof Error ? `I could not prepare that workflow: ${error.message}` : "I could not prepare that workflow. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function approveWorkflowProposal() {
    if (!workflowProposal || busy) return;
    setBusy(true);
    const eventId = globalThis.crypto?.randomUUID?.() || `event-${Date.now()}`;
    const campaignId = globalThis.crypto?.randomUUID?.() || `campaign-${Date.now()}`;
    const slug = workflowProposal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
    const event = {
      id: eventId,
      title: workflowProposal.title,
      date: workflowProposal.date,
      time: workflowProposal.time,
      capacity: workflowProposal.capacity,
      description: workflowProposal.description,
      page: {
        headline: workflowProposal.headline,
        subheading: workflowProposal.subheading,
        cta: "Register",
        slug,
        published: false,
      },
    };
    const campaign = {
      id: campaignId,
      name: workflowProposal.campaignName,
      eventId,
      subject: workflowProposal.subject,
      body: workflowProposal.body,
      status: "Draft",
    };
    const saved = await commitState((current) => ({
      ...current,
      counter: current.counter + 2,
      events: [...current.events, event],
      campaigns: [...current.campaigns, campaign],
      activity: [
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-campaign`, type: "Campaign", message: `Campaign draft created by approved AI workflow: ${campaign.name}`, status: "Success", createdAt: Date.now() },
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-event`, type: "Event", message: `Event created by approved AI workflow: ${event.title}`, status: "Success", createdAt: Date.now() },
        ...current.activity,
      ],
    }));
    if (!saved) {
      setBusy(false);
      return;
    }
    setSelectedEvent(eventId);
    setPageDraft(null);
    setWorkflowProposal(null);
    await appendChat({
      role: "assistant",
      text: `Approved and saved "${event.title}", its registration page draft, and a linked campaign draft. The page is not public until you publish it in Website Builder; the campaign is not sent.`,
      steps: [
        ["Create event", "Success"],
        ["Prepare registration page", "Success"],
        ["Draft linked campaign", "Success"],
      ],
    });
    notify("Approved workflow saved. Review the campaign before requesting approval.");
    setBusy(false);
  }

  const modalContent = () => {
    if (!modal) return null;
    if (modal.type === "event") return (
      <form className="modal-card" onSubmit={async (event) => { event.preventDefault(); await saveEvent(modal.event); }}>
        <div className="modal-heading"><div><span className="eyebrow">EVENT MANAGEMENT</span><h2>{modal.event.id ? "Edit event" : "Create event"}</h2></div><button type="button" className="icon-button" onClick={() => setModal(null)}>×</button></div>
        {modal.error && <div className="notice error">{modal.error}</div>}
        <label>Event title<input autoFocus value={modal.event.title} onChange={(event) => setModal({ ...modal, event: { ...modal.event, title: event.target.value } })} /></label>
        <div className="form-grid"><label>Date<input type="date" value={modal.event.date} onChange={(event) => setModal({ ...modal, event: { ...modal.event, date: event.target.value } })} /></label><label>Time<input type="time" value={modal.event.time} onChange={(event) => setModal({ ...modal, event: { ...modal.event, time: event.target.value } })} /></label></div>
        <label>Capacity<input type="number" min="1" step="1" value={modal.event.capacity} onChange={(event) => setModal({ ...modal, event: { ...modal.event, capacity: event.target.value } })} /></label>
        <label>Description<textarea value={modal.event.description} onChange={(event) => setModal({ ...modal, event: { ...modal.event, description: event.target.value } })} /></label>
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn">Save event</button></div>
      </form>
    );
    if (modal.type === "register") return (
      <form className="modal-card" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const error = await registerPerson(modal.eventId, String(form.get("name")), String(form.get("email")));
        if (error) setModal({ ...modal, error });
        else { setModal(null); notify("Registration confirmed."); }
      }}>
        <div className="modal-heading"><div><span className="eyebrow">EVENT REGISTRATION</span><h2>{eventById(modal.eventId)?.title}</h2></div><button type="button" className="icon-button" onClick={() => setModal(null)}>×</button></div>
        {modal.error && <div className="notice error">{modal.error}</div>}
        <label>Full name<input name="name" autoFocus /></label><label>Email address<input name="email" type="email" /></label>
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn">Confirm registration</button></div>
      </form>
    );
    if (modal.type === "registrants") {
      const rows = registrationsFor(modal.eventId);
      return <div className="modal-card"><div className="modal-heading"><div><span className="eyebrow">EVENT ATTENDEES</span><h2>{eventById(modal.eventId)?.title}</h2></div><button type="button" className="icon-button" onClick={() => setModal(null)}>×</button></div>
        <p className="sub">{rows.length} of {eventById(modal.eventId)?.capacity} seats reserved</p>
        {rows.length ? rows.map((row) => <div className="list-row" key={row.id}><span><b>{customersById[row.customerId]?.name}</b><small>{customersById[row.customerId]?.email}</small></span><small>{row.id}</small></div>) : <Empty>No registrations yet.</Empty>}
        <div className="modal-actions"><button className="btn secondary" onClick={() => setModal(null)}>Close</button><button className="btn" onClick={() => openRegistration(eventById(modal.eventId))}>Register someone</button></div>
      </div>;
    }
    return <div className="modal-card"><div className="modal-heading"><h2>{modal.title}</h2><button className="icon-button" onClick={() => setModal(null)}>×</button></div><div className="notice">{modal.text}</div><div className="modal-actions"><button className="btn" onClick={() => setModal(null)}>Done</button></div></div>;
  };

  function overviewPage() {
    const today = new Date();
    const actualRegistrations = state.registrations.filter((registration) => registration.isDemo !== true);
    const actualCustomers = state.customers.filter((customer) => customer.isDemo !== true);
    const actualEvents = state.events.filter((event) => event.isDemo !== true);
    const actualCampaigns = state.campaigns.filter((campaign) => campaign.isDemo !== true);
    const actualActivity = state.activity.filter((item) => item.isDemo !== true);
    const lastWeek = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today.getTime() - (6 - index) * DAY);
      return {
        label: day.toLocaleDateString("en-IN", { weekday: "short" }),
        count: actualRegistrations.filter((registration) => new Date(registration.createdAt).toDateString() === day.toDateString()).length,
      };
    });
    const max = Math.max(3, ...lastWeek.map((day) => day.count));
    const countLog = (type, status) => actualActivity.filter((item) => item.type === type && (!status || item.status === status)).length;
    const kpis = [
      ["Total customers", actualCustomers.length, `${actualCustomers.filter((customer) => customer.status === "Lead").length} leads`, "violet"],
      ["Upcoming webinars", upcoming.length, `Next: ${upcoming[0] ? formatDate(upcoming[0].date) : "—"}`, "cyan"],
      ["Total registrations", actualRegistrations.length, `Across ${actualEvents.length} events`, "amber"],
      ["Active campaigns", actualCampaigns.filter((campaign) => !campaign.status.startsWith("Sent")).length, `${actualCampaigns.filter((campaign) => campaign.status === "Ready").length} ready`, "rose"],
    ];
    const workflows = [
      ["Registration → CRM sync", `${countLog("CRM", "Success")} synced`, "Success"],
      ["Campaigns awaiting approval", `${state.campaigns.filter((campaign) => campaign.status === "Pending approval").length} pending`, "Pending"],
      ["AI workflow proposals", `${countLog("AI")} proposals`, "OpenAI"],
      ["Errors / blocked actions", `${countLog("Error") + countLog("Registration", "Error")} logged`, "Success"],
    ];
    return <>
      <PageHeader title="Overview" description="Your workspace at a glance · Kairos Demo Workspace" />
      <div className="grid kpi-grid">{kpis.map(([label, value, helper, color]) => <div className={`card kpi ${color}`} key={label}><span>{label}</span><b>{value}</b><small>{helper}</small><i className="kpi-orb" /></div>)}</div>
      <div className="grid two-column top-gap">
        <section className="card"><div className="section-heading"><div><span className="eyebrow">PERFORMANCE</span><h2>Registration trend</h2></div><span className="subtle">Last 7 days</span></div>
          <div className="chart">{lastWeek.map((day, index) => <div className="chart-col" key={day.label}><div className="chart-value">{day.count || ""}</div><div className="chart-bar" style={{ height: `${Math.max(7, (day.count / max) * 126)}px` }} /><small>{day.label}</small></div>)}</div>
        </section>
        <section className="card"><div className="section-heading"><div><span className="eyebrow">AUTOMATIONS</span><h2>Workflow status</h2></div><span className="live-indicator">Live</span></div>
          {workflows.map(([label, detail, status]) => <div className="list-row" key={label}><span><b>{label}</b><small>{detail}</small></span><Pill>{status}</Pill></div>)}
        </section>
      </div>
      <div className="grid two-column top-gap">
        <section className="card"><div className="section-heading"><div><span className="eyebrow">WORKSPACE FEED</span><h2>Recent activity</h2></div><button className="text-button" onClick={() => navigate("log")}>View all <span>↗</span></button></div>
          {actualActivity.slice(0, 5).map((item, index) => <div className="list-row" key={`${item.createdAt}-${index}`}><span><b>{item.message}</b><small>{item.type} · {timeAgo(item.createdAt)}</small></span><Pill>{item.status}</Pill></div>)}{!actualActivity.length && <Empty>No real workspace activity yet.</Empty>}
        </section>
        <section className="card"><div className="section-heading"><div><span className="eyebrow">COMING UP</span><h2>Upcoming events</h2></div><button className="text-button" onClick={() => navigate("events")}>Manage <span>↗</span></button></div>
          {upcoming.length ? upcoming.slice(0, 3).map((event) => {
            const registered = registrationsFor(event.id).filter((registration) => registration.isDemo !== true).length;
            return <div className="event-progress" key={event.id}><div className="list-row compact"><span><b>{event.title}</b><small>{formatDate(event.date)}</small></span><small>{registered} / {event.capacity}</small></div><div className="progress"><i style={{ width: `${Math.min(100, registered / event.capacity * 100)}%` }} /></div></div>;
          }) : <Empty>No upcoming events.</Empty>}
        </section>
      </div>
    </>;
  }

  function eventsPage() {
    return <>
      <PageHeader title="Events & Webinars" description="Create events, manage attendance, and grow your community." action={<button className="btn" onClick={() => openEventForm()}>＋ New event</button>} />
      <div className="grid event-grid">{state.events.map((event) => {
        const count = registrationsFor(event.id).length;
        const status = event.date < dateIn(0) ? "Completed" : count >= event.capacity ? "Full" : "Active";
        return <article className="card event-card" key={event.id}><div className="event-card-top"><span className="event-symbol">{icon(navItems[2][2])}</span><Pill>{status}</Pill></div><h2>{event.title}</h2><p>{event.description}</p><div className="event-date"><span>{formatDate(event.date)}</span><span>{event.time}</span></div><div className="progress"><i style={{ width: `${Math.min(100, count / event.capacity * 100)}%` }} /></div><small className="subtle">{count} / {event.capacity} registered</small><div className="button-row"><button className="btn small" onClick={() => openRegistration(event)}>Register</button><button className="btn secondary small" onClick={() => setModal({ type: "registrants", eventId: event.id })}>Attendees</button><button className="btn ghost small" onClick={() => openEventForm(event)}>Edit</button></div></article>;
      })}</div>
    </>;
  }

  function crmPage() {
    const filtered = state.customers.filter((customer) => [customer.name, customer.email, customer.status, customer.source].join(" ").toLowerCase().includes(search.toLowerCase()));
    return <>
      <PageHeader title="CRM" description="Create, find, and update customer records connected to your events." action={<button className="btn" onClick={() => openCustomerForm()}>＋ Add customer</button>} />
      <section className="card table-card"><div className="table-tools"><div><h2>Customers</h2><small className="subtle">{filtered.length} of {state.customers.length} customers</small></div><input className="search" placeholder="Search name, email, status…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Registration history</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>{filtered.map((customer) => {
          const history = state.registrations.filter((registration) => registration.customerId === customer.id);
          return <tr key={customer.id}><td><b>{customer.name}</b></td><td>{customer.email}</td><td>{history.length ? history.map((item) => <div key={item.id}>{eventById(item.eventId)?.title}<small className="cell-muted"> · {timeAgo(item.createdAt)}</small></div>) : <span className="subtle">No events yet</span>}</td><td><Pill>{customer.status}</Pill></td><td>{customer.source}</td><td><button className="text-button" onClick={() => openCustomerForm(customer)}>Edit</button></td></tr>;
        })}</tbody></table>{!filtered.length && <Empty>No matching customers.</Empty>}</div>
      </section>
      {customerForm && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomerForm(null); }}><form className="modal-card" onSubmit={saveCustomer}><div className="modal-heading"><div><span className="eyebrow">CUSTOMER RECORD</span><h2>{customerForm.id ? "Edit customer" : "Add customer"}</h2></div><button type="button" className="icon-button" onClick={() => setCustomerForm(null)}>×</button></div>{customerForm.error && <div className="notice error" role="alert">{customerForm.error}</div>}<label>Full name<input name="name" required defaultValue={customerForm.name} autoFocus /></label><label>Email address<input name="email" type="email" required defaultValue={customerForm.email} /></label><div className="form-grid"><label>Status<select name="status" defaultValue={customerForm.status}><option>Lead</option><option>Active</option><option>Customer</option></select></label><label>Source<input name="source" required defaultValue={customerForm.source} /></label></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setCustomerForm(null)}>Cancel</button><button className="btn">Save customer</button></div></form></div>}
    </>;
  }

  function marketingPage() {
    const startCampaign = (campaign = null) => {
      setCampaignForm(campaign || { name: "", eventId: state.events[0]?.id || "", subject: "", body: "", status: "Draft" });
    };
    return <>
      <PageHeader title="Marketing" description="Build on-brand event campaigns with a human approval step." action={<button className="btn" onClick={() => startCampaign()}>＋ New campaign</button>} />
      {campaignError && <div className="notice error billing-error" role="alert"><span>{campaignError}</span><button type="button" className="text-button" onClick={() => setCampaignError("")}>Dismiss</button></div>}
      <section className="card table-card"><div className="section-heading"><div><span className="eyebrow">CAMPAIGN WORKSPACE</span><h2>Your campaigns</h2></div><span className="subtle">Approved campaigns send to linked event attendees</span></div>
        {state.campaigns.length ? <div className="campaign-grid">{state.campaigns.map((campaign, index) => <article className={`campaign-card tone-${index % 6}`} key={campaign.id}>
          <div className="campaign-card-top"><span className="campaign-mark">{String(index + 1).padStart(2, "0")}</span><Pill>{campaign.status}</Pill></div>
          <span className="eyebrow">EVENT CAMPAIGN</span><h3>{campaign.name}</h3><p className="campaign-subject">{campaign.subject}</p>
          <div className="campaign-event"><span>LINKED EVENT</span><b>{eventById(campaign.eventId)?.title || "No event selected"}</b></div>
          <div className="button-row campaign-actions">
            {!["Sent", "Partially sent", "Sending", "Delivery needs review"].includes(campaign.status) && <button className="btn secondary small" onClick={() => startCampaign(campaign)}>Edit / preview</button>}
            {campaign.status === "Draft" && <button className="btn small" onClick={() => setCampaignStatus(campaign, "Pending approval")}>Request approval</button>}
            {campaign.status === "Pending approval" && <><button className="btn small" onClick={() => setCampaignStatus(campaign, "Ready")}>Approve</button><button className="btn ghost small" onClick={() => setCampaignStatus(campaign, "Draft")}>Reject</button></>}
            {campaign.status === "Ready" && <button className="btn small accent" disabled={sendingCampaignId === campaign.id} onClick={() => sendCampaign(campaign)}>{sendingCampaignId === campaign.id ? "Sending…" : "Send email"}</button>}
          </div>
          {campaign.deliverySummary && <p className="subtle campaign-delivery-summary">Delivery: {campaign.deliverySummary.sent} sent · {campaign.deliverySummary.failed} {campaign.status === "Delivery needs review" ? "unconfirmed" : "not sent"}</p>}
        </article>)}</div> : <Empty>No campaigns yet.</Empty>}
      </section>
      {campaignForm && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCampaignForm(null); }}><form className="modal-card wide-modal" onSubmit={saveCampaign}><div className="modal-heading"><div><span className="eyebrow">CAMPAIGN EDITOR</span><h2>{campaignForm.id ? "Edit campaign" : "New campaign"}</h2></div><button type="button" className="icon-button" onClick={() => setCampaignForm(null)}>×</button></div>
        <label>Campaign name<input name="name" required defaultValue={campaignForm.name} /></label><label>Linked event<select name="eventId" defaultValue={campaignForm.eventId}>{state.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label><label>Subject<input name="subject" required defaultValue={campaignForm.subject} /></label><label>Message<textarea name="body" required defaultValue={campaignForm.body} /></label><div className="notice">Campaign email sends only after approval and your confirmation. Recipients are non-demo attendees registered for the linked event.</div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setCampaignForm(null)}>Cancel</button><button className="btn">Save draft</button></div></form></div>}
    </>;
  }

  function sitePage() {
    const event = eventById(selectedEvent) || state.events[0];
    if (!event) return <><PageHeader title="Website Builder" description="Build event registration pages." /><Empty>Create an event to get started.</Empty></>;
    const draft = pageDraft || event.page;
    const draftSlug = draft.slug || event.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const publicUrl = `${window.location.origin}/events/${draftSlug}`;
    return <>
      <PageHeader title="Website Builder" description="Design a landing page for each event. Changes update the preview instantly." />
      <section className="card builder-card"><div className="builder-controls"><label>Choose event<select value={event.id} onChange={(change) => { setSelectedEvent(change.target.value); setPageDraft(null); }}>{state.events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><span className="live-indicator">Preview live</span></div><div className="builder-grid"><div className="builder-form"><span className="eyebrow">PAGE CONTENT</span><h2>Make it yours</h2><label>Headline<input value={draft.headline} placeholder={event.title} onChange={(change) => setPageDraft({ ...draft, headline: change.target.value })} /></label><label>Supporting text<textarea value={draft.subheading} placeholder={event.description} onChange={(change) => setPageDraft({ ...draft, subheading: change.target.value })} /></label><label>Button label<input value={draft.cta} placeholder="Reserve my seat" onChange={(change) => setPageDraft({ ...draft, cta: change.target.value })} /></label><label>Public page URL<input value={draft.slug || ""} placeholder={draftSlug} maxLength="100" onChange={(change) => setPageDraft({ ...draft, slug: change.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })} /></label><label className="publish-toggle"><input type="checkbox" checked={Boolean(draft.published)} onChange={(change) => setPageDraft({ ...draft, published: change.target.checked })} /> Publish this event page and allow public registration</label><button className="btn" onClick={saveLandingPage}>Save landing page</button>{draft.published && <a className="public-page-link" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl} ↗</a>}</div><div className="landing-preview"><div className="preview-browser"><span /><span /><span /><small>kairos.events/{draftSlug}</small></div><div className="landing-hero"><span className="eyebrow">YOU'RE INVITED</span><span className="preview-date">{formatDate(event.date)} · {event.time}</span><h2>{draft.headline || event.title}</h2><p>{draft.subheading || event.description}</p><button className="btn">{draft.cta || "Register"}</button><div className="preview-capacity">{registrationsFor(event.id).length} / {event.capacity} seats reserved</div></div></div></div></section>
    </>;
  }

  function subscriptionPage() {
    const plans = [
      { name: "Starter", price: 0, caption: "For getting started", features: ["1 workspace", "3 events / month", "Basic CRM"] },
      { name: "Growth", price: 49, caption: "For teams in motion", features: ["Unlimited events", "Automated CRM sync", "Marketing workflows"] },
      { name: "Scale", price: 149, caption: "For growing operations", features: ["Everything in Growth", "Advanced analytics", "Priority support"] },
    ];
    const renewalDate = state.stripeCurrentPeriodEnd
      ? `${state.stripeCancelAtPeriodEnd ? "Paid access ends on" : "Next renewal"} ${formatDate(new Date(state.stripeCurrentPeriodEnd * 1000).toISOString().slice(0, 10))}.`
      : "No paid renewal scheduled.";
    return <>
      <PageHeader title="Subscriptions" description="Choose a plan and manage secure Stripe billing." action={<Pill>{state.subscriptionStatus || "Free"}</Pill>} />
      {billingError && <div className="notice error billing-error" role="alert"><span>{billingError}</span><button type="button" className="text-button" onClick={() => setBillingError("")}>Dismiss</button></div>}
      <section className="card billing-summary"><div><span className="eyebrow">CURRENT PLAN</span><h2>{state.plan} <span className="plan-price">${plans.find((plan) => plan.name === state.plan)?.price || 0}<small> / month</small></span></h2><p className="sub">{renewalDate}</p></div><div className="button-row">{state.stripeCustomerId && <button className="btn secondary" disabled={billingBusy} onClick={manageBilling}>Manage billing</button>}<button className="btn ghost" disabled={billingBusy || !state.stripeCustomerId} onClick={refreshBilling}>{billingBusy ? "Working…" : "Refresh subscription"}</button></div></section>
      {!state.stripeSubscriptionId && state.plan !== "Starter" && <div className="notice">This workspace has no confirmed Stripe subscription. Select a paid plan to start secure checkout.</div>}
      <div className="grid plan-grid">{plans.map((plan) => {
        const isCurrent = state.plan === plan.name;
        const canManage = Boolean(state.stripeCustomerId) && isCurrent;
        return <article className={`card plan-card ${isCurrent ? "current" : ""}`} key={plan.name}>{plan.name === "Growth" && <span className="plan-ribbon">POPULAR</span>}<span className="eyebrow">{plan.caption}</span><h2>{plan.name}</h2><div className="plan-price">${plan.price}<small> / month</small></div><div className="plan-features">{plan.features.map((feature) => <div key={feature}><span>✓</span>{feature}</div>)}</div><button className={`btn ${isCurrent ? "secondary" : ""}`} disabled={billingBusy || (isCurrent && !canManage && plan.name === "Starter")} onClick={() => canManage ? manageBilling() : selectPlan(plan.name)}>{canManage ? "Manage billing" : isCurrent ? "Current plan" : plan.name === "Starter" ? "Use Starter" : "Subscribe with Stripe"}</button></article>;
      })}</div>
      <p className="sub">Payments and subscription changes are processed by Stripe. Use the billing portal to change or cancel a paid subscription.</p>
    </>;
  }

  function activityPage() {
    const actualActivity = state.activity.filter((item) => item.isDemo !== true);
    return <>
      <PageHeader title="Workflow Activity" description="A chronological record of actions in your workspace." />
      <section className="card table-card"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent events</h2></div><span className="subtle">{actualActivity.length} activities</span></div><div className="table-scroll"><table><thead><tr><th>Time</th><th>Type</th><th>Event</th><th>Status</th></tr></thead><tbody>{actualActivity.map((item, index) => <tr key={`${item.createdAt}-${index}`}><td>{new Date(item.createdAt).toLocaleString("en-IN")}</td><td>{item.type}</td><td>{item.message}</td><td><Pill>{item.status}</Pill></td></tr>)}</tbody></table>{!actualActivity.length && <Empty>No real workspace activity yet.</Empty>}</div></section>
    </>;
  }

  function aiPage() {
    return <>
      <PageHeader title="AI Command Center" description="Ask OpenAI to prepare an event launch workflow for your review." />
      <div className="ai-layout"><section className="card ai-chat"><div className="chat-header"><div className="ai-avatar">✦</div><div><b>NEXUS Copilot</b><small>OpenAI workflow planner · approval required</small></div><span className="live-indicator">{busy ? "Working" : "Ready"}</span></div><div className="chat-messages">{chat.length ? chat.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><div className="message-bubble"><p>{message.text}</p>{message.steps && <div className="steps">{message.steps.map(([step, status], stepIndex) => <div className="step-row" key={step}><span>{String(stepIndex + 1).padStart(2, "0")}</span><b>{step}</b><Pill>{status}</Pill></div>)}</div>}</div></div>) : <div className="chat-welcome"><div className="ai-avatar large">✦</div><h2>Your operations, orchestrated.</h2><p>OpenAI can prepare an event, landing-page content, and a linked campaign draft.</p><button className="suggestion" onClick={() => setCommand("Create a product webinar next month, prepare its registration page, and draft a reminder campaign.")}>Prepare a webinar launch workflow <span>↗</span></button></div>}</div>{workflowProposal && <section className="workflow-proposal"><span className="eyebrow">REVIEW BEFORE SAVING</span><h2>{workflowProposal.title}</h2><p>{workflowProposal.description}</p><div className="workflow-proposal-grid"><div><b>Event</b><span>{formatDate(workflowProposal.date)} · {workflowProposal.time} · {workflowProposal.capacity} seats</span></div><div><b>Registration page</b><span>{workflowProposal.headline}</span><small>{workflowProposal.subheading}</small></div><div><b>Campaign draft</b><span>{workflowProposal.campaignName}</span><small>{workflowProposal.subject}</small></div></div><details><summary>Review email draft</summary><p>{workflowProposal.body}</p></details><div className="button-row"><button className="btn" disabled={busy} onClick={approveWorkflowProposal}>{busy ? "Saving workflow…" : "Approve and create event + campaign"}</button><button className="btn ghost" disabled={busy} onClick={() => setWorkflowProposal(null)}>Discard proposal</button></div></section>}<div className="composer"><input value={command} disabled={busy} maxLength="2000" placeholder="Describe an event launch workflow…" onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runCommand(); }} /><button className="btn" disabled={busy || !command.trim()} onClick={() => runCommand()}>{busy ? "Working…" : "Prepare workflow"} <span>↗</span></button></div><small className="ai-disclaimer">The agent can only propose an event launch workflow. No data is saved until you approve it. Configure OPENAI_API_KEY in Supabase Edge Function secrets.</small></section><aside className="card ai-info"><span className="eyebrow">HOW IT WORKS</span><h2>AI proposes. You approve.</h2><p className="sub">A restricted planner can propose these workspace changes. It does not send emails or register fictional attendees.</p>{["Create an event", "Prepare its registration page", "Draft a linked campaign", "Review and approve before saving"].map((step, index) => <div className="info-step" key={step}><span>{index + 1}</span>{step}</div>)}</aside></div>
    </>;
  }

  const pages = {
    overview: overviewPage,
    ai: aiPage,
    events: eventsPage,
    crm: crmPage,
    marketing: marketingPage,
    site: sitePage,
    subs: subscriptionPage,
    log: activityPage,
  };

  if (workspaceLoading) {
    return <main className="auth-shell"><div className="auth-loading"><span className="auth-spinner" />Loading your saved workspace…</div></main>;
  }

  if (workspaceError) {
    return <main className="auth-shell"><section className="auth-card">
      <div className="auth-brand"><span className="brand-mark">N</span><span><b>NEXUS</b><small>AI BUSINESS PLATFORM</small></span></div>
      <span className="eyebrow">WORKSPACE DATABASE</span>
      <h1>Could not load your workspace</h1>
      <p className="auth-copy">If this is your first setup, run <code>supabase/schema.sql</code> in your Supabase dashboard’s SQL Editor. Otherwise, check your connection and configuration, then retry.</p>
      <div className="notice error" role="alert">{workspaceError}</div>
      <button className="btn auth-submit" onClick={() => setReloadToken((token) => token + 1)}>Retry connection <span aria-hidden="true">↻</span></button>
    </section></main>;
  }

  return <div className="app-shell">
    {mobileMenu && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? "open" : ""}`}><a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); navigate("overview"); }}><span className="brand-mark">N</span><span><b>NEXUS</b><small>AI BUSINESS PLATFORM</small></span></a><div className="workspace-chip"><span className="workspace-icon">⌘</span><span><small>WORKSPACE</small><b>Kairos Demo Workspace</b></span><span className="chevron">⌄</span></div><div className="nav-label">WORKSPACE</div><nav>{navItems.map(([id, label, path]) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => navigate(id)}>{icon(path)}<span>{label}</span>{view === id && <i />}</button>)}</nav><div className="sidebar-footer"><div className="workspace-status"><span className="status-dot" /><span>All systems operational</span></div><div className="profile"><span className="profile-avatar">{(user.user_metadata?.full_name || user.email || "A").slice(0, 1).toUpperCase()}</span><span><b>{user.user_metadata?.full_name || user.email?.split("@")[0] || "Account"}</b><small>{user.email}</small></span><button className="signout-button" title="Log out of your account" onClick={signOut}>Log out</button></div></div></aside>
    <main className="main-content"><header className="topbar"><button className="menu-toggle" aria-label="Toggle menu" onClick={() => setMobileMenu(!mobileMenu)}>☰</button><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{navItems.find(([id]) => id === view)?.[1]}</strong></div><div className="topbar-right"><span className="environment-badge"><i /> Secure account</span><span className="top-avatar">{(user.user_metadata?.full_name || user.email || "A").slice(0, 1).toUpperCase()}</span></div></header><div className={`page-content view-${view}`}>{pages[view]()}</div><footer className="app-footer"><span>NEXUS <i>·</i> AI Business Operating Platform</span><span>Workspace data · Supabase · Stripe · OpenAI · Resend email</span></footer></main>
    {modal && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>{modalContent()}</div>}
    {toast && <div className="toast-message"><span>✓</span>{toast}</div>}
  </div>;
}
