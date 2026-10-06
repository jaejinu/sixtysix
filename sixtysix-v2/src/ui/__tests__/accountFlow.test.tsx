import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,fireEvent,waitFor,cleanup,act } from '@testing-library/react';
import { MemoryRouter,useLocation } from 'react-router-dom';
import { AccountScreen } from '../screens/AccountScreen';
import { App } from '../App';
import { AppProvider } from '../../app/AppProvider';
import { ApiError,authApi,type AuthApi,type Me } from '../../auth/api';
const identityId='10000000-0000-4000-8000-000000000001';
const intentId='20000000-0000-4000-8000-000000000002';
const member:Me={profile:{id:'account-id',displayName:'서버 멤버'},identities:[{id:identityId,provider:'email',label:'a***@example.test',usable:true}],preferences:{defaultVisibility:'cohort'},memberships:[],currentMembershipId:null};
function fixture(){return {
  me:vi.fn<AuthApi['me']>().mockRejectedValue(new ApiError('UNAUTHENTICATED',401)),
  code:vi.fn<AuthApi['code']>().mockResolvedValue({challengeId:'challenge',expiresAt:new Date(Date.now()+300_000).toISOString(),message:'sent'}),
  verify:vi.fn<AuthApi['verify']>().mockResolvedValue({purpose:'login',nextAction:'SIGNED_IN',intentId:null}),
  reauth:vi.fn<AuthApi['reauth']>().mockResolvedValue({id:intentId,provider:'email',expiresAt:new Date(Date.now()+300_000).toISOString(),nextAction:'ENTER_CODE',challengeId:'reauth-code',authorizationUrl:null}),
  link:vi.fn<AuthApi['link']>().mockResolvedValue({id:intentId,provider:'email',expiresAt:new Date(Date.now()+300_000).toISOString(),nextAction:'ENTER_CODE',challengeId:'link-code',authorizationUrl:null}),
  complete:vi.fn<AuthApi['complete']>().mockResolvedValue(member.identities),unlink:vi.fn<AuthApi['unlink']>().mockResolvedValue(),logout:vi.fn<AuthApi['logout']>().mockResolvedValue(),
};}
function Location(){const location=useLocation();return <output data-testid="location">{location.pathname}{location.search}</output>;}
function mount(api:AuthApi,path='/login',redirect=vi.fn()){
  render(<MemoryRouter initialEntries={[path]}><AccountScreen api={api} redirect={redirect}/><Location/></MemoryRouter>);return redirect;
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();localStorage.clear();sessionStorage.clear();});
describe('real account UI',()=>{
  it('signs in by email, preserves leading zeros, refreshes server account and logs out',async()=>{
    const api=fixture();mount(api);await screen.findByRole('button',{name:'이메일로 인증번호 받기'});
    fireEvent.change(screen.getByLabelText('이메일'),{target:{value:'person@example.test'}});
    fireEvent.click(screen.getByRole('button',{name:'이메일로 인증번호 받기'}));
    await screen.findByLabelText('6자리 인증번호');expect(api.code).toHaveBeenCalledWith('person@example.test');
    expect(screen.getByRole('button',{name:'새 인증번호 요청'})).toBeDisabled();
    api.me.mockResolvedValue(member);fireEvent.change(screen.getByLabelText('6자리 인증번호'),{target:{value:'001234'}});
    fireEvent.click(screen.getByRole('button',{name:'인증번호 확인'}));
    await screen.findByText('서버 멤버');expect(api.verify).toHaveBeenCalledWith('challenge','001234');
    expect(screen.getByTestId('location')).toHaveTextContent('/account');
    expect(screen.queryByText('재진')).not.toBeInTheDocument();expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button',{name:'로그아웃'}));
    await screen.findByRole('button',{name:'카카오로 로그인'});expect(api.logout).toHaveBeenCalledOnce();
  });
  it('blocks duplicate submissions while sending',async()=>{
    const api=fixture();let resolve!: (value:Awaited<ReturnType<AuthApi['code']>>)=>void;
    api.code.mockReturnValue(new Promise(done=>{resolve=done;}));mount(api);
    await screen.findByLabelText('이메일');fireEvent.change(screen.getByLabelText('이메일'),{target:{value:'a@example.test'}});
    const button=screen.getByRole('button',{name:'이메일로 인증번호 받기'});fireEvent.click(button);fireEvent.click(button);
    expect(api.code).toHaveBeenCalledOnce();expect(button).toBeDisabled();
    await act(async()=>resolve({challengeId:'id',expiresAt:new Date(Date.now()+300000).toISOString(),message:'sent'}));
  });
  it('shows 503 and invalid-code errors without a fake logged-in account',async()=>{
    const api=fixture();api.code.mockRejectedValueOnce(new ApiError('TEMPORARILY_UNAVAILABLE',503));mount(api);
    await screen.findByLabelText('이메일');fireEvent.change(screen.getByLabelText('이메일'),{target:{value:'a@example.test'}});
    fireEvent.click(screen.getByRole('button',{name:'이메일로 인증번호 받기'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('계정 서비스를 이용할 수 없어요');
    fireEvent.click(screen.getByRole('button',{name:'이메일로 인증번호 받기'}));await screen.findByLabelText('6자리 인증번호');
    api.verify.mockRejectedValue(new ApiError('INVALID_CHALLENGE',400));fireEvent.change(screen.getByLabelText('6자리 인증번호'),{target:{value:'123456'}});
    fireEvent.click(screen.getByRole('button',{name:'인증번호 확인'}));expect(await screen.findByRole('alert')).toHaveTextContent('틀렸거나 만료');
    expect(screen.queryByText('서버 멤버')).not.toBeInTheDocument();
  });
  it('enforces Retry-After and code expiry on the clock',async()=>{
    vi.useFakeTimers();const api=fixture();api.code.mockRejectedValueOnce(new ApiError('RATE_LIMITED',429,2));mount(api);
    await act(async()=>{});fireEvent.change(screen.getByLabelText('이메일'),{target:{value:'a@example.test'}});
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'이메일로 인증번호 받기'})));
    expect(screen.getByRole('button',{name:'이메일로 인증번호 받기'})).toBeDisabled();
    await act(async()=>vi.advanceTimersByTime(2000));expect(screen.getByRole('button',{name:'이메일로 인증번호 받기'})).toBeEnabled();
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'이메일로 인증번호 받기'})));
    await act(async()=>vi.advanceTimersByTime(300_000));expect(screen.getByText(/인증번호가 만료됐어요/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'인증번호 확인'})).toBeDisabled();
  });
  it('requires explicit link completion and reports identity collision',async()=>{
    const api=fixture();api.me.mockResolvedValue(member);api.verify.mockResolvedValue({purpose:'link',nextAction:'COMPLETE_LINK',intentId});
    api.complete.mockRejectedValue(new ApiError('IDENTITY_ALREADY_LINKED',409));mount(api,'/account');await screen.findByText('서버 멤버');
    fireEvent.change(screen.getByLabelText('연결할 이메일'),{target:{value:'other@example.test'}});fireEvent.click(screen.getByRole('button',{name:'이메일 연결'}));
    await screen.findByLabelText('6자리 인증번호');fireEvent.change(screen.getByLabelText('6자리 인증번호'),{target:{value:'123456'}});fireEvent.click(screen.getByRole('button',{name:'인증번호 확인'}));
    await screen.findByRole('button',{name:'연결 완료하기'});expect(api.complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'연결 완료하기'}));expect(await screen.findByRole('alert')).toHaveTextContent('다른 계정에 연결');expect(api.complete).toHaveBeenCalledWith(intentId);
  });
  it('reauthenticates the selected method and protects the last identity',async()=>{
    const api=fixture();api.me.mockResolvedValue(member);api.verify.mockResolvedValue({purpose:'reauth',nextAction:'REAUTHENTICATED',intentId});mount(api,'/account');
    await screen.findByText('서버 멤버');expect(screen.getByRole('button',{name:'연결 해제'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'다시 인증'}));await screen.findByLabelText('6자리 인증번호');expect(api.reauth).toHaveBeenCalledWith(identityId);
    fireEvent.change(screen.getByLabelText('6자리 인증번호'),{target:{value:'123456'}});fireEvent.click(screen.getByRole('button',{name:'인증번호 확인'}));
    expect(await screen.findByText(/본인 확인을 완료했어요/)).toBeInTheDocument();
  });
  it('does not trust callback query as a login and drops stale account on 401',async()=>{
    const api=fixture();mount(api,`/account?auth=COMPLETE_LINK&intentId=${intentId}`);
    await screen.findByRole('button',{name:'카카오로 로그인'});expect(screen.queryByRole('button',{name:'연결 완료하기'})).not.toBeInTheDocument();expect(screen.getByTestId('location')).toHaveTextContent(/^\/account$/);
    cleanup();api.me.mockResolvedValue(member);api.link.mockRejectedValue(new ApiError('UNAUTHENTICATED',401));mount(api,'/account');await screen.findByText('서버 멤버');
    fireEvent.click(screen.getByRole('button',{name:'카카오 연결'}));await screen.findByRole('button',{name:'카카오로 로그인'});expect(screen.queryByText('서버 멤버')).not.toBeInTheDocument();
  });
  it('rejects a foreign authorization URL and navigates only through the local Kakao start route',async()=>{
    const api=fixture();const redirect=mount(api);await screen.findByRole('button',{name:'카카오로 로그인'});
    fireEvent.click(screen.getByRole('button',{name:'카카오로 로그인'}));await waitFor(()=>expect(redirect).toHaveBeenCalledWith('/v1/auth/kakao/start?returnTo=/my'));
    cleanup();api.me.mockResolvedValue(member);api.link.mockResolvedValue({id:intentId,provider:'kakao',expiresAt:new Date().toISOString(),nextAction:'REDIRECT',challengeId:null,authorizationUrl:'https://attacker.test/v1/auth/kakao/start'});
    const blocked=mount(api,'/account');await screen.findByText('서버 멤버');fireEvent.click(screen.getByRole('button',{name:'카카오 연결'}));await screen.findByRole('alert');expect(blocked).not.toHaveBeenCalled();
  });
  it('allows login and OAuth callbacks before demo onboarding',async()=>{
    vi.spyOn(authApi,'me').mockResolvedValue(member);
    render(<MemoryRouter initialEntries={['/my?auth=SIGNED_IN']}><AppProvider><App/></AppProvider><Location/></MemoryRouter>);
    await screen.findByText('서버 멤버');expect(screen.queryByRole('heading',{name:'습관 고르기'})).not.toBeInTheDocument();expect(screen.getByTestId('location')).toHaveTextContent('/account');
  });
});
