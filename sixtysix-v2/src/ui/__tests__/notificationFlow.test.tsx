import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,fireEvent,cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationScreen } from '../screens/NotificationScreen';
import { createNotificationApi,type NotificationApi,type Notification } from '../../notifications/api';
import { ApiError } from '../../auth/api';
const note:Notification={id:'note',type:'cohort.started',membershipId:'member',generation:'1기',habitName:'15분 걷기',createdAt:'2026-10-05T00:00:00Z'};
const mount=(api:NotificationApi)=>render(<MemoryRouter><NotificationScreen api={api}/></MemoryRouter>);
afterEach(()=>cleanup());
describe('account inbox',()=>{
  it('shows start and cancellation notices with correct destinations',async()=>{
    mount({list:async()=>({items:[note,{...note,id:'cancel',type:'cohort.cancelled'}]})});
    await screen.findByText('코호트가 시작됐어요');expect(screen.getByText('모집이 취소됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'내 활동 보기'})).toHaveAttribute('href','/activity/member');
    expect(screen.getByRole('link',{name:'공개 모집 보기'})).toHaveAttribute('href','/recruitment');
  });
  it('shows empty state without demo notifications',async()=>{
    mount({list:async()=>({items:[]})});await screen.findByText('아직 받은 알림이 없어요.');expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('clears private notices when refreshing an expired session',async()=>{
    const api={list:vi.fn<NotificationApi['list']>().mockResolvedValueOnce({items:[note]}).mockRejectedValueOnce(new ApiError('UNAUTHENTICATED',401))};
    mount(api);await screen.findByText('코호트가 시작됐어요');fireEvent.click(screen.getByRole('button',{name:'알림 새로고침'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인 후');expect(screen.queryByText('15분 걷기 · 1기')).not.toBeInTheDocument();
  });
  it('reads only the current session inbox with no caller identity query',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({items:[]})));
    await createNotificationApi(transport).list();expect(transport).toHaveBeenCalledOnce();expect(transport.mock.calls[0]![0]).toBe('/v1/me/notifications');
    expect(transport.mock.calls[0]![1]).toMatchObject({credentials:'same-origin',cache:'no-store',method:'GET'});
  });
});
