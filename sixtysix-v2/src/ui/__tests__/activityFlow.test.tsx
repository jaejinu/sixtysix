import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActivityScreen } from '../screens/ActivityScreen';
import { createActivityApi,type ActivityApi } from '../../records/api';
import type { Home,RecordView,WriteResult } from '../../records/types';
import { ApiError } from '../../auth/api';
const progress={checkins:0,filled:0,lates:0,simples:0,privates:0,streak:0,bestStreak:0,emptyCells:66,passes:0,passesLeft:3,percent:0};
export const activityHome:Home={serverNow:'2026-11-02T00:00:00Z',membership:{id:'member',cohortId:'cohort',joinedAt:'2026-11-01T00:00:00Z',cancelledAt:null,leftAt:null},
  cohort:{id:'cohort',habitId:'habit',generation:'11월 1기',policyVersion:1,startsAt:'2026-11-01T19:00:00Z',startDate:'2026-11-02',durationDays:66,capacity:30,minParticipants:10,participantCount:12,recruitmentOpensAt:'2026-10-01T00:00:00Z',status:'active',finalSubmissionAt:'2027-01-07T07:00:00Z',canJoin:false,cancellationReason:null},
  habit:{id:'habit',name:'15분 걷기',shortName:'걷기',goal:'15분',imageRef:'/images/habit-reading.webp',timeOfDay:'morning'},policyVersion:1,cohortDay:1,displayDay:1,state:'day0',todayStatus:'empty',availability:{ok:true,targetDay:1,targetDate:'2026-11-02',late:false,closesAt:'2026-11-02T19:00:00Z'},progress,participation:{day:1,done:0,late:0,dormant:0,pending:12,participantCount:12},action:{type:'CHECKIN',label:'인증 남기기'}};
const history:RecordView={serverNow:activityHome.serverNow,membershipId:'member',entries:[],progress,days:Array.from({length:66},(_,i)=>({day:i+1,date:`2026-11-${String(i+2).padStart(2,'0')}`,status:i===0?'today':'future',entryId:null}))};
function fixture(){const result:WriteResult={entry:{id:'entry',membershipId:'member',cohortDay:1,createdAt:activityHome.serverNow,kind:'checkin',text:'걸었어요',samplePhotoRef:null,visibility:'private',late:false,simple:true,returning:false,hidden:false},home:{...activityHome,todayStatus:'checkin',availability:{ok:false,reason:'ALREADY_FILLED'},progress:{...progress,checkins:1,filled:1}},invalidate:['home','record']};return {home:vi.fn<ActivityApi['home']>().mockResolvedValue(activityHome),record:vi.fn<ActivityApi['record']>().mockResolvedValue(history),write:vi.fn<ActivityApi['write']>().mockResolvedValue(result)};}
function mount(api:ActivityApi){render(<MemoryRouter><ActivityScreen membershipId="member" api={api}/></MemoryRouter>);}
async function compose(api:ActivityApi){mount(api);const input=await screen.findByLabelText('오늘의 한 줄');fireEvent.change(input,{target:{value:'걸었어요'}});fireEvent.click(screen.getByRole('button',{name:'인증 내용 확인'}));}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('real activity flow',()=>{
  it('keeps draft and original request after 429, waits then retries without duplicate write',async()=>{
    const clock=vi.spyOn(Date,'now').mockReturnValue(1800000000000);
    const api=fixture();api.write.mockRejectedValueOnce(new ApiError('RATE_LIMITED',429,3));
    await compose(api);fireEvent.click(screen.getByRole('button',{name:'인증 저장 확정'}));
    await screen.findByText('3초 뒤 다시 확인할 수 있어요.');
    expect(screen.getByRole('button',{name:'같은 요청 다시 확인'})).toBeDisabled();
    expect(screen.getByLabelText('오늘의 한 줄')).toHaveValue('걸었어요');
    expect(screen.getByRole('button',{name:'면제권 사용'})).toBeDisabled();
    expect(api.write).toHaveBeenCalledOnce();clock.mockReturnValue(1800000004000);
    await waitFor(()=>expect(screen.getByRole('button',{name:'같은 요청 다시 확인'})).toBeEnabled(),{timeout:2000});
    expect(api.write).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'같은 요청 다시 확인'}));
    await screen.findByText('인증을 저장했어요.');expect(api.write.mock.calls[0]).toEqual(api.write.mock.calls[1]);
  });
  it.each([401,403,404])('clears private records when a refresh loses access (%s)',async status=>{
    const api=fixture();api.record.mockResolvedValue({...history,entries:[{id:'private',membershipId:'member',cohortDay:1,createdAt:activityHome.serverNow,kind:'checkin',text:'비공개 일기',visibility:'private'}]});
    mount(api);await screen.findByLabelText('오늘의 한 줄');fireEvent.click(screen.getByRole('button',{name:'내 기록'}));expect(screen.getByText('비공개 일기')).toBeInTheDocument();
    api.record.mockRejectedValue(new ApiError(status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':'NOT_FOUND',status));
    fireEvent.click(screen.getByRole('button',{name:'최신 홈·기록 확인'}));await screen.findByRole('alert');
    expect(screen.queryByText('비공개 일기')).not.toBeInTheDocument();expect(screen.queryByRole('group',{name:/66일 서버 기록/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'내 홈'}));expect(screen.queryByLabelText('오늘의 한 줄')).not.toBeInTheDocument();
  });
  it('shows session expiry and removes private content on background refresh',async()=>{
    const api=fixture();mount(api);await screen.findByLabelText('오늘의 한 줄');api.home.mockRejectedValue(new ApiError('UNAUTHENTICATED',401));
    fireEvent(document,new Event('visibilitychange'));await screen.findByText('로그인이 만료되었어요. 다시 로그인해주세요.');
    expect(screen.queryByLabelText('오늘의 한 줄')).not.toBeInTheDocument();
  });
  it('does not restore a previous account draft after an expired write and login refresh',async()=>{
    const api=fixture();api.write.mockRejectedValueOnce(new ApiError('UNAUTHENTICATED',401));await compose(api);fireEvent.click(screen.getByRole('button',{name:'인증 저장 확정'}));await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'최신 홈·기록 확인'}));expect(await screen.findByLabelText('오늘의 한 줄')).toHaveValue('');
  });
  it('captures text/visibility/day, asks confirmation, saves without demo writes',async()=>{
    const api=fixture();mount(api);fireEvent.change(await screen.findByLabelText('오늘의 한 줄'),{target:{value:' 걸었어요 '}});fireEvent.change(screen.getByLabelText('공개 범위'),{target:{value:'private'}});
    fireEvent.click(screen.getByRole('button',{name:'인증 내용 확인'}));expect(api.write).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'인증 저장 확정'}));await screen.findByText('인증을 저장했어요.');
    expect(api.write.mock.calls[0]).toEqual(['member',expect.any(String),'checkin',{text:'걸었어요',samplePhotoRef:null,visibility:'private',expectedTargetDay:1,expectedLate:false}]);
  });
  it('retains original key/body after ambiguous failure and disables competing writes',async()=>{
    const api=fixture();api.write.mockRejectedValueOnce(new ApiError('NETWORK_ERROR',0));await compose(api);fireEvent.click(screen.getByRole('button',{name:'인증 저장 확정'}));await screen.findByRole('button',{name:'같은 요청 다시 확인'});
    expect(screen.getByLabelText('오늘의 한 줄')).toHaveValue('걸었어요');expect(screen.getByRole('button',{name:'면제권 사용'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'같은 요청 다시 확인'}));await screen.findByText('인증을 저장했어요.');expect(api.write.mock.calls[0]).toEqual(api.write.mock.calls[1]);
  });
  it('preserves draft on TARGET_CHANGED and requires a new confirmed key/target',async()=>{
    const api=fixture();api.write.mockRejectedValueOnce(new ApiError('TARGET_CHANGED',409));await compose(api);
    api.home.mockResolvedValue({...activityHome,availability:{ok:true,targetDay:2,targetDate:'2026-11-03',late:false,closesAt:'2026-11-03T19:00:00Z'}});
    fireEvent.click(screen.getByRole('button',{name:'인증 저장 확정'}));await screen.findByRole('alert');expect(screen.getByLabelText('오늘의 한 줄')).toHaveValue('걸었어요');expect(api.write).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button',{name:'인증 내용 확인'}));expect(screen.getByRole('heading',{name:'2일차 · 정상 접수'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'인증 저장 확정'}));await screen.findByText('인증을 저장했어요.');
    expect(api.write.mock.calls[1]![1]).not.toBe(api.write.mock.calls[0]![1]);expect(api.write.mock.calls[1]![3].expectedTargetDay).toBe(2);
  });
  it('requires irreversible pass confirmation, sends no text, shows exhaustion',async()=>{
    const api=fixture();mount(api);fireEvent.click(await screen.findByRole('button',{name:'면제권 사용'}));expect(screen.getByText(/취소하거나 인증으로 바꿀 수 없어요/)).toBeInTheDocument();expect(api.write).not.toHaveBeenCalled();
    api.home.mockResolvedValue({...activityHome,progress:{...progress,passes:3,passesLeft:0}});fireEvent.click(screen.getByRole('button',{name:'면제권 사용 확정'}));await screen.findByText('면제권을 사용했어요.');expect(api.write.mock.calls[0]![3]).toEqual({expectedTargetDay:1,expectedLate:false});await waitFor(()=>expect(screen.getByRole('button',{name:'면제권 사용'})).toBeDisabled());
  });
  it('renders exactly 66 server cells and allows keyboard selection of private entries',async()=>{
    const api=fixture();api.record.mockResolvedValue({...history,entries:[{id:'saved',membershipId:'member',cohortDay:2,createdAt:activityHome.serverNow,kind:'checkin',text:'나의 비공개 기록',visibility:'private'}]});mount(api);await screen.findByLabelText('오늘의 한 줄');fireEvent.click(screen.getByRole('button',{name:'내 기록'}));
    const board=screen.getByRole('group',{name:/66일 서버 기록/});expect(board.querySelectorAll('button')).toHaveLength(66);fireEvent.keyDown(board,{key:'ArrowRight'});expect(screen.getByText('나의 비공개 기록')).toBeInTheDocument();expect(board.querySelector('[data-day="2"]')).toHaveFocus();
  });
  it('blocks before start, cancellation, leaving and end, but keeps final late-window action',async()=>{
    const api=fixture();api.home.mockResolvedValue({...activityHome,state:'ended',cohortDay:67,displayDay:66,availability:{ok:true,targetDay:66,targetDate:'2027-01-06',late:true,closesAt:'2027-01-07T07:00:00Z'},action:{type:'LATE_CHECKIN',label:'늦은 인증 남기기'}});mount(api);await screen.findByLabelText('오늘의 한 줄');expect(screen.getByRole('heading',{name:'늦은 인증 남기기'})).toBeInTheDocument();cleanup();
    api.home.mockResolvedValue({...activityHome,availability:{ok:false,reason:'ENDED'}});mount(api);await screen.findByText('접수 기간이 끝났어요. 저장한 기록은 볼 수 있어요.');expect(screen.queryByLabelText('오늘의 한 줄')).not.toBeInTheDocument();
  });
  it('reports successful write separately from failed refresh and hides stale record',async()=>{
    const api=fixture();await compose(api);api.home.mockRejectedValue(new ApiError('NETWORK_ERROR',0));fireEvent.click(screen.getByRole('button',{name:'인증 저장 확정'}));await screen.findByRole('alert');expect(screen.getByText('인증을 저장했어요.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'내 기록'}));expect(screen.queryByRole('group',{name:/66일 서버 기록/})).not.toBeInTheDocument();
  });
  it('sends CSRF and same idempotency key without automatic retry',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({csrfToken:'csrf'}))).mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'TARGET_CHANGED'}}),{status:409}));
    const api=createActivityApi(transport);await expect(api.write('member','key','pass',{expectedTargetDay:1,expectedLate:false})).rejects.toMatchObject({code:'TARGET_CHANGED'});expect(transport).toHaveBeenCalledTimes(2);expect(transport.mock.calls[1]![1]?.headers).toMatchObject({'Idempotency-Key':'key','X-CSRF-Token':'csrf'});
  });
});
