import { createApiTransport } from '../auth/api';
export interface Notification {id:string;type:'cohort.started'|'cohort.cancelled';membershipId:string;generation:string;habitName:string;createdAt:string}
export interface NotificationApi {list():Promise<{items:Notification[]}>}
export function createNotificationApi(transport:typeof fetch=(...args)=>fetch(...args)):NotificationApi{
  const {request}=createApiTransport(transport);return {list:()=>request('/me/notifications')};
}
export const notificationApi=createNotificationApi();
