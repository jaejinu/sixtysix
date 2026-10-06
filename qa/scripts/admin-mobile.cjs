const {chromium}=require('@playwright/test');
const {mkdir}=require('node:fs/promises');const {join}=require('node:path');
(async()=>{
  const base=process.env.ADMIN_QA_BASE||'http://127.0.0.1:5173';if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('Local server required');
  const output=join(__dirname,'../test-results/admin-mobile');await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));let mode='normal',writes=[];
    const c={id:'11111111-1111-4111-8111-111111111111',habitId:'22222222-2222-4222-8222-222222222222',generation:'11월 1기',policyVersion:1,startsAt:'2030-11-01T19:00:00.000Z',startDate:'2030-11-02',durationDays:66,capacity:30,minParticipants:10,participantCount:4,recruitmentOpensAt:'2030-10-01T00:00:00.000Z',status:'recruiting',finalSubmissionAt:'2031-01-07T07:00:00.000Z',canJoin:true,cancellationReason:null};
    await page.route('**/v1/**',route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(path==='/v1/auth/context')return json({csrfToken:'test-only'});
      if(path==='/v1/habits')return json({items:[{id:c.habitId,name:'매일 15분 걷기'}]});
      if(mode==='denied')return json({error:{code:'FORBIDDEN'}},403);
      if(request.method()==='POST'){
        writes.push({body:request.postDataJSON(),key:request.headers()['idempotency-key']});
        if(mode==='retry'){mode='normal';return json({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);}
        return json(c,path.endsWith('/cancel')?200:201);
      }
      return json({items:[c],nextCursor:null});
    });
    async function check(name,width){const issues=await page.evaluate(()=>{
      const problems=[];if(document.documentElement.scrollWidth>innerWidth)problems.push('overflow');
      for(const e of document.querySelectorAll('main button,main a,main input,main select,main textarea')){const r=e.getBoundingClientRect();if(r.width&&r.height&&(r.width<44||r.height<44))problems.push(`${e.tagName}:${r.width}x${r.height}`);}return problems;
    });if(issues.length)throw Error(`${width}/${name}: ${issues}`);checks.push(`${width}/${name}`);}
    for(const width of [360,390,430]){
      await page.setViewportSize({width,height:900});mode='normal';writes=[];await page.goto(base+'/admin/cohorts');await page.getByRole('heading',{name:'새 모집'}).waitFor();await check('form-list',width);
      await page.getByLabel('습관',{exact:true}).selectOption(c.habitId);await page.getByLabel('기수 이름').fill('11월 2기');await page.getByLabel('시작일 · 한국 시간 오전 4시').fill('2030-11-03');await page.getByLabel('모집 시작 · 한국 시간').fill('2030-10-01T09:00');await page.getByLabel('최소 시작 인원').fill('10');await page.getByRole('button',{name:'모집 내용 확인'}).click();await page.getByRole('heading',{name:'모집 개설 확인'}).waitFor();await check('create-confirm',width);
      if(width===360)await page.screenshot({path:join(output,'360-create.png'),fullPage:true});
      mode='retry';await page.getByRole('button',{name:'모집 개설 확정'}).click();await page.getByRole('button',{name:'같은 요청 다시 확인'}).waitFor();await check('retry',width);await page.getByRole('button',{name:'같은 요청 다시 확인'}).click();await page.getByText('모집을 개설했어요.').waitFor();if(writes.length!==2||JSON.stringify(writes[0])!==JSON.stringify(writes[1]))throw Error('Changed retry');
      await page.getByRole('button',{name:'이 모집 취소'}).click();await page.getByLabel('참여자에게 공개할 취소 사유').fill('시설 점검으로 이번 모집을 취소합니다.');await page.getByRole('button',{name:'취소 내용 확인'}).click();await page.getByRole('heading',{name:'모집 취소 확인'}).waitFor();await check('cancel-confirm',width);
      mode='denied';await page.goto(base+'/admin/cohorts');await page.getByRole('alert').waitFor();if(await page.getByLabel('기수 이름').count())throw Error('Forbidden form visible');await check('forbidden',width);
    }
    if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({checks:checks.length,states:checks,pageErrors:errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
