import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// WHY: We test route handler logic (validation, prompt construction, error handling),
// not the Anthropic SDK itself. Using the route's _setClient hook to inject a mock
// client avoids fragile vi.mock interop between ESM tests and CJS route modules.

const express = require('express');
const narrateRoutes = require('../../src/routes/narrate');

const mockCreate = vi.fn();
const mockClient = { messages: { create: mockCreate } };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/narrate', narrateRoutes);
  return app;
}

function validPayload() {
  return {
    property: { name: 'Test Hotel', type: 'hotel', rooms: 100, floors: 5, elevators: 1, market: 'Miami' },
    facility: { fbOutlets: 2, eventSpaceSqFt: 0, outdoorAmenities: [], surfaces: ['carpet'] },
    fleet: [
      {
        goalId: 'goal-lobby',
        serviceLine: 'Lobby Floor Care',
        type: 'cleaning',
        savings: 3500,
        robot: { company: 'Keenon', model_name: 'C40', image_url: '', primary_use_cases: [] },
        score: 87,
        monthlyEstimate: 2200,
      },
    ],
  };
}

describe('POST /api/narrate', () => {
  let app;

  beforeEach(() => {
    mockCreate.mockReset();
    // WHY: Inject the mock client before each test so the route uses it
    // instead of creating a real Anthropic instance.
    narrateRoutes._setClient(mockClient);
    app = buildApp();
  });

  afterEach(() => {
    narrateRoutes._resetClient();
    servers.forEach(s => s.close());
    servers.length = 0;
  });

  it('returns 400 when property.name is missing', async () => {
    const baseUrl = await startServer(app);
    const res = await fetch(`${baseUrl}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property: {}, fleet: [{ goalId: 'x' }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/property\.name/);
  });

  it('returns 400 when fleet is empty', async () => {
    const baseUrl = await startServer(app);
    const res = await fetch(`${baseUrl}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property: { name: 'Test' }, fleet: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-empty/);
  });

  it('returns 400 when fleet exceeds 15 robots', async () => {
    const bigFleet = Array.from({ length: 16 }, (_, i) => ({
      goalId: `goal-${i}`, serviceLine: `Line ${i}`, type: 'cleaning',
      savings: 1000, robot: { company: 'X', model_name: 'Y' }, score: 50, monthlyEstimate: 1000,
    }));
    const baseUrl = await startServer(app);
    const res = await fetch(`${baseUrl}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property: { name: 'Test' }, fleet: bigFleet }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceed/);
  });

  it('returns 503 when API key is not configured', async () => {
    narrateRoutes._resetClient();
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const baseUrl = await startServer(app);
    const res = await fetch(`${baseUrl}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/);

    // Restore env for subsequent tests
    process.env.ANTHROPIC_API_KEY = saved;
    narrateRoutes._setClient(mockClient);
  });

  it('returns narrative JSON on success', async () => {
    const narrative = {
      intro: 'Test Hotel is a 100-room property...',
      headline: 'Watch the operation transform.',
      valueProp: 'Every robot reclaims hours...',
      robots: [{ goalId: 'goal-lobby', roleDescription: 'Floor scrubber', unlockNarrative: 'Clean floors', savingsCapture: 'EVS shift' }],
      tierName: 'Pilot',
      tierNarrative: 'Starting with one robot...',
      phases: [{ name: 'Pilot', timeframe: 'Month 1', description: 'One C40 overnight.' }],
    };
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(narrative) }],
    });

    const baseUrl = await startServer(app);
    const res = await fetch(`${baseUrl}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intro).toBe(narrative.intro);
    expect(body.robots).toHaveLength(1);
    expect(body.robots[0].goalId).toBe('goal-lobby');
  });

  it('returns 502 when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'This is not JSON' }],
    });

    const baseUrl = await startServer(app);
    const res = await fetch(`${baseUrl}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/parse/);
    expect(body.raw).toBe('This is not JSON');
  });

  it('returns 502 when Claude API throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('rate_limit_exceeded'));

    const baseUrl = await startServer(app);
    const res = await fetch(`${baseUrl}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toMatch(/rate_limit/);
  });
});

// WHY: Helper that starts the Express app on a random port and returns the base URL.
// Using node's native http.createServer to avoid port conflicts between test runs.
const http = require('http');
const servers = [];

async function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    servers.push(server);
    server.listen(0, () => {
      const port = server.address().port;
      resolve(`http://localhost:${port}`);
    });
  });
}
