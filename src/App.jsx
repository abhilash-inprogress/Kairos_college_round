import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadWorkspace, saveWorkspace, sendCampaignEmail } from "./workspaceStore.js";

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
    }],
    activity,
    plan: "Growth",
    billing: "monthly",
    subscriptionStatus: "Active",
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

function WorkflowRoutingMap() {
  return (
    <svg className="workflow-map" viewBox="0 0 760 250" role="img" aria-labelledby="workflow-map-title workflow-map-description">
      <title id="workflow-map-title">NEXUS workflow routing map</title>
      <desc id="workflow-map-description">Illustrative demo flow from event intake through registration, duplicate checks, CRM synchronization, and an approval checkpoint.</desc>
      <defs>
        <linearGradient id="routePrimary" x1="0" x2="1"><stop stopColor="#9967f5" stopOpacity=".32"/><stop offset=".55" stopColor="#8c68f5"/><stop offset="1" stopColor="#4c8dff"/></linearGradient>
        <linearGradient id="routeSecondary" x1="0" x2="1"><stop stopColor="#4c8dff" stopOpacity=".25"/><stop offset=".55" stopColor="#438cff"/><stop offset="1" stopColor="#34d5ba"/></linearGradient>
        <filter id="routeGlow" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {[0,1,2,3,4,5,6,7,8,9].map((n) => <line key={n} className="route-grid" x1={28+n*78} x2={28+n*78} y1="42" y2="218" />)}
      <path className="route-path route-primary" d="M48 83 C115 83 145 72 205 82 S292 99 355 84 S452 73 515 88 S615 96 690 88" />
      <path className="route-path route-secondary" d="M48 122 C120 122 145 151 205 140 S292 119 355 135 S452 149 515 127 S617 106 690 88" />
      <path className="route-path route-fallback" d="M48 178 C120 178 145 165 205 175 S292 184 355 166 S452 149 515 159 S610 153 655 190" />
      <path className="route-path route-branch" d="M48 102 C120 102 145 136 205 134 S292 114 355 125 S452 124 515 116 S614 102 690 88" />
      {[["Intake",48],["Register",205],["Validate",355],["CRM sync",515]].map(([label,x]) => (
        <g key={label}>
          <text className="route-stage" x={x} y="24" textAnchor="middle">{label}</text>
          <rect className="route-rail" x={x-5} y="48" width="10" height="154" rx="5" />
          <rect className="route-rail-glow" x={x-2} y="63" width="4" height="124" rx="2" />
          <circle className="route-node violet" cx={x} cy="83" r="7" />
          <circle className="route-node blue" cx={x} cy="137" r="6" />
          <circle className="route-node teal" cx={x} cy="176" r="5" />
        </g>
      ))}
      <text className="route-stage" x="690" y="24" textAnchor="middle">Outcome</text>
      <circle className="route-outcome" cx="690" cy="88" r="22" />
      <path className="route-check" d="m682 88 5 5 11-12" />
      <text className="route-caption" x="690" y="126" textAnchor="middle">Complete</text>
      <circle className="route-fallback-node" cx="655" cy="190" r="8" />
      <text className="route-small" x="655" y="216" textAnchor="middle">Review gate</text>
      <text className="route-small" x="48" y="235" textAnchor="middle">New event</text>
      <text className="route-small" x="205" y="235" textAnchor="middle">Registration</text>
      <text className="route-small" x="355" y="235" textAnchor="middle">Duplicate check</text>
      <text className="route-small" x="515" y="235" textAnchor="middle">Customer record</text>
    </svg>
  );
}

export default function App({ user, onSignOut }) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const [view, setView] = useState("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [theme, setTheme] = useState(() => window.localStorage.getItem("nexus-theme") === "light" ? "light" : "dark");
  const [selectedEvent, setSelectedEvent] = useState("e1");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [command, setCommand] = useState("");
  const [chat, setChat] = useState([]);
  const [campaignForm, setCampaignForm] = useState(null);
  const [pageDraft, setPageDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [sendingCampaignId, setSendingCampaignId] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const mutationQueue = useRef(Promise.resolve());
  const chatRef = useRef([]);

  useEffect(() => {
    window.localStorage.setItem("nexus-theme", theme);
  }, [theme]);

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

  const customersById = useMemo(
    () => Object.fromEntries(state.customers.map((customer) => [customer.id, customer])),
    [state.customers],
  );
  const eventById = (id) => state.events.find((event) => event.id === id);
  const registrationsFor = (id) => state.registrations.filter((registration) => registration.eventId === id);
  const upcoming = [...state.events].filter((event) => event.date >= dateIn(0)).sort((a, b) => a.date.localeCompare(b.date));
  const sectionMatches = sectionSearch.trim()
    ? navItems.filter(([, label]) => label.toLowerCase().includes(sectionSearch.trim().toLowerCase()))
    : [];

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
  async function resetDemo() {
    if (!window.confirm("Reset all demo data to the original seed?")) return;
    const reset = initialState();
    if (!await commitState(reset)) return;
    if (!await commitChat([])) return;
    setSearch("");
    setSelectedEvent("e1");
    notify("Demo data reset.");
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
    const customer = existing || {
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
      customers: existing ? current.customers : [...current.customers, customer],
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
  async function setCampaignStatus(campaign, status) {
    const saved = await commitState((s) => ({
      ...s,
      campaigns: s.campaigns.map((item) => item.id === campaign.id ? { ...item, status } : item),
      activity: [{ id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-campaign-status`, type: "Campaign", message: `${status === "Sent (simulated)" ? "SIMULATED send (no email sent): " : `Campaign moved to ${status}: `}${campaign.name}`, status: status === "Sent (simulated)" ? "Simulated" : "Success", createdAt: Date.now() }, ...s.activity],
    }));
    if (!saved) return;
    notify(status === "Sent (simulated)" ? "Simulated send — no email was sent." : `Campaign → ${status}`);
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
      notify("No eligible attendees yet. Register real attendees for the linked event first; sample demo attendees are excluded.");
      return;
    }
    const confirmed = window.confirm(
      `Send "${campaign.name}" to ${emails.size} attendee${emails.size === 1 ? "" : "s"} registered for "${event?.title || "the linked event"}"? This sends real email and cannot be undone. Sample demo attendees are excluded.`,
    );
    if (!confirmed) return;

    setSendingCampaignId(campaign.id);
    try {
      const result = await sendCampaignEmail(campaign.id);
      const { state: latestState, chat: latestChat } = await loadWorkspace(initialState());
      stateRef.current = latestState;
      setState(latestState);
      chatRef.current = latestChat;
      setChat(latestChat);
      if (result.status === "Sent") {
        notify(`Campaign sent to ${result.sent} attendee${result.sent === 1 ? "" : "s"}.`);
      } else if (result.status === "Delivery needs review") {
        notify(`Delivery needs review: ${result.sent} confirmed sent, ${result.failed} not confirmed. Check Resend and Supabase logs; do not retry blindly.`);
      } else {
        notify(`No emails were confirmed as sent. ${result.error || "Review the campaign and provider settings, then try again."}`);
      }
    } catch (error) {
      try {
        const { state: latestState } = await loadWorkspace(initialState());
        stateRef.current = latestState;
        setState(latestState);
      } catch {
        // Keep the current view available if the follow-up refresh also fails.
      }
      notify(error instanceof Error ? `Campaign could not be sent: ${error.message}` : "Campaign could not be sent. Check the Supabase function logs.");
    } finally {
      setSendingCampaignId("");
    }
  }
  async function saveLandingPage() {
    if (!selectedEvent || !pageDraft) return;
    const saved = await commitState((s) => ({
      ...s,
      events: s.events.map((event) => event.id === selectedEvent ? { ...event, page: pageDraft } : event),
      activity: [{ id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-website`, type: "Website", message: `Landing page saved for ${eventById(selectedEvent)?.title}`, status: "Success", createdAt: Date.now() }, ...s.activity],
    }));
    if (!saved) return;
    notify("Landing page saved.");
  }
  async function runCommand(text = command) {
    const clean = text.trim();
    if (!clean || busy) return;
    setCommand("");
    if (!await appendChat({ role: "user", text: clean })) return;
    await log("AI", `Command received: ${clean.slice(0, 70)}`, "Simulated");
    if (!/webinar|event|workshop/i.test(clean)) {
      await appendChat({
        role: "assistant",
        text: 'This demo can run a scripted event workflow. Try: "Create a product webinar, prepare its registration page, add registrants to CRM, and draft a reminder campaign."',
      });
      return;
    }
    setBusy(true);
    const match = clean.match(/create (?:a|an) ([a-z0-9 -]+?) (webinar|workshop|event)/i);
    const title = match ? `${match[1]} ${match[2]}`.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Product Webinar";
    const event = makeEvent(`e${state.counter + 1}`, title, 14, "16:00", 100, "Created via AI Command Center demo workflow.");
    const demoPeople = [["Ishaan Verma", "ishaan@cloudnine.io"], ["Tara Joshi", "tara@helixworks.com"], ["Neil D'Souza", "neil@harborlane.co"]];
    const freshCustomers = demoPeople.map(([name, email], index) => ({
      id: `c${state.counter + index + 2}`, name, email, status: "Lead", source: "Event registration", isDemo: true,
    }));
    const newRegistrations = freshCustomers.map((customer, index) => ({
      id: `REG-${1100 + state.counter * 3 + index}`, customerId: customer.id, eventId: event.id, createdAt: Date.now(), isDemo: true,
    }));
    const campaign = {
      id: `m${state.counter + 2}`,
      name: `${title} reminder`,
      eventId: event.id,
      subject: "Reminder: {{event}}",
      body: `Hi {{name}},\n\n${title} is on ${formatDate(event.date)}. Your seat is confirmed — see you there!\n\nTeam Kairos`,
      status: "Draft",
    };
    const saved = await commitState((s) => ({
      ...s,
      counter: s.counter + 5,
      events: [...s.events, event],
      customers: [...s.customers, ...freshCustomers],
      registrations: [...s.registrations, ...newRegistrations],
      campaigns: [...s.campaigns, campaign],
      activity: [
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-ai`, type: "AI", message: "Simulated reminder copy generated", status: "Simulated", createdAt: Date.now() },
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-campaign`, type: "Campaign", message: `Campaign draft created by AI workflow: ${campaign.name}`, status: "Success", createdAt: Date.now() },
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-website`, type: "Website", message: `Landing page ready for ${title}`, status: "Success", createdAt: Date.now() },
        { id: globalThis.crypto?.randomUUID?.() || `activity-${Date.now()}-event`, type: "Event", message: `Event created by AI workflow: ${title}`, status: "Success", createdAt: Date.now() },
        ...s.activity,
      ],
    }));
    if (!saved) {
      setBusy(false);
      return;
    }
    const assistantReply = {
      role: "assistant",
      text: "Workflow complete. The event, CRM registrations, landing page, and campaign draft are available in their respective sections. AI copy and messaging are simulated.",
      steps: [
        ["Create event", "Success"],
        ["Prepare registration page", "Success"],
        ["Add registrants to CRM", "Success"],
        ["Draft reminder campaign", "Success"],
        ["Write reminder copy with AI", "Simulated"],
      ],
    };
    await appendChat(assistantReply);
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
    const lastWeek = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today.getTime() - (6 - index) * DAY);
      return {
        label: day.toLocaleDateString("en-IN", { weekday: "short" }),
        count: state.registrations.filter((registration) => new Date(registration.createdAt).toDateString() === day.toDateString()).length,
      };
    });
    const max = Math.max(3, ...lastWeek.map((day) => day.count));
    const countLog = (type, status) => state.activity.filter((item) => item.type === type && (!status || item.status === status)).length;
    const approvalQueue = state.campaigns.filter((campaign) => ["Pending approval", "Ready"].includes(campaign.status));
    const kpis = [
      ["Total customers", state.customers.length, `${state.customers.filter((customer) => customer.status === "Lead").length} leads`, "violet", "M16 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 4-6 8-6s8 2 8 6"],
      ["Upcoming webinars", upcoming.length, `Next: ${upcoming[0] ? formatDate(upcoming[0].date) : "—"}`, "cyan", "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"],
      ["Total registrations", state.registrations.length, `Across ${state.events.length} events`, "amber", "M4 18V6m0 12h16M8 14l3-4 3 2 5-6"],
      ["Active campaigns", state.campaigns.filter((campaign) => !campaign.status.startsWith("Sent" )).length, `${state.campaigns.filter((campaign) => campaign.status === "Ready").length} ready`, "rose", "M3 11v3l14 6V5L3 11zM17 9h3v6h-3"],
    ];
    const workflows = [
      ["Registration → CRM sync", `${countLog("CRM", "Success")} synced`, "Success"],
      ["Campaigns awaiting approval", `${state.campaigns.filter((campaign) => campaign.status === "Pending approval").length} pending`, "Pending"],
      ["AI command runs", `${countLog("AI")} runs`, "Simulated"],
      ["Errors / blocked actions", `${countLog("Error") + countLog("Registration", "Error")} logged`, countLog("Error") + countLog("Registration", "Error") ? "Error" : "Success"],
    ];
    return <>
      <PageHeader title="AI Workflow Command Center" description="Monitor routing, registrations, approvals, and workspace activity in one place." action={<button className="btn overview-action" onClick={() => openEventForm()}>＋ New event</button>} />
      <div className="grid kpi-grid">{kpis.map(([label, value, helper, color, path]) => <div className={`card kpi ${color}`} key={label}><span className="kpi-icon"><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg></span><span className="kpi-copy"><small>{label}</small><b>{value}</b><small>{helper}</small></span><i className="kpi-orb" /></div>)}</div>
      <div className="grid dashboard-primary top-gap">
        <section className="card route-card"><div className="section-heading"><div><span className="eyebrow">WORKSPACE AUTOMATION</span><h2>Workflow routing map</h2></div><span className="live-indicator">Demo flow</span></div>
          <WorkflowRoutingMap />
          <div className="route-legend"><span><i className="legend-violet" />Registration path</span><span><i className="legend-blue" />CRM sync</span><span><i className="legend-teal" />Approval checkpoint</span><small>Illustrative routing · actions use workspace data</small></div>
        </section>
        <section className="card approval-queue"><div className="section-heading"><div><span className="eyebrow">HUMAN REVIEW</span><h2>Campaign approval queue</h2></div><span className="queue-count">{approvalQueue.length} open</span></div>
          {approvalQueue.length ? approvalQueue.slice(0, 4).map((campaign) => <div className="approval-row" key={campaign.id}><span className="approval-mark">✦</span><span className="approval-copy"><b>{campaign.name}</b><small>{eventById(campaign.eventId)?.title || "Campaign review"}</small></span><Pill>{campaign.status}</Pill>{campaign.status === "Pending approval" ? <button className="queue-action" onClick={() => setCampaignStatus(campaign, "Ready")}>Approve</button> : <button className="queue-action secondary" onClick={() => navigate("marketing")}>Review</button>}</div>) : <Empty>No campaigns are awaiting review.</Empty>}
          <button className="text-button queue-link" onClick={() => navigate("marketing")}>Open Marketing <span>↗</span></button>
          <div className="queue-footnote"><span className="status-dot" /> Approval stays manual; email delivery requires a separate confirmation.</div>
        </section>
      </div>
      <div className="grid two-column top-gap">
        <section className="card"><div className="section-heading"><div><span className="eyebrow">PERFORMANCE</span><h2>Registration trend</h2></div><span className="subtle">Last 7 days · workspace records</span></div>
          <div className="chart">{lastWeek.map((day) => <div className="chart-col" key={day.label}><div className="chart-value">{day.count || ""}</div><div className="chart-bar" style={{ height: `${Math.max(7, (day.count / max) * 126)}px` }} /><small>{day.label}</small></div>)}</div>
        </section>
        <section className="card"><div className="section-heading"><div><span className="eyebrow">WORKFLOW HEALTH</span><h2>Workspace status</h2></div><span className="live-indicator">Session</span></div>
          {workflows.map(([label, detail, status]) => <div className="list-row" key={label}><span><b>{label}</b><small>{detail}</small></span><Pill>{status}</Pill></div>)}
        </section>
      </div>
      <div className="grid two-column top-gap">
        <section className="card"><div className="section-heading"><div><span className="eyebrow">WORKSPACE FEED</span><h2>Recent activity</h2></div><button className="text-button" onClick={() => navigate("log")}>View all <span>↗</span></button></div>
          {state.activity.slice(0, 5).map((item, index) => <div className="list-row" key={`${item.createdAt}-${index}`}><span><b>{item.message}</b><small>{item.type} · {timeAgo(item.createdAt)}</small></span><Pill>{item.status}</Pill></div>)}
          {!state.activity.length && <Empty>No recent activity.</Empty>}
        </section>
        <section className="card"><div className="section-heading"><div><span className="eyebrow">COMING UP</span><h2>Upcoming events</h2></div><button className="text-button" onClick={() => navigate("events")}>Manage <span>↗</span></button></div>
          {upcoming.length ? upcoming.slice(0, 3).map((event) => <div className="event-progress" key={event.id}><div className="list-row compact"><span><b>{event.title}</b><small>{formatDate(event.date)}</small></span><small>{registrationsFor(event.id).length} / {event.capacity}</small></div><div className="progress"><i style={{ width: `${Math.min(100, registrationsFor(event.id).length / event.capacity * 100)}%` }} /></div></div>) : <Empty>No upcoming events.</Empty>}
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
      <PageHeader title="CRM" description="Every event registration is automatically connected to your customer records." />
      <section className="card table-card"><div className="table-tools"><div><h2>Customers</h2><small className="subtle">{filtered.length} of {state.customers.length} customers</small></div><input className="search" placeholder="Search name, email, status…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Registration history</th><th>Status</th><th>Source</th></tr></thead><tbody>{filtered.map((customer) => {
          const history = state.registrations.filter((registration) => registration.customerId === customer.id);
          return <tr key={customer.id}><td><b>{customer.name}</b></td><td>{customer.email}</td><td>{history.length ? history.map((item) => <div key={item.id}>{eventById(item.eventId)?.title}<small className="cell-muted"> · {timeAgo(item.createdAt)}</small></div>) : <span className="subtle">No events yet</span>}</td><td><Pill>{customer.status}</Pill></td><td>{customer.source}</td></tr>;
        })}</tbody></table>{!filtered.length && <Empty>No matching customers.</Empty>}</div>
      </section>
    </>;
  }

  function marketingPage() {
    const startCampaign = (campaign = null) => {
      setCampaignForm(campaign || { name: "", eventId: state.events[0]?.id || "", subject: "", body: "", status: "Draft" });
    };
    return <>
      <PageHeader title="Marketing" description="Build on-brand event campaigns with a human approval step." action={<button className="btn" onClick={() => startCampaign()}>＋ New campaign</button>} />
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
    return <>
      <PageHeader title="Website Builder" description="Design a landing page for each event. Changes update the preview instantly." />
      <section className="card builder-card"><div className="builder-controls"><label>Choose event<select value={event.id} onChange={(change) => { setSelectedEvent(change.target.value); setPageDraft(null); }}>{state.events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><span className="live-indicator">Preview live</span></div><div className="builder-grid"><div className="builder-form"><span className="eyebrow">PAGE CONTENT</span><h2>Make it yours</h2><label>Headline<input value={draft.headline} placeholder={event.title} onChange={(change) => setPageDraft({ ...draft, headline: change.target.value })} /></label><label>Supporting text<textarea value={draft.subheading} placeholder={event.description} onChange={(change) => setPageDraft({ ...draft, subheading: change.target.value })} /></label><label>Button label<input value={draft.cta} placeholder="Reserve my seat" onChange={(change) => setPageDraft({ ...draft, cta: change.target.value })} /></label><button className="btn" onClick={saveLandingPage}>Save landing page</button></div><div className="landing-preview"><div className="preview-browser"><span /><span /><span /><small>kairos.events/{event.id}</small></div><div className="landing-hero"><span className="eyebrow">YOU'RE INVITED</span><span className="preview-date">{formatDate(event.date)} · {event.time}</span><h2>{draft.headline || event.title}</h2><p>{draft.subheading || event.description}</p><button className="btn">{draft.cta || "Register"}</button><div className="preview-capacity">{registrationsFor(event.id).length} / {event.capacity} seats reserved</div></div></div></div></section>
    </>;
  }

  function subscriptionPage() {
    const plans = [
      { name: "Starter", price: 0, caption: "For getting started", features: ["1 workspace", "3 events / month", "Basic CRM"] },
      { name: "Growth", price: 49, caption: "For teams in motion", features: ["Unlimited events", "Automated CRM sync", "Marketing workflows"] },
      { name: "Scale", price: 149, caption: "For growing operations", features: ["Everything in Growth", "Advanced analytics", "Priority support"] },
    ];
    return <>
      <PageHeader title="Subscriptions" description="Manage your workspace plan and billing preferences." action={<Pill>{state.subscriptionStatus}</Pill>} />
      <section className="card billing-summary"><div><span className="eyebrow">CURRENT PLAN</span><h2>{state.plan} <span className="plan-price">${plans.find((plan) => plan.name === state.plan)?.price || 0}<small> / month</small></span></h2><p className="sub">Your next renewal is on {formatDate(dateIn(30))}.</p></div><div className="billing-switch"><button className={state.billing === "monthly" ? "selected" : ""} onClick={() => commitState((current) => ({ ...current, billing: "monthly" }))}>Monthly</button><button className={state.billing === "yearly" ? "selected" : ""} onClick={() => commitState((current) => ({ ...current, billing: "yearly" }))}>Yearly <span>−20%</span></button></div></section>
      <div className="grid plan-grid">{plans.map((plan) => <article className={`card plan-card ${state.plan === plan.name ? "current" : ""}`} key={plan.name}>{plan.name === "Growth" && <span className="plan-ribbon">POPULAR</span>}<span className="eyebrow">{plan.caption}</span><h2>{plan.name}</h2><div className="plan-price">${plan.price}<small> / month</small></div><div className="plan-features">{plan.features.map((feature) => <div key={feature}><span>✓</span>{feature}</div>)}</div><button className={`btn ${state.plan === plan.name ? "secondary" : ""}`} onClick={async () => { const saved = await commitState((current) => ({ ...current, plan: plan.name, subscriptionStatus: "Active" })); if (saved) { await log("Subscription", `SIMULATED plan switch to ${plan.name}`, "Simulated"); notify("Plan switched (simulated)."); } }}>{state.plan === plan.name ? "Current plan" : "Choose plan"}</button></article>)}</div>
      <section className="card simulation-panel"><div><span className="eyebrow">DEMO CONTROLS</span><h2>Subscription status</h2><p className="sub">These controls simulate subscription events; no payment is processed.</p></div><div className="button-row"><button className="btn secondary" onClick={() => commitState((current) => ({ ...current, subscriptionStatus: current.subscriptionStatus === "Trial" ? "Active" : "Trial" }))}>Toggle trial</button><button className="btn ghost" onClick={async () => { if (await commitState((current) => ({ ...current, subscriptionStatus: "Past due" }))) notify("Simulated failed payment."); }}>Simulate failed payment</button></div></section>
    </>;
  }

  function activityPage() {
    return <>
      <PageHeader title="Workflow Activity" description="A chronological record of actions in this demo workspace." />
      <section className="card table-card"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent events</h2></div><span className="subtle">{state.activity.length} activities</span></div><div className="table-scroll"><table><thead><tr><th>Time</th><th>Type</th><th>Event</th><th>Status</th></tr></thead><tbody>{state.activity.map((item, index) => <tr key={`${item.createdAt}-${index}`}><td>{new Date(item.createdAt).toLocaleString("en-IN")}</td><td>{item.type}</td><td>{item.message}</td><td><Pill>{item.status}</Pill></td></tr>)}</tbody></table>{!state.activity.length && <Empty>No activity recorded yet.</Empty>}</div></section>
    </>;
  }

  function aiPage() {
    return <>
      <PageHeader title="AI Command Center" description="Describe a workflow and watch your workspace state update." />
      <div className="ai-layout"><section className="card ai-chat"><div className="chat-header"><div className="ai-avatar">✦</div><div><b>NEXUS Copilot</b><small>Scripted workflow assistant · demo mode</small></div><span className="live-indicator">Ready</span></div><div className="chat-messages">{chat.length ? chat.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><div className="message-bubble"><p>{message.text}</p>{message.steps && <div className="steps">{message.steps.map(([step, status], stepIndex) => <div className="step-row" key={step}><span>{String(stepIndex + 1).padStart(2, "0")}</span><b>{step}</b><Pill>{status}</Pill></div>)}</div>}</div></div>) : <div className="chat-welcome"><div className="ai-avatar large">✦</div><h2>Your operations, orchestrated.</h2><p>Ask NEXUS to coordinate an event workflow across your workspace.</p><button className="suggestion" onClick={() => setCommand("Create a product webinar, prepare its registration page, add registrants to CRM, and draft a reminder campaign.")}>Create a webinar and prepare its launch workflow <span>↗</span></button></div>}</div><div className="composer"><input value={command} disabled={busy} placeholder="Describe what you want to accomplish…" onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runCommand(); }} /><button className="btn" disabled={busy || !command.trim()} onClick={() => runCommand()}>{busy ? "Working…" : "Run workflow"} <span>↗</span></button></div><small className="ai-disclaimer">Demo only. No real AI model or email delivery is connected.</small></section><aside className="card ai-info"><span className="eyebrow">HOW IT WORKS</span><h2>One prompt. Connected actions.</h2><p className="sub">NEXUS can coordinate this sample flow across your workspace data.</p>{["Create a webinar event", "Prepare the registration page", "Add attendees to CRM", "Draft an approval-ready campaign"].map((step, index) => <div className="info-step" key={step}><span>{index + 1}</span>{step}</div>)}</aside></div>
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

  return <div className="app-shell" data-theme={theme}>
    {mobileMenu && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? "open" : ""}`}><a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); navigate("overview"); }}><span className="brand-mark">N</span><span><b>NEXUS</b><small>AI BUSINESS PLATFORM</small></span></a><div className="workspace-chip"><span className="workspace-icon">⌘</span><span><small>WORKSPACE</small><b>Kairos Demo Workspace</b></span><span className="chevron">⌄</span></div><div className="nav-label">WORKSPACE</div><nav>{navItems.map(([id, label, path]) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => navigate(id)}>{icon(path)}<span>{label}</span>{view === id && <i />}</button>)}</nav><div className="sidebar-footer"><div className="workspace-status"><span className="status-dot" /><span>All systems operational</span></div><button className="reset-button" onClick={resetDemo}>↺ Reset demo data</button><div className="profile"><span className="profile-avatar">{(user.user_metadata?.full_name || user.email || "A").slice(0, 1).toUpperCase()}</span><span><b>{user.user_metadata?.full_name || user.email?.split("@")[0] || "Account"}</b><small>{user.email}</small></span><button className="signout-button" title="Log out of your account" onClick={signOut}>Log out</button></div></div></aside>
    <main className="main-content"><header className="topbar"><button className="menu-toggle" aria-label="Toggle menu" onClick={() => setMobileMenu(!mobileMenu)}>☰</button><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{navItems.find(([id]) => id === view)?.[1]}</strong></div><div className="global-search"><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><input aria-label="Search workspace sections" placeholder="Search sections…" value={sectionSearch} onChange={(event) => setSectionSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSectionSearch(""); if (event.key === "Enter" && sectionMatches[0]) { navigate(sectionMatches[0][0]); setSectionSearch(""); } }} />{sectionSearch.trim() && <div className="search-results" role="listbox">{sectionMatches.length ? sectionMatches.map(([id, label, path]) => <button role="option" aria-selected="false" key={id} onClick={() => { navigate(id); setSectionSearch(""); }}>{icon(path)}<span>{label}</span><small>↵</small></button>) : <div className="search-empty">No matching sections</div>}</div>}</div><div className="topbar-right"><button className="toolbar-icon" aria-label="Open workflow activity" title="Workflow activity" onClick={() => navigate("log")}><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><button className="btn topbar-create" onClick={() => openEventForm()}>＋ New event</button><span className="environment-badge"><i /> Secure account</span><span className="top-avatar">{(user.user_metadata?.full_name || user.email || "A").slice(0, 1).toUpperCase()}</span><button className="theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "light"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? "☼" : "☾"}<span>{theme === "dark" ? "Light" : "Dark"}</span></button></div></header><div className={`page-content view-${view}`}>{pages[view]()}</div><footer className="app-footer"><span>NEXUS <i>·</i> AI Business Operating Platform</span><span>Workspace data · Supabase · Resend email · Simulated payments and AI</span></footer></main>
    {modal && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>{modalContent()}</div>}
    {toast && <div className="toast-message"><span>✓</span>{toast}</div>}
  </div>;
}
