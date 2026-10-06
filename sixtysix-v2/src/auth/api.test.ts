import { describe,it,expect,vi } from 'vitest';
import { ApiError,authMessage,createAuthApi } from './api';
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers});
describe('same-origin auth client',()=>{
  it('gets CSRF before writes, includes cookies and preserves leading-zero codes',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(json({csrfToken:'csrf'})).mockResolvedValueOnce(json({purpose:'login',nextAction:'SIGNED_IN',intentId:null}));
    await createAuthApi(transport).verify('challenge','001234');
    expect(transport.mock.calls[0]?.[0]).toBe('/v1/auth/context');
    const [url,options]=transport.mock.calls[1]!;
    expect(url).toBe('/v1/auth/verify');expect(options).toMatchObject({credentials:'same-origin',cache:'no-store',redirect:'error',method:'POST',headers:{'X-CSRF-Token':'csrf'}});
    expect(JSON.parse(options!.body as string)).toEqual({challengeId:'challenge',code:'001234'});
  });
  it('does not retry an ambiguous mutation and hides server error prose',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(json({csrfToken:'csrf'})).mockResolvedValueOnce(json({error:{code:'TEMPORARILY_UNAVAILABLE',message:'private provider detail'}},503));
    await expect(createAuthApi(transport).code('a@example.test')).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE',status:503});
    expect(transport).toHaveBeenCalledTimes(2);expect(authMessage(new ApiError('unknown-private-text',500))).not.toContain('private');
  });
  it('preserves Retry-After and treats network failures separately',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(json({error:{code:'RATE_LIMITED'}},429,{'Retry-After':'60'}));
    await expect(createAuthApi(transport).me()).rejects.toMatchObject({retryAfter:60,status:429});
    transport.mockRejectedValue(new Error('private network error'));
    await expect(createAuthApi(transport).me()).rejects.toMatchObject({code:'NETWORK_ERROR',status:0});
  });
  it('accepts empty logout responses without storing a token',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(json({csrfToken:'csrf'})).mockResolvedValueOnce(new Response(null,{status:204}));
    await expect(createAuthApi(transport).logout()).resolves.toBeUndefined();
  });
});
