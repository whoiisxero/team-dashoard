/* Public organisation references. No phone numbers or email addresses are guessed. */
(()=>{
 const leads=[
  {name:'Giovanni’s Deliworld',area:'Green Point',region:'seaboard',type:'shop',role:'Owner, deli manager or retail buyer',reason:'Discuss fit for the deli or gifting selection; request permission for a product introduction.'},
  {name:'Origin Coffee Roasting',area:'De Waterkant',region:'seaboard',type:'shop',role:'Café manager or retail buyer',reason:'Ask whether a non-THC confectionery tasting or coffee-pairing conversation would fit.'},
  {name:'Oranjezicht City Farm Market',area:'Granger Bay',region:'seaboard',type:'market',role:'Vendor applications or market management',reason:'Check the published food-vendor application route and whether the category is being considered.'},
  {name:'Bay Harbour Market',area:'Hout Bay',region:'other',type:'market',role:'Vendor applications or market management',reason:'Ask about the food-vendor application process and suitable market dates.'},
  {name:'Neighbourgoods Market · Old Biscuit Mill',area:'Woodstock',region:'other',type:'market',role:'Market organiser or vendor applications',reason:'Check the current application process and whether confectionery fits the vendor mix.'},
  {name:'SWEAT 1000',area:'Sea Point',region:'seaboard',type:'gym',role:'Studio manager or partnerships team',reason:'Ask about optional member-social gifting; treat the product as confectionery, without fitness claims.'},
  {name:'Virgin Active Point',area:'Green Point',region:'seaboard',type:'gym',role:'Club general manager or authorised partnerships team',reason:'Ask who can consider a member celebration or gifting proposal; do not assume local staff can approve it.'},
  {name:'Atlantic Athletic Club',area:'Sea Point',region:'seaboard',type:'club',role:'Club secretary, social organiser or committee',reason:'Explore whether a future club social is appropriate for an optional non-THC tasting.'},
  {name:'Celtic Harriers',area:'Newlands',region:'south',type:'club',role:'Club secretary or social-event organiser',reason:'Ask about an approved club-social introduction, rather than contacting individual runners.'},
  {name:'JARRYDS',area:'Sea Point',region:'seaboard',type:'restaurant',role:'Owner, general manager or food-and-beverage buyer',reason:'Ask about a brief product introduction for a guest-gifting or after-meal confectionery idea.'},
  {name:'Kleinsky’s',area:'Sea Point',region:'seaboard',type:'restaurant',role:'Owner or restaurant manager',reason:'Discuss whether the non-THC range fits the venue and its guests before arranging a tasting.'},
  {name:'The Gardeners Cottage',area:'Newlands',region:'south',type:'restaurant',role:'Owner or café manager',reason:'Ask whether a non-THC product introduction would suit the café or gifting context.'}
  ,{name:'VOB Running Club',area:'Constantia',region:'south',type:'club',role:'Club secretary or committee',reason:'Find the authorised contact for club socials and discuss whether a non-THC tasting fits.'}
  ,{name:'Hout Bay Harriers',area:'Hout Bay',region:'other',type:'club',role:'Club secretary or social-event organiser',reason:'Ask who coordinates club socials and whether a product introduction would be appropriate.'}
  ,{name:'Fish Hoek Athletic Club',area:'Fish Hoek',region:'south',type:'club',role:'Club secretary or committee',reason:'Find the current club contact and ask about suitable social-event introductions.'}
  ,{name:'Pinelands Athletic Club',area:'Pinelands',region:'other',type:'club',role:'Club secretary or social-event organiser',reason:'Verify the current contact route and ask whether a club-social conversation would suit.'}

 ];
 const websites={
  'Origin Coffee Roasting':'https://originroasting.co.za/',
  'Oranjezicht City Farm Market':'https://ozcf.co.za/',
  'Bay Harbour Market':'https://bayharbour.co.za/',
  'Neighbourgoods Market · Old Biscuit Mill':'https://neighbourgoodsmarket.co.za/',
  'SWEAT 1000':'https://sweat1000.com/',
  'Virgin Active Point':'https://www.virginactive.co.za/',
  'Atlantic Athletic Club':'https://www.aac.co.za/',
  'Celtic Harriers':'https://celticharriers.co.za/',
  'JARRYDS':'https://jarryds.co.za/',
  'Kleinsky’s':'https://kleinskys.co.za/',
  'VOB Running Club':'https://www.vob.co.za/'
 };
 const ids=['giovannis','origin','ozcf','bay-harbour','neighbourgoods','sweat1000','virgin-point','atlantic-ac','celtic','jarryds','kleinskys','gardeners','vob','hout-bay-harriers','fish-hoek-ac','pinelands-ac'];
 const meetingDate='2026-10-20';
 const searchUrl=lead=>'https://www.google.com/search?q='+encodeURIComponent(lead.name+' '+lead.area+' Cape Town official contact');
 for(const [index,lead] of leads.entries()){lead.key=ids[index];lead.website=websites[lead.name]||null;lead.email=null;lead.phone=null;lead.verifiedAt=null;lead.contactStatus='Website and contact details need verification';lead.nextStep=lead.type==='club'?'Verify the current club contact through the club site or Western Province Athletics directory; then ask the organiser about a suitable social introduction.':'Verify the official contact route and decision-maker, request permission to share the introduction, and log the response.';Object.freeze(lead)}
 const taskTitle=lead=>'Contact '+lead.name+' ('+lead.area+') about Dusted. non-THC Turkish delight';
 const contactText=lead=>[lead.name+' · '+lead.area,'Channel: '+lead.type,'Ask for: '+lead.role,'Email: not verified','Telephone: not verified',lead.website?'Website reference (not live-verified): '+lead.website:'Website: verify through the official-contact search','Official-contact search: '+searchUrl(lead),lead.type==='club'?'Association directory reference (not live-verified): https://wpa.org.za/':null,'Status: '+lead.contactStatus,'Next step: '+lead.nextStep,'Meeting preparation: 20 October 2026, morning; exact time not supplied.','No outreach has been sent.'].filter(Boolean).join('\n');
 // Stable record identifiers prevent duplicate imports across browsers; not used for authentication.
 function recordId(projectId,key,kind){const seed=kind+'|'+projectId+'|'+key;let hex='';for(let salt=0;salt<4;salt++){let h=(2166136261^salt)>>>0;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)>>>0}hex+=h.toString(16).padStart(8,'0')}return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20)}
 window.DustedContacts=Object.freeze({leads:Object.freeze(leads),meetingDate,searchUrl,taskTitle,contactText,recordId});
})();
