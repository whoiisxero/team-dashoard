/* Explicit microphone capture, reviewed transcription and device speech output. */
window.createAssistantVoice=({getSessionKey,getToken,onState,onStatus,onError,onStart,onTranscript,dock,panel})=>{
 const $=id=>document.getElementById(id),MAX_BYTES=2*1024*1024,MAX_SECONDS=60;
 const synth=window.speechSynthesis;
 let state='idle',chatBusy=false,generation=0,stream=null,recorder=null,controller=null,timer=null,seconds=0,discard=false;
 let speechGeneration=0,utterance=null,voices=[],conversation=false,audioContext=null,silenceTimer=null;
 function stopMeter(){clearInterval(silenceTimer);silenceTimer=null;const context=audioContext;audioContext=null;void context?.close().catch(()=>{});}
 function continueConversation(){if(conversation&&!panel.hidden&&$('qaHandsFree').checked&&!document.hidden)setTimeout(()=>{if(conversation&&!chatBusy&&state==='idle')void startInput({automatic:true});},0);}
 function meter(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;try{audioContext=new Audio();const analyser=audioContext.createAnalyser();analyser.fftSize=1024;audioContext.createMediaStreamSource(stream).connect(analyser);const samples=new Uint8Array(analyser.fftSize);let heard=false,lastSpeech=Date.now(),started=lastSpeech;silenceTimer=setInterval(()=>{analyser.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,n)=>sum+((n-128)/128)**2,0)/samples.length);if(rms>.02){heard=true;lastSpeech=Date.now();}if(heard&&Date.now()-lastSpeech>1600)stopInput();else if(!heard&&Date.now()-started>12000)cancelInput({announce:true});},100);}catch{stopMeter();}}
 const inputSupported=()=>window.isSecureContext&&!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined';
 const current=(version,session)=>version===generation&&session===getSessionKey()&&!!session;
 function stopTracks(){stream?.getTracks().forEach(track=>track.stop());stream=null;}
 function controls(){const pending=state!=='idle';$('qaMic').disabled=chatBusy||!inputSupported()||state==='starting'||state==='transcribing';$('qaMic').textContent=state==='recording'?'Stop mic':state==='transcribing'?'Transcribing…':'Mic';$('qaMic').setAttribute('aria-label',state==='recording'?'Stop recording and transcribe':'Record a voice question');$('qaMic').setAttribute('aria-pressed',String(state==='recording'));$('qaVoiceCancel').hidden=!pending&&!conversation;$('qaVoiceCancel').textContent=conversation?'End conversation':'Cancel';for(const button of panel.querySelectorAll('.qa-listen'))button.disabled=pending;}
 function setState(value){state=value;for(const node of [dock,panel]){node.classList.toggle('is-listening',value==='recording');node.classList.toggle('is-transcribing',value==='transcribing');}controls();onState();}
 function stopSpeaking(){speechGeneration++;synth?.cancel();utterance=null;dock.classList.remove('is-speaking');panel.classList.remove('is-speaking');$('qaStopSpeech').hidden=true;}
 function chunks(text){const result=[];let remaining=String(text).replace(/[*_`#]/g,'').replace(/\s+/g,' ').trim();while(remaining){let end=Math.min(220,remaining.length);if(end<remaining.length){const boundary=Math.max(remaining.lastIndexOf('. ',end),remaining.lastIndexOf('! ',end),remaining.lastIndexOf('? ',end),remaining.lastIndexOf(' ',end));if(boundary>80)end=boundary+1;}result.push(remaining.slice(0,end));remaining=remaining.slice(end).trim();}return result;}
 function speak(text,onDone){
  if(!synth||typeof SpeechSynthesisUtterance==='undefined'||state!=='idle'||!getSessionKey()||document.hidden)return;
  stopSpeaking();const version=speechGeneration,session=getSessionKey(),queue=chunks(text);
  if(!queue.length)return;$('qaStopSpeech').hidden=false;
  function next(){
   if(version!==speechGeneration||session!==getSessionKey())return;
   const line=queue.shift();if(!line){dock.classList.remove('is-speaking');panel.classList.remove('is-speaking');$('qaStopSpeech').hidden=true;utterance=null;onDone?.();return;}
   utterance=new SpeechSynthesisUtterance(line);const selected=voices.find(voice=>voice.voiceURI===$('qaReplyVoice').value);if(selected)utterance.voice=selected;utterance.lang=selected?.lang||'en-ZA';utterance.rate=1;
   utterance.onstart=()=>{if(version===speechGeneration&&session===getSessionKey()){dock.classList.add('is-speaking');panel.classList.add('is-speaking');}};
   utterance.onend=next;utterance.onerror=event=>{if(version!==speechGeneration)return;stopSpeaking();if(!['canceled','interrupted'].includes(event.error))onStatus('Spoken audio could not play. Try another voice or use the text reply.');};
   synth.speak(utterance);
  }
  next();
 }
 function fillVoices(){if(!synth)return;voices=synth.getVoices();const select=$('qaReplyVoice'),old=select.value;select.replaceChildren();const defaultOption=document.createElement('option');defaultOption.value='';defaultOption.textContent='Device default';select.append(defaultOption);for(const voice of voices){const option=document.createElement('option');option.value=voice.voiceURI;option.textContent=voice.name+' · '+voice.lang;select.append(option);}if(voices.some(voice=>voice.voiceURI===old))select.value=old;}
 function cancelInput({announce=false}={}){generation++;conversation=false;stopMeter();discard=true;controller?.abort();controller=null;clearInterval(timer);timer=null;if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch{}}recorder=null;stopTracks();setState('idle');if(announce)onStatus('Recording cancelled. Your typed question is unchanged.');}
 async function transcribe(blob,version,session,base){
  if(!current(version,session))return;
  setState('transcribing');onStatus('Transcribing your recording…');controller=new AbortController();const request=controller,timeout=setTimeout(()=>request.abort(),25000);
  try{
   const accessToken=await getToken();if(!current(version,session))return;if(!accessToken)throw new Error('Refresh your sign-in before using voice input.');
   const response=await fetch('/api/transcribe',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/octet-stream','X-Audio-Type':blob.type||'audio/webm'},body:blob,signal:request.signal,cache:'no-store',credentials:'same-origin'});
   let result;try{result=await response.json();}catch{throw new Error('Voice transcription could not be reached. Your typed question is unchanged.');}
   if(!current(version,session))return;if(!response.ok){const error=new Error(result.message||'The recording could not be transcribed.');error.voiceIssue=result;throw error;}
   if(typeof result.text!=='string'||!result.text.trim())throw new Error('No speech was detected. Please record again.');
   const prefix=base.trimEnd(),combined=(prefix?prefix+' ':'')+result.text.trim();$('qaInput').value=combined.slice(0,2000);$('qaInput').dispatchEvent(new Event('input',{bubbles:true}));
   if(combined.length>2000||result.truncated)conversation=false;
   setState('idle');onStatus(combined.length>2000||result.truncated?'Voice text was shortened to 2,000 characters. Review it before sending.':conversation?'Voice message sent.':'Transcribed. Review your question, then tap Send.');
   onTranscript?.({text:combined.slice(0,2000),automatic:conversation&&$('qaHandsFree').checked});
  }catch(error){if(current(version,session)){conversation=false;onError(error.voiceIssue||{code:'voice_unavailable',message:error.name==='AbortError'?'Transcription took too long. Your typed question is unchanged; record again.':error.message});}}
  finally{clearTimeout(timeout);if(current(version,session)){controller=null;setState('idle');}}
 }
 function stopInput(){if(state!=='recording'||!recorder)return;clearInterval(timer);timer=null;stopMeter();setState('transcribing');onStatus('Finishing your recording…');recorder.stop();stopTracks();}
 async function startInput({automatic=false}={}){
  if(state!=='idle'||chatBusy||!getSessionKey())return;
  if(!inputSupported()){onError({code:'voice_unsupported',message:window.isSecureContext?'Voice recording is not supported in this browser. Try current Chrome, Edge or Safari, or type your question.':'Microphone access needs a secure HTTPS page. Open the normal Quest website.'});return;}
  if(navigator.onLine===false){onError({code:'voice_offline',message:'Voice transcription needs a connection. You can still type your question.'});return;}
  if($('qaInput').value.trim().length>=2000){onStatus('Shorten your current question before adding a recording.');return;}
  if(!automatic)conversation=$('qaHandsFree').checked;if(automatic&&!conversation)return;stopSpeaking();onStart();const version=++generation,session=getSessionKey(),base=$('qaInput').value;discard=false;setState('starting');onStatus('Allow microphone access when your browser asks.');
  let granted;
  try{
   granted=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(!current(version,session)){granted.getTracks().forEach(track=>track.stop());return;}
   stream=granted;const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(value=>MediaRecorder.isTypeSupported(value));
   recorder=new MediaRecorder(stream,{...(type?{mimeType:type}:{}),audioBitsPerSecond:64000});const instance=recorder,parts=[];let size=0;
   instance.ondataavailable=event=>{if(!current(version,session)||discard||!event.data.size)return;size+=event.data.size;if(size>MAX_BYTES){cancelInput();onError({code:'voice_too_large',message:'That recording is too large. Please record a shorter question.'});return;}parts.push(event.data);};
   instance.onerror=()=>{if(current(version,session)){cancelInput();onError({code:'voice_recording_failed',message:'The microphone could not finish recording. Please try again.'});}};
   instance.onstop=()=>{if(!current(version,session)||discard)return;clearInterval(timer);timer=null;stopMeter();stopTracks();recorder=null;const blob=new Blob(parts,{type:instance.mimeType||parts[0]?.type||'audio/webm'});parts.length=0;if(!blob.size){setState('idle');onError({code:'voice_empty',message:'The recording was empty. Please record again.'});return;}void transcribe(blob,version,session,base);};
   instance.start(250);seconds=0;setState('recording');onStatus('Recording · 0:00. Tap Stop mic to transcribe.');
   if(conversation)meter();
   timer=setInterval(()=>{seconds++;onStatus(`Recording · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}. Tap Stop mic to transcribe.`);if(seconds>=MAX_SECONDS)stopInput();},1000);
  }catch(error){
   if(!current(version,session)){granted?.getTracks().forEach(track=>track.stop());return;}
   cancelInput();const message=['NotAllowedError','PermissionDeniedError'].includes(error.name)?'Microphone permission was blocked. Allow it in your browser’s site settings, then tap Mic.':['NotFoundError','DevicesNotFoundError'].includes(error.name)?'No microphone was found. Connect one or type your question.':'The microphone could not start. Check whether another app is using it, or type your question.';
   onError({code:'voice_microphone_failed',message});
  }
 }
 $('qaMic').onclick=()=>state==='recording'?stopInput():void startInput();$('qaVoiceCancel').onclick=()=>{cancelInput({announce:true});stopSpeaking();};$('qaStopSpeech').onclick=()=>{cancelInput();stopSpeaking();};
 $('qaSpeak').onchange=()=>{if(!$('qaSpeak').checked){cancelInput();stopSpeaking();$('qaHandsFree').checked=false;}};
 $('qaHandsFree').onchange=()=>{if($('qaHandsFree').checked){$('qaSpeak').checked=true;onStatus('Tap Mic to start a voice conversation. Q will listen after each reply.');}else cancelInput();};
 if(synth){fillVoices();synth.addEventListener?.('voiceschanged',fillVoices);}else{$('qaHandsFree').closest('label').hidden=true;$('qaSpeak').closest('label').hidden=true;$('qaReplyVoice').closest('label').hidden=true;}
 if(!inputSupported())$('qaMic').title='Voice recording needs HTTPS and a supported browser.';
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelInput();stopSpeaking();}});
 window.addEventListener('pagehide',()=>{cancelInput();stopSpeaking();});
 window.addEventListener('offline',()=>{if(state!=='idle'||conversation){cancelInput();stopSpeaking();onStatus('Recording stopped because the connection was lost. Your typed question is unchanged.');}});
 controls();
 return {startInput,cancelInput,speak,stopSpeaking,continueConversation,get inputBusy(){return state!=='idle';},get speechSupported(){return !!synth&&typeof SpeechSynthesisUtterance!=='undefined';},setChatBusy(value){chatBusy=value;controls();},reset(){cancelInput();stopSpeaking();$('qaHandsFree').checked=false;$('qaSpeak').checked=false;$('qaReplyVoice').value='';}};
};
