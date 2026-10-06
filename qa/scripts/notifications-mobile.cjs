const {chromium}=require('@playwright/test');
const {mkdir}=require('node:fs/promises');
const {join}=require('node:path');
(async()=>{
  const base=process.env.NOTIFICATIONS_QA_BASE||'http://127.0.0.1:5173';
  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('Local server required');
  const output=join(__dirname,'../test-results/notifications-mobile');await mkdir(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let mode='list';const checks=[];
    await page.route('**/v1/**',route=>route.fulfill({status:mode==='expired'?401:200,contentType:'application/json',body:JSON.stringify(mode==='expired'?{error:{code:'UNAUTHENTICATED'}}:{items:mode==='empty'?[]:['cohort.started','cohort.cancelled'].map((type,i)=>({id:String(i),type,membershipId:'11111111-1111-4111-8111-111111111111',habitName:'매일 15분 함께 걷기',generation:'10월 첫 번째 기수',createdAt:'2026-10-05T00:00:00Z'}))})}));
    for(const width of [360,390,430]){
      await page.setViewportSize({width,height:900});
      for(const state of ['list','empty','expired']){
        mode=state;await page.goto(base+'/notifications');
        await page.getByText(state==='list'?'코호트가 시작됐어요':state==='empty'?'아직 받은 알림이 없어요.':'로그인 후 알림을 확인해주세요.').waitFor();
        const issues=await page.evaluate(()=>{
          const found=[];if(document.documentElement.scrollWidth>innerWidth)found.push('overflow');
          for(const el of document.querySelectorAll('main button,main a')){const r=el.getBoundingClientRect();if(r.width<44||r.height<44)found.push('small target');}return found;
        });if(issues.length)throw Error(`${width}/${state}: ${issues}`);checks.push(`${width}/${state}`);
        if(state==='list')await page.screenshot({path:join(output,`${width}-inbox.png`),fullPage:true});
      }
      mode='list';await page.goto(base+'/notifications');await page.getByText('코호트가 시작됐어요').waitFor();mode='expired';await page.getByRole('button',{name:'알림 새로고침'}).click();await page.getByRole('alert').waitFor();
      if(await page.getByText('코호트가 시작됐어요').count())throw Error('Expired session retained inbox');checks.push(`${width}/session-cleared`);
    }
    if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({checks:checks.length,states:checks,pageErrors:errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
