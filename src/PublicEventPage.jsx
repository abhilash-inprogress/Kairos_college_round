import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export default function PublicEventPage({ slug }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setError("This registration page is not connected yet.");
      setLoading(false);
      return () => { active = false; };
    }
    supabase.rpc("get_public_event_by_slug", { slug_input: slug })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) throw queryError;
        if (!data) setError("This event page is unavailable.");
        else setEvent(data);
      })
      .catch(() => {
        if (active) setError("Could not load this event page. Please try again later.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [slug]);

  async function register(eventObject) {
    eventObject.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    const formElement = eventObject.currentTarget;
    const form = new FormData(formElement);
    try {
      const { data, error: registrationError } = await supabase.rpc("register_public_event_attendee", {
        slug_input: slug,
        name_input: String(form.get("name") || "").trim(),
        email_input: String(form.get("email") || "").trim().toLowerCase(),
      });
      if (registrationError) throw registrationError;
      setEvent((current) => ({ ...current, registered: data.registered, seatsRemaining: data.seatsRemaining }));
      setMessage("You're registered. We'll see you there!");
      formElement.reset();
    } catch (registrationError) {
      setError(registrationError instanceof Error ? registrationError.message : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="public-event-shell"><div className="auth-loading">Loading event…</div></main>;
  if (!event) return <main className="public-event-shell"><section className="public-event-card"><span className="eyebrow">NEXUS EVENTS</span><h1>Event unavailable</h1><p>{error}</p></section></main>;

  const page = event.page || {};
  const eventDate = new Date(`${event.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const full = event.seatsRemaining <= 0;

  return <main className="public-event-shell">
    <section className="public-event-card">
      <span className="eyebrow">YOU'RE INVITED</span>
      <h1>{page.headline || event.title}</h1>
      <p className="public-event-description">{page.subheading || event.description}</p>
      <div className="public-event-meta"><span>{eventDate}</span><span>{event.time}</span></div>
      <div className="public-event-capacity">{full ? "Event full" : `${event.seatsRemaining} seats remaining`}</div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice auth-notice" role="status">{message}</div>}
      {!full && <form className="public-event-form" onSubmit={register}>
        <label>Full name<input name="name" autoComplete="name" maxLength="120" required /></label>
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength="254" required /></label>
        <button className="btn" disabled={submitting}>{submitting ? "Registering…" : page.cta || "Register"}</button>
      </form>}
      <small className="public-event-brand">Powered by NEXUS</small>
    </section>
  </main>;
}
