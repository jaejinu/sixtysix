// Local V2 UI check with mocked API responses; no provider or production calls.
const { chromium } = require('@playwright/test');
const { mkdir } = require('node:fs/promises');
const { join } = require('node:path');
async function verifyActivity(page, baseUrl, outputDirectory) {
  const id='11111111-1111-4111-8111-111111111111';
  const checks=[];const errors=[];let mode='active',saved=null,requests=[],failOnce=false;
  page.on('pageerror',error=>errors.push(error.message));
  const progress={checkins:0,filled:0,lates:0,simples:0,privates:0,streak:0,bestStreak:0,emptyCells:66,passes:0,passesLeft:3,percent:0};
  function home(){
    const p={...progress};if(saved){p.filled=1;p.emptyCells=65;p.percent=2;p.streak=1;p.bestStreak=1;if(saved.kind==='pass'){p.passes=1;p.passesLeft=2;}else{p.checkins=1;p.simples=1;p.privates=saved.visibility==='private'?1:0;}}
    if(mode==='exhausted'){p.passes=3;p.passesLeft=0;}
    const block={before:'BEFORE_START',ended:'ENDED',cancelled:'CANCELLED',left:'LEFT'}[mode];
    return {serverNow:'2026-11-02T00:00:00Z',membership:{id,cohortId:id,joinedAt:'2026-11-01T00:00:00Z',cancelledAt:null,leftAt:null},
      cohort:{id,habitId:id,generation:'11월 1기',policyVersion:1,startsAt:'2026-11-01T19:00:00Z',startDate:'2026-11-02',durationDays:66,capacity:30,minParticipants:1,participantCount:12,recruitmentOpensAt:'2026-10-01T00:00:00Z',status:'active',finalSubmissionAt:'2027-01-07T07:00:00Z',canJoin:false,cancellationReason:null},
      habit:{id,name:'15분 걷기',shortName:'걷기',goal:'15분',imageRef:'/images/habit-reading.webp',timeOfDay:'morning'},policyVersion:1,cohortDay:mode==='late'?67:1,displayDay:mode==='late'?66:mode==='before'?0:1,state:mode==='late'?'ended':'day0',todayStatus:saved?saved.kind:'empty',progress:p,
      availability:saved?{ok:false,reason:'ALREADY_FILLED'}:block?{ok:false,reason:block}:{ok:true,targetDay:mode==='late'?66:1,targetDate:mode==='late'?'2027-01-06':'2026-11-02',late:mode==='late',closesAt:mode==='late'?'2027-01-07T07:00:00Z':'2026-11-02T19:00:00Z'},
      participation:{day:1,done:saved?1:0,late:0,dormant:0,pending:saved?11:12,participantCount:12},action:{type:mode==='late'?'LATE_CHECKIN':'CHECKIN',label:mode==='late'?'늦은 인증 남기기':'인증 남기기'}};
  }
  function record(){return {serverNow:home().serverNow,membershipId:id,progress:home().progress,entries:saved?[saved]:[],days:Array.from({length:66},(_,i)=>({day:i+1,date:new Date(Date.UTC(2026,10,2+i)).toISOString().slice(0,10),status:i===0?saved?saved.kind==='pass'?'pass':'done':'today':'future',entryId:i===0&&saved?saved.id:null}))};}
  await page.route('**/v1/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(mode==='expired')return json({error:{code:'UNAUTHENTICATED'}},401);
    if(path==='/v1/auth/context')return json({csrfToken:'local-test-only'});
    if(path.endsWith('/home'))return json(home());if(path.endsWith('/record'))return json(record());
    if(request.method()==='POST'){
      requests.push({body:request.postDataJSON(),key:request.headers()['idempotency-key']});
      const body=request.postDataJSON();saved={id:'22222222-2222-4222-8222-222222222222',membershipId:id,cohortDay:body.expectedTargetDay,createdAt:home().serverNow,kind:path.endsWith('/passes')?'pass':'checkin',text:body.text,samplePhotoRef:null,visibility:body.visibility,late:body.expectedLate,simple:true,returning:false,hidden:false};
      if(failOnce){failOnce=false;return json({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);}
      return json({entry:saved,home:home(),invalidate:['home','record']},201);
    }
    return json({error:{code:'NOT_FOUND'}},404);
  });
  async function open(next){mode=next;saved=null;requests=[];failOnce=false;await page.goto(`${baseUrl}/activity/${id}`);await page.getByRole('button',{name:'최신 홈·기록 확인'}).waitFor();await page.waitForFunction(()=>document.querySelector('main')?.getAttribute('aria-busy')==='false');}
  async function check(name,width){
    const issues=await page.evaluate(()=>{
      const problems=[];if(document.documentElement.scrollWidth>innerWidth)problems.push('horizontal overflow');
      for(const e of document.querySelectorAll('main button,main select,main textarea,main a')){
        const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;
        const min=e.matches('.cell')?24:44;
        if(r.width<min-.5||r.height<min-.5)problems.push(`${e.textContent?.slice(0,30)}: ${r.width}x${r.height}`);
      }return problems;
    });if(issues.length)throw Error(`${width}/${name}: ${issues.join(', ')}`);checks.push(`${width}/${name}`);
  }
  for(const width of [360,390,430]){
    await page.setViewportSize({width,height:900});await open('active');await check('home',width);
    await page.getByLabel('오늘의 한 줄').fill('가'.repeat(40));await page.getByLabel('공개 범위').selectOption('private');await page.getByRole('button',{name:'인증 내용 확인'}).click();await check('confirm',width);
    if(width===360)await page.screenshot({path:join(outputDirectory, '360-confirm.png'),fullPage:true});
    await page.getByRole('button',{name:'인증 저장 확정'}).click();await page.getByText('인증을 저장했어요.').waitFor();await page.getByRole('button',{name:'내 기록',exact:true}).click();await page.getByText('가'.repeat(40),{exact:true}).waitFor();
    if(await page.locator('.board button').count()!==66)throw Error('Expected 66 cells');await check('private-record',width);
    await page.locator('.board button').first().focus();await page.keyboard.press('ArrowDown');if(await page.locator('.board button[data-day="12"]').getAttribute('aria-pressed')!=='true')throw Error('keyboard selection');
    if(width===360)await page.screenshot({path:join(outputDirectory, '360-record.png'),fullPage:true});
    mode='expired';await page.getByRole('button',{name:'최신 홈·기록 확인'}).click();await page.getByText('로그인이 만료되었어요. 다시 로그인해주세요.').waitFor();if(await page.locator('.board').count())throw Error('private history remained');await check('expired',width);
    await open('active');await page.getByRole('button',{name:'면제권 사용',exact:true}).click();await check('pass-confirm',width);await page.getByRole('button',{name:'면제권 사용 확정'}).click();await page.getByText('면제권을 사용했어요.').waitFor();await check('pass-saved',width);
    await open('active');failOnce=true;await page.getByLabel('오늘의 한 줄').fill('응답이 끊겨도 한 번만 저장');await page.getByRole('button',{name:'인증 내용 확인'}).click();await page.getByRole('button',{name:'인증 저장 확정'}).click();await page.getByRole('alert').waitFor();await check('ambiguous-failure',width);
    await page.getByRole('button',{name:'같은 요청 다시 확인'}).click();await page.getByText('인증을 저장했어요.').waitFor();if(requests.length!==2||JSON.stringify(requests[0])!==JSON.stringify(requests[1]))throw Error('retry changed request');await check('retry-saved',width);
    for(const state of ['before','ended','cancelled','left','late','exhausted']){await open(state);await check(state,width);if(state==='exhausted'&&!(await page.getByRole('button',{name:'면제권 사용',exact:true}).isDisabled()))throw Error('pass exhaustion');if(state==='late'){await page.getByLabel('오늘의 한 줄').waitFor();if(width===360)await page.screenshot({path:join(outputDirectory, '360-final-late.png'),fullPage:true});}}
  }
  if(errors.length)throw Error(errors.join('\n'));return {checkedStates:checks.length,widths:[360,390,430],checks,pageErrors:errors};
}

async function main() {
  const baseUrl = process.env.ACTIVITY_BASE_URL || 'http://127.0.0.1:5173';
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname)) throw Error('Only a local V2 server is allowed');
  const outputDirectory = process.env.ACTIVITY_QA_OUTPUT || join(__dirname, '../test-results/activity-mobile');
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    console.log(JSON.stringify(await verifyActivity(page, baseUrl.replace(/\/$/, ''), outputDirectory), null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
