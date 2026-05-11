import { describe, it, expect } from 'vitest';
import { parsePrinterState } from '../../src/routes/print-label.js';

// Real-world `lpstat -p <printer> -l` outputs captured from CUPS on macOS.
// These strings drove the bug discovery — keep them verbatim so future
// changes to the parser are pinned against real device state.

describe('parsePrinterState', () => {
  it('accepts an idle, healthy printer', () => {
    const out = 'printer JADENS_Label is idle.  enabled since Mon May 11 10:41:24 2026\n';
    expect(parsePrinterState(out, 'JADENS_Label')).toEqual({ ok: true });
  });

  it('accepts a printer that is actively printing a job', () => {
    const out = 'printer JADENS_Label now printing JADENS_Label-92.  enabled since Mon May 11 10:50:11 2026\n';
    expect(parsePrinterState(out, 'JADENS_Label')).toEqual({ ok: true });
  });

  it('rejects a printer marked offline (the bug we shipped this fix for)', () => {
    const out = [
      'printer JADENS_Label now printing JADENS_Label-86.  enabled since Mon May 11 10:37:32 2026',
      '\tThe printer is offline.',
      '',
    ].join('\n');
    const result = parsePrinterState(out, 'JADENS_Label');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/i);
    expect(result.error).toMatch(/cupsdisable JADENS_Label && cupsenable JADENS_Label/);
  });

  it('rejects a disabled printer with the cupsenable hint', () => {
    const out = 'printer JADENS_Label disabled since Mon May 11 09:00:00 2026 -\n\tPaused\n';
    const result = parsePrinterState(out, 'JADENS_Label');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/disabled/);
    expect(result.error).toMatch(/cupsenable/);
  });

  it('rejects a printer that is rejecting jobs', () => {
    const out = 'printer JADENS_Label is idle.  enabled since Mon May 11 10:00:00 2026\n\tRejecting Jobs\n';
    const result = parsePrinterState(out, 'JADENS_Label');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rejecting jobs/i);
    expect(result.error).toMatch(/cupsaccept/);
  });

  it('rejects a printer stuck waiting for the device to come back', () => {
    const out = 'printer JADENS_Label is idle.  enabled since Mon May 11 10:00:00 2026\n\tWaiting for printer to become available.\n';
    const result = parsePrinterState(out, 'JADENS_Label');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/i);
  });

  it('rejects a printer when the backend cannot connect', () => {
    const out = 'printer JADENS_Label is idle.  enabled since Mon May 11 10:00:00 2026\n\tUnable to connect to printer; will retry in 30 seconds...\n';
    const result = parsePrinterState(out, 'JADENS_Label');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/i);
  });

  it('prefers the "disabled" reason when both disabled and offline are present', () => {
    // WHY: a disabled queue won't auto-recover even if the device returns,
    // so surfacing "disabled" first leads the operator to the right fix.
    const out = 'printer JADENS_Label disabled since Mon May 11 09:00:00 2026 -\n\tThe printer is offline.\n';
    const result = parsePrinterState(out, 'JADENS_Label');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/disabled/);
  });

  it('uses the printer name passed in so error hints reference the right queue', () => {
    const out = 'printer SomeOtherPrinter is idle.  enabled since Mon May 11 10:00:00 2026\n\tThe printer is offline.\n';
    const result = parsePrinterState(out, 'SomeOtherPrinter');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('SomeOtherPrinter');
  });
});
