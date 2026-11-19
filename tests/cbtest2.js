const { chromium } = require('playwright');
const base='file://' + require('path').resolve(__dirname,'..','admin-site') + '/';
const stub = `
(function(){
 var now=Date.now(), H=36e5;
 function init(){return {
  towns:[{id:'t1',name:'Melur',name_ta:null,district:'Madurai',override:null},{id:'t2',name:'Usilampatti',name_ta:null,district:'Madurai',override:null}],
  providers:[
   {id:'p1',type:'individual',full_name:'Ravi',studio_name:null,mobile:'9876543210',email:null,experience_years:4,town_id:'t1',towns:{name:'Melur',district:'Madurai',state:'Tamil Nadu'},categories:['Wedding'],packages:[{name:'Basic',price:5000,days:7}],status:'verified',created_at:new Date(now-5*864e5).toISOString(),checklist:[],admin_notes:null},
   {id:'p2',type:'studio',full_name:'Kumar',studio_name:'Golden Frame',mobile:'9876543211',email:null,experience_years:9,town_id:'t1',towns:{name:'Melur',district:'Madurai',state:'Tamil Nadu'},categories:['Wedding','Product'],packages:[],status:'pending',created_at:new Date(now-864e5).toISOString(),checklist:[],admin_notes:null}],
  requirements:[{id:'r1',seq:1,event_type:'Wedding',event_date:'2026-12-10',reach:'town',status:'open',closes_at:new Date(now+20*H).toISOString(),created_at:new Date(now-H).toISOString(),customer_name:'Anu',towns:{name:'Melur',district:'Madurai'},bids:[{id:'b1',amount:9000,package:'Photos + album',status:'active',providers:{full_name:'Ravi',studio_name:null}}]}],
  bookings:[{id:'k1',seq:1,token_amount:300,due_at:new Date(now+9*864e5).toISOString(),delivered_at:null,status:'confirmed',requirements:{seq:1,event_type:'Wedding',towns:{name:'Melur',district:'Madurai'}},bids:{amount:9000,providers:{full_name:'Ravi',studio_name:null}}}],
  disputes:[{id:'d1',seq:1,type:'Photographer no-show',customer_name:'Anu',opened_at:new Date(now-2*864e5).toISOString(),respond_by:new Date(now-5*H).toISOString(),status:'open',token_amount:300,outcome:null,refund_amount:null,resolution_note:null,resolved_at:null,timeline:[{at:new Date(now-864e5).toISOString(),text:'Customer reported the photographer did not arrive.'}],provider_id:'p1',assigned_to:null,providers:{full_name:'Ravi',studio_name:null},admin_users:null,bookings:{seq:1,token_paid_at:new Date(now-3*864e5).toISOString(),requirements:{event_type:'Wedding',event_date:'2026-12-10'}}}],
  safety_flags:[{id:'s1',subject_kind:'provider',subject_name:'Ravi',provider_id:'p1',flag_type:'Repeated customer reports',evidence:'3 reports in 30 days',severity:'high',status:'open',decision:null,notes:null,created_at:new Date(now-864e5).toISOString()}],
  audit_log:[], settings:[{key:'verified_needed',value:3},{key:'refund_limit',value:500}],
  categories:[{name:'Birthday',active:true},{name:'Product',active:true},{name:'Wedding',active:true}],
  _team:[{user_id:'u1',email:'o@x.in',full_name:'Owner',role:'super_admin',last_active:new Date().toISOString(),authenticator:true},{user_id:'u2',email:'v@x.in',full_name:null,role:'verifier',last_active:null,authenticator:false}]
 }}
 function db(){var s=localStorage.getItem('DB'); if(!s){var d=init();localStorage.setItem('DB',JSON.stringify(d));return d} return JSON.parse(s)}
 function put(d){localStorage.setItem('DB',JSON.stringify(d))}
 function builder(table){
  var d=db(), op='select', filt=[], ord=null, lim=null, patch=null, single=false, ins=null, head=false, up=null;
  var b={
   select:function(c,o){ if(op==='select'||true){ if(op==='select') op='select'; } head=!!(o&&o.head); b._count=!!(o&&o.count); return b},
   eq:function(k,v){filt.push(function(r){return r[k]===v});return b},
   neq:function(k,v){filt.push(function(r){return r[k]!==v});return b},
   in:function(k,vs){filt.push(function(r){return vs.indexOf(r[k])>-1});return b},
   gte:function(k,v){filt.push(function(r){return r[k]>=v});return b},
   order:function(k,o){ord=[k,!(o&&o.ascending===false)];return b},
   limit:function(n){lim=n;return b},
   maybeSingle:function(){single='maybe';return b}, single:function(){single='one';return b},
   insert:function(r){op='insert';ins=r;return b}, update:function(p){op='update';patch=p;return b}, upsert:function(r){op='upsert';up=r;return b},
   then:function(res,rej){ return Promise.resolve(run()).then(res,rej) }
  };
  function run(){
   if(table==='admin_users') return {data:{role:'super_admin',email:'o@x.in',full_name:'Owner'}};
   var rows=d[table]; if(!rows) return {data:null,error:{message:'no table '+table}};
   if(op==='insert'){ var row=Object.assign({id:'n'+Math.random().toString(36).slice(2,7),created_at:new Date().toISOString(),seq:rows.length+1},ins);
     if(table==='providers'){ var t=d.towns.filter(function(x){return x.id===row.town_id})[0]; row.towns=t?{name:t.name,district:t.district,state:'Tamil Nadu'}:null;
       if(rows.some(function(r){return row.mobile&&r.mobile===row.mobile})) {} }
     if(table==='towns'&&rows.some(function(r){return r.name===row.name&&r.district===row.district})) return {error:{message:'duplicate key value'}};
     if(table==='categories'&&rows.some(function(r){return r.name===row.name})) return {error:{message:'duplicate key value'}};
     rows.push(row); put(d); return {data:single?row:null,error:null}; }
   if(op==='upsert'){ var k=rows.filter(function(r){return r.key===up.key})[0]; if(k) Object.assign(k,up); else rows.push(up); put(d); return {error:null}; }
   var m=rows.filter(function(r){return filt.every(function(f){return f(r)})});
   if(op==='update'){ m.forEach(function(r){Object.assign(r,patch)}); put(d); return {error:null}; }
   if(ord) m=m.slice().sort(function(a,c){return (a[ord[0]]>c[ord[0]]?1:-1)*(ord[1]?1:-1)});
   if(lim) m=m.slice(0,lim);
   if(head) return {count:m.length,error:null};
   if(single) return {data:m[0]||null,error:null};
   return {data:m,error:null};
  }
  return b;
 }
 function dash(){var d=db(); return {needed:3,open_requirements:1,confirmed_bookings:1,token_revenue:300,verified_providers:1,posted:4,with_bid:3,three_bids:1,delivered:0,ontime:0,cancelled:0,median_first_bid_min:75,pending_providers:1,overdue_disputes:1,open_flags:1,towns_below:2,no_bid_requirements:0,gaps:d.towns.map(function(t){return {name:t.name,district:t.district,override:t.override,verified:t.id==='t1'?1:0,requirements:t.id==='t1'?1:0}})}}
 window.supabase={createClient:function(){return {
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),signOut:async()=>({}),
   mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'}}),listFactors:async()=>({data:{totp:[{id:'f',status:'verified'}],all:[]}})}},
  from:builder,
  rpc:async function(n,a){ var d=db();
    if(n==='admin_dashboard') return {data:dash()};
    if(n==='admin_team') return {data:d._team};
    if(n==='add_admin'){ if(/ghost/.test(a.p_email)) return {error:{message:'No sign-in account for this email yet.'}}; d._team.push({user_id:'u9',email:a.p_email,full_name:null,role:a.p_role,last_active:null,authenticator:false}); put(d); return {}; }
    if(n==='reset_authenticator'){ d._team.forEach(function(t){if(t.user_id===a.p_user)t.authenticator=false}); put(d); return {}; }
    return {error:{message:'unknown rpc'}}; }
 }}};
})();`;
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.route('**/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:stub}));
 await ctx.route('**/fonts.googleapis.com/**',r=>r.abort());
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|fonts/.test(m.text()))errs.push(m.text())});
 let fails=0; const ok=(n,c,x)=>{console.log((c?'PASS':'FAIL')+' '+n+(x?' '+x:''));if(!c)fails++};
 const text=async()=>p.evaluate(()=>document.querySelector('main').innerText);
 const vis=()=>p.evaluate(()=>getComputedStyle(document.documentElement).visibility);
 const go=async(f)=>{await p.goto(base+f);await p.waitForFunction(()=>getComputedStyle(document.documentElement).visibility==='visible',{timeout:8000});await p.waitForTimeout(400)};
 const noPlaceholders=async(n)=>{const t=await text();const m=t.match(/\[[A-Z% ₹\/]+\]/g);ok(n+' no [PLACEHOLDERS]',!m,m?JSON.stringify(m.slice(0,4)):'')};

 await go('AdminDash.html'); await noPlaceholders('dash'); let t=await text();
 ok('dash tiles',/Open requirements\s*1/.test(t)&&/Token revenue.*\s*300/.test(t)&&/1 h 15 min/.test(t)&&/Confirmation rate\s*25%/.test(t),t.replace(/\n+/g,' ').slice(60,420));
 ok('dash gaps row',/Melur · Madurai\s+1 of 3/.test(t));
 await p.screenshot({path:'/tmp/d_dash.png'});

 await go('AdminList.html'); await noPlaceholders('list'); t=await text();
 ok('list rows',/Ravi/.test(t)&&/Golden Frame/.test(t)); ok('list tile pending=1',/Pending verification\s*1/.test(t));
 await p.selectOption('select >> nth=1','studio'); await p.waitForTimeout(150); t=await text(); ok('list filter studio',!/Ravi/.test(t)&&/Golden Frame/.test(t));
 await p.screenshot({path:'/tmp/d_list.png'});

 await go('enroll.html'); await noPlaceholders('enroll');
 await p.fill('label:has-text("Full name") input','Meena'); await p.fill('label:has-text("Mobile number") input','98765 43299');
 await p.selectOption('label:has-text("District") select','Madurai'); await p.selectOption('label:has-text("Town / village") select',{label:'Usilampatti'});
 await p.check('input[value="Wedding"]'); await p.fill('input[aria-label="Package name"]','Basic'); await p.fill('input[aria-label="Price from in rupees"]','4000');
 await p.click('text=Verify & activate'); await p.waitForURL('**/AdminList.html',{timeout:5000}); await p.waitForTimeout(400); t=await text();
 ok('enroll -> listed as Meena Verified',/Meena/.test(t));
 await go('enroll.html'); await p.fill('label:has-text("Full name") input','Dup'); await p.fill('label:has-text("Mobile number") input','9876543210'); await p.click('text=Save draft'); await p.waitForTimeout(300);
 ok('duplicate mobile blocked',/already exists/.test(await p.textContent('#cb-toast')));
 await p.fill('label:has-text("Mobile number") input','12345'); await p.click('text=Save draft'); await p.waitForTimeout(200); ok('bad mobile message',/10-digit/.test(await p.textContent('#cb-toast')));

 await go('AdminReview.html?id=p2'); await noPlaceholders('review'); t=await text(); ok('review shows studio',/Golden Frame/.test(t)&&/Melur, Madurai/.test(t)&&/1 found|None/.test(t),'');
 await p.click('text=Approve and activate'); await p.waitForTimeout(250); ok('approve blocked until checklist',/Tick every item/.test(await p.textContent('#cb-toast')));
 for (const i of [0,1,2,3,4]) await p.locator('aside input[type=checkbox]').nth(i).check();
 await p.click('text=Approve and activate'); await p.waitForURL('**/AdminList.html',{timeout:5000});
 const st=await p.evaluate(()=>JSON.parse(localStorage.getItem('DB')).providers.filter(x=>x.id==='p2')[0].status); ok('p2 now verified',st==='verified',st);
 await go('AdminReview.html?id=p1'); await p.screenshot({path:'/tmp/d_review.png'}); ok('suspend button for super admin',await p.locator('text=Suspend provider').count()===1);
 await p.click('text=Suspend provider'); await p.waitForTimeout(250); ok('suspend needs reason',/reason/.test(await p.textContent('#cb-toast')));

 await go('AdminOrders.html'); await noPlaceholders('orders'); t=await text(); ok('orders row RQ-00001',/RQ-00001/.test(t)&&/₹9,000/.test(t)&&/Remove bid/.test(t));
 await p.click('text=Bookings'); await p.waitForTimeout(250); t=await text(); ok('bookings tab',/BK-00001/.test(t)&&/₹300/.test(t));
 await p.click('role=tab[name="Requirements"]'); await p.waitForTimeout(200);
 await p.click('text=Cancel requirement'); await p.waitForTimeout(300); t=await text(); ok('cancel requirement',/Cancelled/.test(t));
 await p.screenshot({path:'/tmp/d_orders.png'});

 await go('AdminDisputes.html'); await noPlaceholders('disputes'); t=await text(); ok('dispute row CS-00001 overdue',/CS-00001/.test(t)&&/Overdue/.test(t));
 await p.click('text=Assign to me'); await p.waitForTimeout(250);
 await p.click('text=Resolve case'); await p.waitForTimeout(400); t=await text(); ok('resolved -> Closed & timeline',/Closed/.test(t)&&/Resolved by/.test(t));
 const rf=await p.evaluate(()=>JSON.parse(localStorage.getItem('DB')).disputes[0].refund_amount); ok('full refund = token 300',rf===300,String(rf));
 const flags=await p.evaluate(()=>JSON.parse(localStorage.getItem('DB')).safety_flags.length); ok('safety flag raised from dispute',flags===2,String(flags));
 await p.click('role=tab[name="Refunds"]'); await p.waitForTimeout(200); ok('refunds tab',/₹300/.test(await text()));
 await p.screenshot({path:'/tmp/d_disp.png'});

 await go('AdminSafety.html'); await noPlaceholders('safety'); t=await text(); ok('safety row',/Repeated customer reports/.test(t));
 await p.selectOption('aside select','dismiss'); await p.click('text=Save decision'); await p.waitForTimeout(300); t=await text(); ok('dismissed removed from Open list',!/3 reports in 30 days\s*High/.test(t));

 await go('AdminLocations.html'); await noPlaceholders('locations'); t=await text(); ok('locations rows Not ready',/Melur/.test(t)&&/1 of 3/.test(t)&&/Not ready/.test(t));
 await p.click('text=Force open >> nth=0'); await p.waitForTimeout(250); t=await text(); ok('forced open',/Forced open/.test(t));
 await p.fill('section:has(#add-h) label:has-text("Name") >> nth=0 >> input','Alanganallur'); await p.selectOption('section:has(#add-h) select','Madurai'); await p.click('text=Add location'); await p.waitForTimeout(300); ok('town added',/Alanganallur/.test(await text()));
 await p.fill('label:has-text("Verified photographers needed") input','1'); await p.click('text=Save rule'); await p.waitForTimeout(250); ok('rule saved, Usilampatti ready? (1 verified: Meena)',/Open/.test(await text()));
 await p.click('text=+ Add category'); await p.fill('input[aria-label="New category name"]','Drone'); await p.click('#cat-new button'); await p.waitForTimeout(250); ok('category added',/Drone/.test(await text()));
 await p.screenshot({path:'/tmp/d_loc.png'});

 await go('AdminTeam.html'); await noPlaceholders('team'); t=await text(); ok('team rows',/Owner/.test(t)&&/v@x.in/.test(t)&&/Not set up/.test(t));
 await p.fill('aside input[type=email]','new@x.in'); await p.click('text=Add to team'); await p.waitForTimeout(350); ok('member added',/new@x.in/.test(await text()));
 await p.fill('aside input[type=email]','ghost@x.in'); await p.click('text=Add to team'); await p.waitForTimeout(300); ok('ghost email message',/No sign-in account/.test(await p.textContent('#cb-toast')));
 ok('audit log has lines',/Added team member/.test(await text()));
 await p.screenshot({path:'/tmp/d_team.png',fullPage:true});

 ok('no page/console errors',errs.length===0,errs.join(' | '));
 await b.close(); console.log(fails?('FAILS: '+fails):'ALL PASS'); process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e.message);process.exit(1)});
