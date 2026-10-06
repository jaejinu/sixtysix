import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { auditReason } from './audit.js';
const { options } = createRequire(import.meta.url)('../../../backend/scripts/cleanup-auth.cjs');
describe('authentication operations input', () => {
  it('accepts only fixed reason codes, never an error message or SQL code', () => {
    expect(auditReason({code:'FORBIDDEN',message:'secret'})).toBe('FORBIDDEN');
    expect(auditReason(new Error('secret'))).toBeUndefined();
    expect(auditReason({code:'23514'})).toBeUndefined();
    expect(auditReason({code:'token=secret'})).toBeUndefined();
  });
  it('defaults cleanup to dry-run and requires an explicit apply flag', () => {
    expect(options([])).toEqual({batch:100,dryRun:true});
    expect(options(['--apply','--batch=20'])).toEqual({batch:20,dryRun:false});
  });
  it.each([['--batch=0'],['--batch=501'],['--cutoff=2099-01-01'],['--apply','--apply'],['--batch=1','--batch=2']])('rejects unsafe cleanup options %s', (...args) => {
    expect(() => options(args)).toThrow('INVALID_CLEANUP_OPTIONS');
  });
});
