// Serialized whole into the owned page. The input timestamp includes delivery delay.
export function installFeedbackProbe(task){
  const state=window.__solStartupProfile;
  let observation=null,checkFeedback=null,ownedEvent=null;
  const bubble=event=>{
    if(event!==ownedEvent||!observation||!checkFeedback)return;
    document.removeEventListener('click',bubble,false);
    observation.domReadyInDispatch=checkFeedback(false);observation.domReadyAtMs=performance.now();
  };
  const listener=event=>{
    if(!event.target.closest?.(task.selector))return;
    document.removeEventListener('click',listener,true);
    const captureTimeMs=performance.now(),inputTimeMs=event.timeStamp,trusted=event.isTrusted;
    if(!Number.isFinite(inputTimeMs)||inputTimeMs<0||inputTimeMs>captureTimeMs+1){
      document.removeEventListener('click',bubble,false);
      state.feedback.push({task:task.task,trusted,inputTimeMs,captureTimeMs,durationMs:null,error:'unexpected input timestamp clock domain'});return;
    }
    observation={task:task.task,selector:task.selector,trusted,inputTimeMs,captureTimeMs,domReadyInDispatch:false};ownedEvent=event;
    const visible=(node,geometry)=>{
      if(!node||node.hidden||node.inert||document.hidden)return false;
      if(!geometry)return true;
      if(!node.getClientRects().length)return false;
      const rect=node.getBoundingClientRect();
      let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(window.innerWidth,rect.right),bottom=Math.min(window.innerHeight,rect.bottom);
      if(!(right>left&&bottom>top))return false;
      for(let owner=node;owner;owner=owner.parentElement){
        const style=getComputedStyle(owner);
        if(owner.hidden||owner.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||Number(style.opacity)===0)return false;
        if(owner!==node&&(['hidden','clip','auto','scroll'].includes(style.overflowX)||['hidden','clip','auto','scroll'].includes(style.overflowY))){
          const clip=owner.getBoundingClientRect();
          if(['hidden','clip','auto','scroll'].includes(style.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
          if(['hidden','clip','auto','scroll'].includes(style.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
          if(!(right>left&&bottom>top))return false;
        }
      }
      return true;
    };
    const matches=(geometry=true)=>{
      const body=document.body,byId=id=>document.getElementById(id);
      if(task.condition==='research')return body.dataset.experience==='research'&&byId('viewTitle').textContent==='Solar research'&&visible(byId('viewTitle'),geometry);
      if(task.condition==='inspector')return byId('panelToggle').getAttribute('aria-expanded')==='true'&&visible(byId('viewInspector'),geometry)&&!byId('viewInspector').inert;
      if(task.condition==='timeline')return byId('timelineToggle').getAttribute('aria-expanded')==='true'&&visible(byId('timeline'),geometry);
      if(task.condition==='sky')return body.dataset.surface==='sky'&&byId('viewTitle').textContent==='My Sky'&&visible(byId('viewTitle'),geometry);
      if(task.condition==='system')return body.dataset.surface==='orrery'&&byId('viewTitle').textContent==='Solar System'&&visible(byId('viewTitle'),geometry);
      return body.classList.contains('focus-mode')&&byId('focusToggle').getAttribute('aria-pressed')==='true'&&visible(byId('focusToggle'),geometry);
    };
    checkFeedback=matches;
    const poll=()=>{
      if(matches()){
        observation.geometryConfirmedAtMs=performance.now();
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          if(!matches()){state.feedback.push({...observation,durationMs:null,error:'visible feedback changed before frame checkpoint'});return;}
          const paintTimeMs=performance.now();state.feedback.push({...observation,paintTimeMs,frameProbeTimeMs:paintTimeMs,
            feedbackVisible:true,inputDelayMs:captureTimeMs-inputTimeMs,durationMs:paintTimeMs-inputTimeMs});
        }));
      }
      else if(performance.now()-captureTimeMs>5000)state.feedback.push({task:task.task,trusted,inputTimeMs,captureTimeMs,durationMs:null,error:'visible feedback deadline'});
      else requestAnimationFrame(poll);
    };poll();
  };
  document.addEventListener('click',listener,true);
  document.addEventListener('click',bubble,false);
}
