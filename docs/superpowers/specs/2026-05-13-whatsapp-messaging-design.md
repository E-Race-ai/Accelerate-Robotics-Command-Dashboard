# WhatsApp Hub Messaging — Design Spec

**Date:** 2026-05-13
**Status:** Approved
**Author:** Celia Simon + Claude

## Problem

The WhatsApp Hub page is a directory of group chats but has no way to actually send messages. The team wants to compose and send WhatsApp messages directly from the dashboard — both to groups and individual contacts — using their own WhatsApp accounts (no shared API).

## Solution

Add messaging capabilities to the existing WhatsApp Hub page using `wa.me` deep links that open WhatsApp Web/Desktop with pre-filled messages. Three additions:

1. **Quick Compose Bar** — search contacts, compose a message, launch WhatsApp
2. **Group Card "Open Chat" button** — jump straight into a group conversation
3. **User-managed Message Templates** — reusable pre-written messages

## Approach

Use `wa.me/<phone>?text=<encoded>` deep links. No WhatsApp Business API. Each team member uses their own WhatsApp account — the dashboard is a launcher, not a messaging client.

---

## 1. Quick Compose Bar

Positioned at the top of the WhatsApp Hub page, above the search/filter row.

### UI

- **Contact picker** — autocomplete input that searches across:
  - Facility contacts (from deals — name, phone, role)
  - Prospects (pipeline prospects with phone numbers)
  - Manual phone number entry (type any number)
- **Message compose** — textarea for the message body
- **Template dropdown** — select a pre-written template to auto-fill the compose field; text remains editable before sending
- **"Send via WhatsApp" button** — opens `https://wa.me/<number>?text=<encoded message>` in a new tab
- **"Manage Templates" link** — opens the template manager modal

### Contact Search

New endpoint: `GET /api/contacts/search?q=<term>`

Searches across:
- `contacts` table (facility contacts) — matches on name, email, phone
- `prospects` table — matches on name, phone
- Returns: `{ name, phone, source, context }` (source = "contact" | "prospect", context = facility/deal name)
- Limited to 20 results
- Phone number is required — results without a phone number are excluded

### Phone Number Handling

- If the user types a raw phone number (digits, +, dashes, spaces), skip the search and use it directly
- Strip non-digit characters (except leading +) before building the wa.me URL
- No country code validation — trust the user input

---

## 2. Group Card Enhancement

### New Field

Add `group_chat_url` to the `whatsapp_groups` table:
- Optional TEXT field
- Stores the direct chat URL (e.g., `https://web.whatsapp.com/...` or WhatsApp desktop deep link)
- Added to the Add/Edit Group modal as a new input field

### Card Button

- **"Open Chat"** button on each group card
- Opens `group_chat_url` in a new tab if set
- Falls back to `invite_url` if no chat URL exists
- Button label changes: "Open Chat" vs "Join Group" depending on which URL is available
- Hidden if neither URL is set

### Database Migration

```sql
ALTER TABLE whatsapp_groups ADD COLUMN group_chat_url TEXT;
```

Added to the CREATE TABLE for new databases and as an `additiveAlterIfMissing` migration.

---

## 3. Message Templates

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK(category IN ('general', 'follow_up', 'proposal', 'scheduling', 'introduction')),
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### API Endpoints

All under `/api/whatsapp/templates`, auth-gated:

- **GET /** — list all templates, ordered by category, name
- **POST /** — create template (name, body, category required)
- **PATCH /:id** — update template fields
- **DELETE /:id** — remove template

### Seed Templates

Pre-populate with starter templates:

| Name | Category | Body |
|------|----------|------|
| Follow-Up After Meeting | follow_up | "Hi {name}, great meeting with you today. I wanted to follow up on what we discussed regarding the robotics deployment. Let me know if you have any questions." |
| Proposal Sent | proposal | "Hi {name}, I just sent over the proposal for your review. Take a look when you get a chance and let me know your thoughts." |
| Site Walk Scheduling | scheduling | "Hi {name}, I'd like to schedule a site walk at your facility. What dates work best for you this week?" |
| Introduction | introduction | "Hi {name}, this is {sender} from Accelerate Robotics. We specialize in autonomous robot deployment for hospitality and healthcare. I'd love to discuss how we can help your operations." |
| Check-In | follow_up | "Hi {name}, just checking in to see how things are going. Let me know if there's anything you need from our side." |

### Template Manager Modal

- Opened via "Manage Templates" link in the compose bar
- Lists all templates with edit/delete buttons
- "Add Template" button at the top
- Form fields: name, category (dropdown), body (textarea)
- Same modal pattern as challenge/contact/note modals

### Template Variables

Templates can include `{name}` and `{sender}` placeholders:
- `{name}` — replaced with the selected contact's name (or left as-is if manual number entry)
- `{sender}` — replaced with the logged-in user's name/email

---

## 4. Backend Changes Summary

### New Files
- None — all routes added to existing `src/routes/whatsapp.js`

### Modified Files

| File | Change |
|------|--------|
| `src/db/database.js` | Add `whatsapp_templates` table, `group_chat_url` column migration |
| `src/routes/whatsapp.js` | Add template CRUD endpoints, seed templates on first run |
| `src/server.js` | Add contacts search route (or add to existing facilities route) |
| `pages/whatsapp-hub.html` | Add compose bar, template dropdown, template manager modal, group card chat button, edit modal chat URL field |

### New Endpoint

`GET /api/contacts/search?q=<term>` — unified contact search across facility contacts and prospects.

---

## 5. Testing

- Template CRUD integration tests
- Contact search endpoint tests (searches contacts + prospects, excludes phoneless results)
- Frontend: compose bar builds correct wa.me URL with encoded message
- Frontend: template selection populates compose field with variable substitution
- Group card "Open Chat" uses group_chat_url, falls back to invite_url
