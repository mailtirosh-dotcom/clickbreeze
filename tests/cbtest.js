const { chromium } = require('playwright');
const path='file://' + require('path').resolve(__dirname,'..','admin-site') + '/';
const stub = `window.supabase={createClient:function(){
 var S=JSON.parse(localStorage.getItem('S')||'{"s":0,"aal":1,"f":0}');function save(){localStorage.setItem('S',JSON.stringify(S))}
 return {auth:{
  getSession:async()=>({data:{session:S.s?{user:{id:'u1'}}:null}}),
  signInWithPassword:async(a)=>{ if(a.password!=='good') return {error:{message:'x'}}; S.s=1; save(); return {data:{}} },
  signOut:async()=>{S={s:0,aal:1,f:S.f};save();return {}},
  mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:S.aal===2?'aal2':'aal1'}}),
   listFactors:async()=>({data:{totp:S.f?[{id:'f1',status:'verified'}]:[],all:[]}}),
   enroll:async()=>({data:{id:'f1',totp:{qr_code:'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22/>',secret:'ABCD EFGH'}}}),
   unenroll:async()=>({}),challenge:async()=>({data:{id:'c1'}}),
   verify:async(a)=>{ if(a.code!=='123456') return {error:{message:'bad'}}; S.f=1;S.aal=2;save();return {data:{}} }}},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'super_admin',email:'o@x.in',full_name:'Owner'}})})})})};}};`;
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1000,height:800}});
 await ctx.route('**/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:stub}));
 await ctx.route('**/fonts.googleapis.com/**',r=>r.abort());
 const p=await ctx.newPage();
 await p.goto(path+'AdminDash.html'); await p.waitForURL('**/index.html*'); console.log('1 unauth dash ->', p.url().split('/').pop());
 await p.fill('#email','o@x.in'); await p.fill('#password','bad'); await p.click('#pwBtn'); await p.waitForTimeout(300);
 console.log('2 bad pw msg:', await p.textContent('#msg'));
 await p.fill('#password','good'); await p.click('#pwBtn'); await p.waitForURL('**/AdminTwoFA.html'); console.log('3 no factor ->', p.url().split('/').pop());
 await p.waitForSelector('#qr img'); console.log('4 key:', await p.textContent('#key'));
 await p.fill('#otp','000000'); await p.click('#btn'); await p.waitForTimeout(300); console.log('5 bad code msg:', await p.textContent('#msg'));
 await p.fill('#otp','123456'); await p.click('#btn'); await p.waitForURL('**/AdminDash.html'); await p.waitForTimeout(300);
 console.log('6 dash visible:', await p.evaluate(()=>getComputedStyle(document.documentElement).visibility), '| signout btn:', await p.locator('text=Sign out').count());
 await p.screenshot({path:'/tmp/dash.png'});
 await p.click('text=Sign out'); await p.waitForURL('**/index.html*'); console.log('7 after signout ->', p.url().split('/').pop());
 await p.fill('#email','o@x.in'); await p.fill('#password','good'); await p.click('#pwBtn'); await p.waitForSelector('#code:not([hidden])'); console.log('8 code step shown');
 await p.screenshot({path:'/tmp/login.png'});
 await p.fill('#otp','123456'); await p.click('#codeBtn'); await p.waitForURL('**/AdminDash.html'); console.log('9 login with code -> dash');
 await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
