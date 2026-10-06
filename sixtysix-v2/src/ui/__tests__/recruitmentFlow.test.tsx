import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecruitmentScreen } from '../screens/RecruitmentScreen';
import { createRecruitmentApi,type RecruitmentApi,type Cohort } from '../../cohorts/api';
import { ApiError,type Me } from '../../auth/api';
const c:Cohort={id:'cohort-one',habitId:'habit',generation:'1기',policyVersion:1,startsAt:'2026-11-01T19:00:00Z',startDate:'2026-11-02',durationDays:66,capacity:30,minParticipants:10,participantCount:9,recruitmentOpensAt:'2026-10-01T00:00:00Z',status:'recruiting',finalSubmissionAt:'2027-01-07T07:00:00Z',canJoin:true,cancellationReason:null};
const membership={id:'member',cohortId:c.id,joinedAt:'2026-10-05T00:00:00Z',cancelledAt:null,leftAt:null};
const user:Me={profile:{id:'user',displayName:'사용자'},identities:[],preferences:{defaultVisibility:'cohort'},memberships:[],currentMembershipId:null};
function fixture(){return {list:vi.fn<RecruitmentApi['list']>().mockResolvedValue({items:[c],nextCursor:null}),detail:vi.fn<RecruitmentApi['detail']>().mockResolvedValue(c),habits:vi.fn<RecruitmentApi['habits']>().mockResolvedValue({items:[{id:'habit',name:'걷기',goal:'15분'}]}),me:vi.fn<RecruitmentApi['me']>().mockResolvedValue(user),join:vi.fn<RecruitmentApi['join']>().mockResolvedValue(membership),cancel:vi.fn<RecruitmentApi['cancel']>().mockResolvedValue({...membership,cancelledAt:'2026-10-05T01:00:00Z'})};}
function mount(api:RecruitmentApi){render(<MemoryRouter><RecruitmentScreen api={api}/></MemoryRouter>);}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('public recruitment',()=>{
  it('waits on 429 and preserves the original join key for a manual retry',async()=>{
    const clock=vi.spyOn(Date,'now').mockReturnValue(1800000000000);
    const api=fixture();api.join.mockRejectedValueOnce(new ApiError('RATE_LIMITED',429,3));mount(api);
    fireEvent.click(await screen.findByRole('button',{name:'참여하기'}));fireEvent.click(screen.getByRole('button',{name:'참여 확정'}));
    await screen.findByRole('alert');expect(screen.getByRole('button',{name:'같은 요청 다시 확인'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'참여하기'})).toBeDisabled();expect(api.join).toHaveBeenCalledOnce();
    clock.mockReturnValue(1800000004000);
    await waitFor(()=>expect(screen.getByRole('button',{name:'같은 요청 다시 확인'})).toBeEnabled(),{timeout:2000});
    expect(api.join).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'같은 요청 다시 확인'}));
    await screen.findByText('참여가 확정됐어요. 시작일을 확인해주세요.');expect(api.join.mock.calls[0]).toEqual(api.join.mock.calls[1]);
  });
  it('allows anonymous browsing and shows empty recruitment without demo people',async()=>{
    const api=fixture();api.me.mockRejectedValue(new ApiError('UNAUTHENTICATED',401));api.list.mockResolvedValue({items:[],nextCursor:null});mount(api);
    await screen.findByText('모집을 준비하고 있어요');expect(screen.queryByText('참여하기')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'로그인·계정 관리'})).toHaveAttribute('href','/account');
  });
  it('joins only after explicit confirmation and reads real membership',async()=>{
    const api=fixture();mount(api);await screen.findByRole('button',{name:'참여하기'});
    fireEvent.click(screen.getByRole('button',{name:'참여하기'}));expect(api.join).not.toHaveBeenCalled();
    api.me.mockResolvedValue({...user,memberships:[membership],currentMembershipId:membership.id});
    fireEvent.click(screen.getByRole('button',{name:'참여 확정'}));await screen.findByRole('region',{name:'내 참여'});
    expect(api.join).toHaveBeenCalledOnce();expect(api.join.mock.calls[0]![0]).toBe(c.id);expect(screen.getByRole('button',{name:'참여 취소'})).toBeEnabled();
  });
  it('retains the exact request key after ambiguous failure and blocks a second command',async()=>{
    const api=fixture();api.join.mockRejectedValueOnce(new ApiError('NETWORK_ERROR',0));mount(api);await screen.findByRole('button',{name:'참여하기'});
    fireEvent.click(screen.getByRole('button',{name:'참여하기'}));fireEvent.click(screen.getByRole('button',{name:'참여 확정'}));
    await screen.findByRole('button',{name:'같은 요청 다시 확인'});expect(screen.getByRole('button',{name:'참여하기'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'같은 요청 다시 확인'}));await screen.findByText('참여가 확정됐어요. 시작일을 확인해주세요.');
    expect(api.join.mock.calls[0]).toEqual(api.join.mock.calls[1]);
  });
  it('shows full/closed errors without fake success',async()=>{
    const api=fixture();api.join.mockRejectedValue(new ApiError('COHORT_FULL',409));mount(api);await screen.findByRole('button',{name:'참여하기'});
    fireEvent.click(screen.getByRole('button',{name:'참여하기'}));fireEvent.click(screen.getByRole('button',{name:'참여 확정'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('모집 정원이 찼어요');expect(screen.queryByText('참여가 확정됐어요. 시작일을 확인해주세요.')).not.toBeInTheDocument();
  });
  it('confirms cancellation and warns that the same cohort cannot be rejoined',async()=>{
    const api=fixture();api.me.mockResolvedValue({...user,memberships:[membership],currentMembershipId:membership.id});mount(api);await screen.findByRole('button',{name:'참여 취소'});
    fireEvent.click(screen.getByRole('button',{name:'참여 취소'}));expect(screen.getByText(/취소한 같은 기수/)).toBeInTheDocument();expect(api.cancel).not.toHaveBeenCalled();
    api.me.mockResolvedValue(user);fireEvent.click(screen.getByRole('button',{name:'취소 확정'}));await screen.findByText('참여를 취소했어요.');await waitFor(()=>expect(screen.queryByRole('region',{name:'내 참여'})).not.toBeInTheDocument());
  });
  it('loads more cohorts and prevents joining a full cohort',async()=>{
    const api=fixture();api.list.mockResolvedValueOnce({items:[{...c,participantCount:30,canJoin:false}],nextCursor:'cursor'}).mockResolvedValueOnce({items:[{...c,id:'next',generation:'2기'}],nextCursor:null});mount(api);
    expect(await screen.findByRole('button',{name:'정원 마감'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'모집 더 보기'}));await screen.findByText('걷기 · 2기');expect(api.list).toHaveBeenLastCalledWith('cursor');
  });
  it('keeps successful command separate from subsequent refresh failure',async()=>{
    const api=fixture();mount(api);await screen.findByRole('button',{name:'참여하기'});api.list.mockRejectedValue(new ApiError('NETWORK_ERROR',0));
    fireEvent.click(screen.getByRole('button',{name:'참여하기'}));fireEvent.click(screen.getByRole('button',{name:'참여 확정'}));await screen.findByRole('alert');
    expect(screen.getByText('참여가 확정됐어요. 시작일을 확인해주세요.')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'같은 요청 다시 확인'})).not.toBeInTheDocument();expect(api.join).toHaveBeenCalledOnce();
  });
  it('sends CSRF, unchanged idempotency key and explicit cancel confirmation',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({csrfToken:'csrf'}))).mockResolvedValueOnce(new Response(JSON.stringify(membership)));
    const api=createRecruitmentApi(transport);await api.cancel('member','original-key');
    expect(transport.mock.calls[1]![0]).toBe('/v1/memberships/member/cancel');
    expect(transport.mock.calls[1]![1]).toMatchObject({method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':'csrf','Idempotency-Key':'original-key'},body:JSON.stringify({confirm:true})});
  });
});
