import { describe,it,expect,vi,afterEach } from 'vitest';
import { createRequire } from 'node:module';
const {options,connectionString,runScheduledWork}=createRequire(import.meta.url)('../../backend/scripts/run-scheduled-work.cjs');
const {runOutbox}=createRequire(import.meta.url)('../../backend/scripts/process-outbox.cjs');
afterEach(()=>vi.restoreAllMocks());
describe('scheduled worker boundaries',()=>{
  it('defaults to a bounded status-only run',()=>{
    expect(options([])).toEqual({batch:20,apply:false});expect(options(['--apply','--batch=100'])).toEqual({batch:100,apply:true});
  });
  it.each([['--batch=0'],['--batch=101'],['--apply','--apply'],['--batch=2','--batch=3'],['--cutoff=2099-01-01']])('rejects unsafe options %s',(...args)=>expect(()=>options(args)).toThrow('INVALID_SCHEDULE_OPTIONS'));
  it('accepts only a worker URL with safe connection parameters',()=>{
    const url='postgresql://sixtysix_worker_preview:password@localhost/app?sslmode=require';expect(connectionString({WORKER_DATABASE_URL:url})).toBe(url);
    for(const env of [{APP_DATABASE_URL:url},{WORKER_DATABASE_URL:url.replace('sixtysix_worker_preview','sixtysix_runtime_preview')},{WORKER_DATABASE_URL:url+'&options=-c%20role%3Downer'},{WORKER_DATABASE_URL:'invalid'}])expect(()=>connectionString(env)).toThrow();
  });
  it('stops claiming jobs when the processing budget expires',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{status:{ready:1}}]});
    const result=await runOutbox({query},{batch:20,apply:true,deadline:Date.now()-1});
    expect(query).toHaveBeenCalledOnce();expect(query.mock.calls[0]![0]).toContain('outbox_status');expect(result.counts.delivered).toBe(0);
  });
  it('does not attempt notification delivery if the launch transaction fails',async()=>{
    const query=vi.fn().mockRejectedValue(Error('database failure'));
    await expect(runScheduledWork({query},{batch:20,apply:true})).rejects.toThrow();expect(query).toHaveBeenCalledOnce();
  });
});
