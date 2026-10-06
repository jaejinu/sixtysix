import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminScreen } from '../screens/AdminScreen';
import { ApiError } from '../../auth/api';
import { createAdminApi,type AdminApi } from '../../admin/api';
import type { Cohort } from '../../cohorts/api';
const cohort:Cohort={id:'cohort',habitId:'habit',generation:'11월 1기',policyVersion:1,startsAt:'2030-11-01T19:00:00.000Z',startDate:'2030-11-02',durationDays:66,capacity:30,minParticipants:10,participantCount:4,recruitmentOpensAt:'2030-10-01T00:00:00.000Z',status:'recruiting',finalSubmissionAt:'2031-01-07T07:00:00.000Z',canJoin:true,cancellationReason:null};
function fixture(){return {list:vi.fn<AdminApi['list']>().mockResolvedValue({items:[cohort],nextCursor:null}),habits:vi.fn<AdminApi['habits']>().mockResolvedValue({items:[{id:'habit',name:'걷기'}]}),create:vi.fn<AdminApi['create']>().mockResolvedValue(cohort),cancel:vi.fn<AdminApi['cancel']>().mockResolvedValue({...cohort,status:'cancelled'})};}
function mount(api:AdminApi){render(<MemoryRouter><AdminScreen api={api}/></MemoryRouter>);}
async function prepare(api:AdminApi){mount(api);await screen.findByRole('heading',{name:'새 모집'});fireEvent.change(screen.getByLabelText('습관'),{target:{value:'habit'}});fireEvent.change(screen.getByLabelText('기수 이름'),{target:{value:'11월 1기'}});fireEvent.change(screen.getByLabelText('시작일 · 한국 시간 오전 4시'),{target:{value:'2030-11-02'}});fireEvent.change(screen.getByLabelText('모집 시작 · 한국 시간'),{target:{value:'2030-10-01T09:00'}});fireEvent.change(screen.getByLabelText('최소 시작 인원'),{target:{value:'10'}});fireEvent.click(screen.getByRole('button',{name:'모집 내용 확인'}));}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('operator recruitment',()=>{
  it('does not expose list or forms when a member lacks operator permissions',async()=>{
    const api=fixture();api.list.mockRejectedValue(new ApiError('FORBIDDEN',403));mount(api);expect(await screen.findByRole('alert')).toHaveTextContent('운영 권한이 없어요');expect(screen.queryByLabelText('기수 이름')).not.toBeInTheDocument();expect(api.habits).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation and sends dates in KST with the chosen minimum',async()=>{
    const api=fixture();await prepare(api);expect(api.create).not.toHaveBeenCalled();expect(screen.getByRole('heading',{name:'모집 개설 확인'})).toHaveFocus();fireEvent.click(screen.getByRole('button',{name:'모집 개설 확정'}));await screen.findByText('모집을 개설했어요.');
    expect(api.create.mock.calls[0]![0]).toEqual({habitId:'habit',policyVersion:1,generation:'11월 1기',startDate:'2030-11-02',recruitmentOpensAt:'2030-10-01T00:00:00.000Z',capacity:30,minParticipants:10});
  });
  it.each(['NETWORK_ERROR','REAUTH_REQUIRED'])('retains exactly the same creation key/body after %s',async(code)=>{
    const api=fixture();api.create.mockRejectedValueOnce(new ApiError(code,code==='NETWORK_ERROR'?0:403));await prepare(api);fireEvent.click(screen.getByRole('button',{name:'모집 개설 확정'}));
    await screen.findByRole('button',{name:'같은 요청 다시 확인'});expect(screen.getByRole('button',{name:'모집 내용 확인'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'같은 요청 다시 확인'}));await screen.findByText('모집을 개설했어요.');expect(api.create.mock.calls[1]).toEqual(api.create.mock.calls[0]);
  });
  it('requires cancellation reason and final confirmation',async()=>{
    const api=fixture();mount(api);fireEvent.click(await screen.findByRole('button',{name:'이 모집 취소'}));fireEvent.change(screen.getByLabelText('참여자에게 공개할 취소 사유'),{target:{value:'시설 점검으로 취소합니다'}});fireEvent.click(screen.getByRole('button',{name:'취소 내용 확인'}));expect(api.cancel).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'모집 취소 확정'}));await screen.findByText('모집을 취소했어요. 참여자 안내를 등록했어요.');expect(api.cancel.mock.calls[0]).toEqual(['cohort','시설 점검으로 취소합니다',expect.any(String)]);
  });
  it('clears operator data and draft when privileges are revoked on refresh',async()=>{
    const api=fixture();mount(api);await screen.findByLabelText('기수 이름');fireEvent.change(screen.getByLabelText('기수 이름'),{target:{value:'미공개 계획'}});api.list.mockRejectedValue(new ApiError('FORBIDDEN',403));fireEvent.click(screen.getByRole('button',{name:'운영 권한·목록 새로고침'}));await screen.findByRole('alert');expect(screen.queryByText('걷기 · 11월 1기')).not.toBeInTheDocument();expect(screen.queryByDisplayValue('미공개 계획')).not.toBeInTheDocument();
  });
  it('keeps a confirmed success when only the following list refresh fails',async()=>{
    const api=fixture();await prepare(api);api.list.mockRejectedValue(new ApiError('NETWORK_ERROR',0));fireEvent.click(screen.getByRole('button',{name:'모집 개설 확정'}));await screen.findByText('모집을 개설했어요.');await screen.findByText(/변경은 완료됐지만/);expect(screen.queryByRole('button',{name:'같은 요청 다시 확인'})).not.toBeInTheDocument();expect(api.create).toHaveBeenCalledOnce();
  });
  it('respects Retry-After before manually retrying the same request',async()=>{
    const clock=vi.spyOn(Date,'now').mockReturnValue(1800000000000);const api=fixture();api.create.mockRejectedValueOnce(new ApiError('RATE_LIMITED',429,3));await prepare(api);fireEvent.click(screen.getByRole('button',{name:'모집 개설 확정'}));await screen.findByText('3초 후 다시 확인할 수 있어요.');expect(screen.getByRole('button',{name:'같은 요청 다시 확인'})).toBeDisabled();clock.mockReturnValue(1800000004000);await waitFor(()=>expect(screen.getByRole('button',{name:'같은 요청 다시 확인'})).toBeEnabled(),{timeout:2000});expect(api.create).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'같은 요청 다시 확인'}));await screen.findByText('모집을 개설했어요.');expect(api.create.mock.calls[1]).toEqual(api.create.mock.calls[0]);
  });
  it('sends CSRF and idempotency headers on admin cancellation',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({csrfToken:'csrf'}))).mockResolvedValueOnce(new Response(JSON.stringify(cohort)));
    await createAdminApi(transport).cancel('cohort','취소 사유','key');expect(transport.mock.calls[1]![0]).toBe('/v1/admin/cohorts/cohort/cancel');expect(transport.mock.calls[1]![1]).toMatchObject({method:'POST',headers:{'Idempotency-Key':'key','X-CSRF-Token':'csrf'},body:JSON.stringify({reason:'취소 사유'})});
  });
});
