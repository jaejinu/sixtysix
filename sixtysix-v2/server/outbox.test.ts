import { describe,it,expect } from 'vitest';
import { createRequire } from 'node:module';
const {options}=createRequire(import.meta.url)('../../backend/scripts/process-outbox.cjs');
describe('outbox CLI',()=>{
  it('defaults to status only and caps an explicit processing batch',()=>{
    expect(options([])).toEqual({batch:20,apply:false});expect(options(['--apply','--batch=100'])).toEqual({batch:100,apply:true});
  });
  it.each([['--batch=0'],['--batch=101'],['--apply','--apply'],['--batch=1','--batch=2'],['--handler=http://example.test']])('rejects unexpected options %s',(...args)=>{
    expect(()=>options(args)).toThrow('INVALID_OUTBOX_OPTIONS');
  });
});
