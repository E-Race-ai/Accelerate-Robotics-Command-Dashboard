import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { AmapiClient } = require('../../src/services/mdm-amapi');

// We don't try to mock the googleapis package — vi.mock + require()
// interop is finicky. Instead, the test substitutes the lazy _service()
// method on each AmapiClient instance with a fake. This is the same
// boundary we'd want to mock anyway: AmapiClient → google.androidmanagement().
// The constructor is pure (just stores config); _service() is what would
// otherwise hit the network.

function makeFakeService() {
  return {
    enterprises: {
      enrollmentTokens: {
        create: vi.fn().mockResolvedValue({ data: {} }),
        list: vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue({ data: {} }),
      },
      devices: {
        list: vi.fn().mockResolvedValue({ data: {} }),
        get: vi.fn().mockResolvedValue({ data: {} }),
        issueCommand: vi.fn().mockResolvedValue({ data: {} }),
      },
      policies: {
        get: vi.fn().mockResolvedValue({ data: {} }),
        patch: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
  };
}

function makeClient(opts = {}) {
  const c = new AmapiClient({ enterpriseName: 'enterprises/LC1', ...opts });
  const svc = makeFakeService();
  c._service = async () => svc;
  return { c, svc };
}

describe('AmapiClient', () => {
  describe('constructor validation', () => {
    it('rejects missing enterpriseName', () => {
      expect(() => new AmapiClient({})).toThrow(/invalid enterpriseName/);
    });

    it('rejects malformed enterpriseName', () => {
      expect(() => new AmapiClient({ enterpriseName: 'enterprises/bad-id!' })).toThrow();
      expect(() => new AmapiClient({ enterpriseName: 'not-an-enterprise' })).toThrow();
      expect(() => new AmapiClient({ enterpriseName: '' })).toThrow();
    });

    it('accepts a well-formed enterpriseName', () => {
      const c = new AmapiClient({ enterpriseName: 'enterprises/LC00sj3op5' });
      expect(c.enterpriseName).toBe('enterprises/LC00sj3op5');
      expect(c.policyId).toBe('default');
    });

    it('honors custom policyId', () => {
      const c = new AmapiClient({ enterpriseName: 'enterprises/LCABC', policyId: 'kiosk' });
      expect(c.policyId).toBe('kiosk');
    });
  });

  describe('resource-name helpers', () => {
    const c = new AmapiClient({ enterpriseName: 'enterprises/LC123' });

    it('builds policyName', () => {
      expect(c.policyName()).toBe('enterprises/LC123/policies/default');
    });

    it('builds deviceName', () => {
      expect(c.deviceName('abc-xyz')).toBe('enterprises/LC123/devices/abc-xyz');
    });
  });

  describe('createEnrollmentToken', () => {
    it('passes the right params to AMAPI and forces fully-managed mode', async () => {
      // WHY: PERSONAL_USAGE_DISALLOWED is the critical flag for kiosk-mode
      // robot tablets. If a refactor accidentally drops it, devices
      // provision in personal mode and the kiosk policy can't apply.
      const { c, svc } = makeClient();
      svc.enterprises.enrollmentTokens.create.mockResolvedValue({
        data: { name: 'enterprises/LC1/enrollmentTokens/t1', value: 'v1', qrCode: '{}', expirationTimestamp: 'z' },
      });
      const tok = await c.createEnrollmentToken();
      const args = svc.enterprises.enrollmentTokens.create.mock.calls[0][0];
      expect(args.parent).toBe('enterprises/LC1');
      expect(args.requestBody.policyName).toBe('enterprises/LC1/policies/default');
      expect(args.requestBody.allowPersonalUsage).toBe('PERSONAL_USAGE_DISALLOWED');
      expect(args.requestBody.duration).toMatch(/^\d+s$/);
      expect(tok.name).toContain('enrollmentTokens/');
    });

    it('honors custom duration', async () => {
      const { c, svc } = makeClient();
      svc.enterprises.enrollmentTokens.create.mockResolvedValue({ data: { name: 'x', value: 'y', qrCode: '{}', expirationTimestamp: 'z' } });
      await c.createEnrollmentToken({ durationSeconds: 600 });
      expect(svc.enterprises.enrollmentTokens.create.mock.calls[0][0].requestBody.duration).toBe('600s');
    });
  });

  describe('issueCommand', () => {
    it('targets the right device and command type', async () => {
      const { c, svc } = makeClient();
      svc.enterprises.devices.issueCommand.mockResolvedValue({ data: { name: 'enterprises/LC1/devices/d1/operations/op-1' } });
      const op = await c.issueCommand('d1', 'LOCK');
      const args = svc.enterprises.devices.issueCommand.mock.calls[0][0];
      expect(args.name).toBe('enterprises/LC1/devices/d1');
      expect(args.requestBody.type).toBe('LOCK');
      expect(op.name).toContain('operations/');
    });
  });

  describe('listDevices', () => {
    it('returns the devices array, defaulting to empty when AMAPI omits it', async () => {
      const { c, svc } = makeClient();
      svc.enterprises.devices.list.mockResolvedValueOnce({ data: { devices: [{ name: 'a' }] } });
      expect(await c.listDevices()).toEqual([{ name: 'a' }]);
      svc.enterprises.devices.list.mockResolvedValueOnce({ data: {} });
      expect(await c.listDevices()).toEqual([]);
    });
  });

  describe('ensureDefaultPolicy', () => {
    it('PATCHes the policy with the minimal default body', async () => {
      const { c, svc } = makeClient();
      svc.enterprises.policies.patch.mockResolvedValue({ data: { name: 'p1' } });
      await c.ensureDefaultPolicy();
      const args = svc.enterprises.policies.patch.mock.calls[0][0];
      expect(args.name).toBe('enterprises/LC1/policies/default');
      expect(args.requestBody.passwordRequirements.passwordMinimumLength).toBe(6);
      expect(args.requestBody.debuggingFeaturesAllowed).toBe(false);
    });
  });
});
