var V=Object.defineProperty;var r=(C,h)=>V(C,"name",{value:h,configurable:!0});(()=>{"use strict";if(window.__prismInjected)return;window.__prismInjected=!0;const h={"chat.openai.com":"chatgpt","chatgpt.com":"chatgpt","claude.ai":"claude","gemini.google.com":"gemini","chat.deepseek.com":"deepseek","www.perplexity.ai":"perplexity","perplexity.ai":"perplexity"}[location.hostname]||"generic",$={chatgpt:{input:["#prompt-textarea",'div[contenteditable="true"]#prompt-textarea','form div[contenteditable="true"]'],conversation:r(()=>[...document.querySelectorAll("[data-message-author-role]")].slice(-8).map(t=>(t.getAttribute("data-message-author-role")==="user"?"User":"Assistant")+": "+(t.innerText||"").trim().slice(0,400)).join(`

`),"conversation")},claude:{input:['div[contenteditable="true"].ProseMirror','fieldset div[contenteditable="true"]','div[contenteditable="true"]'],conversation:r(()=>{const e=[...document.querySelectorAll('[data-testid="user-message"]')].slice(-4).map(n=>"User: "+(n.innerText||"").trim().slice(0,400)),t=[...document.querySelectorAll(".font-claude-message, [data-is-streaming]")].slice(-4).map(n=>"Assistant: "+(n.innerText||"").trim().slice(0,400));return[...e,...t].join(`

`)},"conversation")},gemini:{input:['rich-textarea div.ql-editor[contenteditable="true"]','div.ql-editor[contenteditable="true"]'],conversation:r(()=>{const e=[...document.querySelectorAll("user-query")].slice(-4).map(n=>"User: "+(n.textContent||"").trim().slice(0,400)),t=[...document.querySelectorAll("model-response, message-content")].slice(-4).map(n=>"Assistant: "+(n.textContent||"").trim().slice(0,400));return[...e,...t].join(`

`)},"conversation")},deepseek:{input:["textarea#chat-input","textarea"],conversation:r(()=>[...document.querySelectorAll(".ds-message, .markdown-body")].slice(-8).map(t=>(t.innerText||"").trim().slice(0,400)).map((t,n)=>(n%2===0?"User: ":"Assistant: ")+t).join(`

`),"conversation")},perplexity:{input:["textarea[placeholder]",'div[contenteditable="true"]',"textarea"],conversation:r(()=>[...document.querySelectorAll('[data-author="user"]')].slice(-4).map(t=>"User: "+(t.innerText||"").trim().slice(0,400)).join(`

`),"conversation")},generic:{input:['div[contenteditable="true"]',"textarea"],conversation:r(()=>"","conversation")}},z=$[h]||$.generic;function y(){for(const e of z.input){const t=document.querySelectorAll(e);for(const n of t){const i=n.getBoundingClientRect();if(i.width>40&&i.height>18&&I(n))return n}}return null}r(y,"findInput");function I(e){const t=getComputedStyle(e);return t.visibility!=="hidden"&&t.display!=="none"}r(I,"isVisible");function O(e){return e?e.tagName==="TEXTAREA"?e.value||"":e.innerText||e.textContent||"":""}r(O,"readInput");function A(e,t){if(e.focus(),e.tagName==="TEXTAREA")return Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set.call(e,t),e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0})),!0;const n=window.getSelection(),i=document.createRange();i.selectNodeContents(e),n.removeAllRanges(),n.addRange(i);let o=!1;try{o=document.execCommand("insertText",!1,t)}catch{o=!1}return o||(e.textContent=t,e.dispatchEvent(new InputEvent("input",{bubbles:!0,data:t,inputType:"insertText"}))),!0}r(A,"writeInput");function R(){try{return z.conversation()||""}catch{return""}}r(R,"getConversation");let a=null,E=[];async function H(){try{const e=await x("GET_SETTINGS");a=e&&e.settings||null}catch{a=null}a||(a={appearance:{theme:"dark",accent:"violet",fontSize:"medium",panelPosition:"auto"},behavior:{toastDuration:2600}})}r(H,"loadSettings");function x(e){return new Promise((t,n)=>{let i=!1;try{chrome.runtime.sendMessage(e,o=>{if(i=!0,chrome.runtime.lastError)return n(new Error(chrome.runtime.lastError.message));t(o)}),setTimeout(()=>{i||n(new Error("Background unavailable"))},15e3)}catch(o){n(o)}})}r(x,"send");const L={violet:"#8b5cf6",blue:"#3b82f6",green:"#10b981",orange:"#f59e0b",pink:"#ec4899",red:"#ef4444"};function v(){return L[a&&a.appearance&&a.appearance.accent||"violet"]||L.violet}r(v,"accent");function N(){return!!(a&&a.appearance&&a.appearance.theme==="light")}r(N,"isLight");function D(){const e=N(),t=v();return`
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
      .panel {
        position: fixed; z-index: 2147483646; width: min(680px, calc(100vw - 24px));
        max-height: min(76vh, 640px); display: flex; flex-direction: column;
        background: ${e?"#ffffff":"#14141b"};
        color: ${e?"#1a1a24":"#e8e8f0"};
        border: 1px solid ${e?"#d9d9e3":"#2c2c3a"};
        border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,${e?".18":".55"});
        font-size: ${a&&a.appearance&&a.appearance.fontSize==="small"&&"13px"||a&&a.appearance&&a.appearance.fontSize==="large"&&"16px"||"14px"};
      }
      .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid ${e?"#ececf2":"#23232f"}; cursor: move; user-select: none; }
      .logo { width: 22px; height: 22px; border-radius: 6px; background: ${t}; display: grid; place-items: center; font-size: 13px; }
      .title { font-weight: 700; font-size: 13px; letter-spacing: .2px; flex: 1; }
      .mode-badge { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; border: 1px solid ${t}; color: ${t}; }
      .icon-btn { background: none; border: none; color: inherit; opacity: .6; cursor: pointer; font-size: 15px; padding: 2px 6px; border-radius: 6px; }
      .icon-btn:hover { opacity: 1; background: ${e?"#f0f0f5":"#23232f"}; }
      .body { overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
      .scores { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
      .score { text-align: center; }
      .score .num { font-weight: 700; font-size: 15px; }
      .score .lbl { font-size: 10px; opacity: .65; margin-top: 1px; }
      .bar { height: 4px; border-radius: 2px; background: ${e?"#e6e6ee":"#26263a"}; margin-top: 4px; overflow: hidden; }
      .bar i { display: block; height: 100%; background: ${t}; border-radius: 2px; }
      .sec-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; opacity: .55; }
      .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .compare .col { min-width: 0; }
      .compare textarea, .compare .orig {
        width: 100%; min-height: 150px; max-height: 240px; resize: vertical;
        background: ${e?"#f7f7fa":"#1b1b26"};
        color: inherit; border: 1px solid ${e?"#d9d9e3":"#2c2c3a"};
        border-radius: 10px; padding: 10px; font-size: 12.5px; line-height: 1.5;
        font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; white-space: pre-wrap;
      }
      .compare .orig { overflow: auto; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .tag { font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid ${e?"#d9d9e3":"#2c2c3a"}; opacity: .85; }
      .tag.warn { border-color: #ef4444; color: #ef4444; }
      .tag.learn { border-color: ${t}; color: ${t}; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      button.act {
        border: none; border-radius: 9px; padding: 8px 14px; font-size: 12.5px; font-weight: 600;
        cursor: pointer; background: ${e?"#ececf2":"#262633"}; color: inherit;
      }
      button.act:hover { filter: brightness(1.12); }
      button.act.primary { background: ${t}; color: #fff; }
      .spin { width: 26px; height: 26px; border: 3px solid ${e?"#e0e0ea":"#2c2c3a"}; border-top-color: ${t};
              border-radius: 50%; animation: spin 0.8s linear infinite; margin: 18px auto; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .empty { opacity: .6; text-align: center; padding: 10px; font-size: 12.5px; }
      .tpl-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .tpl { text-align: left; border: 1px solid ${e?"#d9d9e3":"#2c2c3a"}; background: none; color: inherit;
             border-radius: 10px; padding: 8px 10px; cursor: pointer; font-size: 12px; }
      .tpl:hover { border-color: ${t}; }
      .tpl b { display: block; font-size: 12.5px; margin-bottom: 2px; }
      .tpl span { opacity: .6; font-size: 11px; }
      .toast-host { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px; }
      .toast { background: ${e?"#1a1a24":"#f4f4f8"}; color: ${e?"#fff":"#14141b"};
               padding: 9px 14px; border-radius: 10px; font-size: 12.5px; box-shadow: 0 8px 24px rgba(0,0,0,.3);
               animation: slidein .18s ease-out; max-width: 320px; }
      .toast.err { background: #ef4444; color: #fff; }
      .toast.ok { background: #10b981; color: #fff; }
      @keyframes slidein { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
      @media (max-width: 700px) { .compare { grid-template-columns: 1fr; } .scores { grid-template-columns: repeat(3, 1fr); } }
    `}r(D,"panelCss");let f=null,m=null;function q(){return m||(f=document.createElement("div"),f.id="prism-host",document.documentElement.appendChild(f),m=f.attachShadow({mode:"open"}),m)}r(q,"ensureHost");function l(e){return String(e||"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}r(l,"esc");function d(e,t){const n=q(),i=a&&a.behavior&&a.behavior.toastDuration||2600,o=document.createElement("div");o.className="toast-host",o.innerHTML='<div class="toast '+(t||"")+'">'+l(e)+"</div>",n.appendChild(o),setTimeout(()=>o.remove(),i)}r(d,"toast");function j(e){return e>=75?"#10b981":e>=50?"#f59e0b":"#ef4444"}r(j,"scoreColor");function T(){f&&f.remove(),f=null,m=null}r(T,"closePanel");let M=null;async function b(e){const t=y(),n=e&&e.trim()||O(t).trim();if(!n){d("Type or select a prompt first, then press the coach button.","err"),u({empty:"No prompt detected. Type or select some text and try again."});return}u({loading:!0});const i=R();try{const o=await x({type:"COACH",prompt:n,conversation:i,site:h});if(!o||!o.ok){o&&o.code==="PRIVACY_OPT_IN_REQUIRED"?u({error:o.error,needOptions:!0}):u({error:o&&o.error||"Coaching failed. Please try again."}),d(o&&o.error||"Coaching failed.","err");return}M={original:n,optimized:o.optimized,analysis:o.analysis,notes:o.notes||[],mode:o.mode},u({result:M}),d(o.mode==="offline"?"Coached with the built-in rule engine":o.mode==="offline-fallback"?"AI unavailable \u2014 used rule-based coach":"Prompt optimized with AI",o.mode==="offline-fallback"?"":"ok")}catch{u({error:"Network error \u2014 could not reach the Prism background. Please try again."}),d("Network error, please try again.","err")}}r(b,"coachCurrentPrompt");function u(e){const t=q(),n=document.createElement("style");n.textContent=D(),t.innerHTML="",t.appendChild(n);const i=document.createElement("div");i.className="panel",e&&e.mini===void 0&&!e.loading&&!e.result&&!e.error&&!e.templates&&!e.empty&&(e={empty:"Select an action below."}),i.innerHTML=`
      <div class="head">
        <div class="logo">\u{1F393}</div>
        <div class="title">Prism</div>
        <span class="mode-badge">${l(e&&e.result?e.result.mode==="offline"||e.result.mode==="offline-fallback"?"rule-based":"AI":a&&a.provider!=="offline"?"AI: "+a.provider:"offline")}</span>
        <button class="icon-btn" data-x="templates" title="Templates">\u{1F4CB}</button>
        <button class="icon-btn" data-x="close" title="Close">\u2715</button>
      </div>
      <div class="body"></div>
    `,t.appendChild(i);const o=i.querySelector(".body");B(o,e),i.querySelector('[data-x="close"]').addEventListener("click",T),i.querySelector('[data-x="templates"]').addEventListener("click",()=>F());const c=i.querySelector(".head");return U(i,c),P(i),i}r(u,"openPanel");function P(e){const t=y(),n=14;if(t){const i=t.getBoundingClientRect(),o=e.offsetWidth,c=e.offsetHeight;let g=Math.min(Math.max(n,i.right-o),window.innerWidth-o-n),p=i.top-c-10;p<n&&(p=Math.min(i.bottom+10,window.innerHeight-c-n)),e.style.left=Math.max(n,g)+"px",e.style.top=Math.max(n,p)+"px"}else e.style.right="20px",e.style.bottom="90px"}r(P,"positionPanel");function U(e,t){let n=0,i=0,o=0,c=0,g=!1;t.addEventListener("mousedown",p=>{p.target.closest("button")||(g=!0,n=p.clientX,i=p.clientY,o=e.offsetLeft,c=e.offsetTop,p.preventDefault())}),window.addEventListener("mousemove",p=>{g&&(e.style.left=Math.max(0,o+p.clientX-n)+"px",e.style.top=Math.max(0,c+p.clientY-i)+"px",e.style.right="auto",e.style.bottom="auto")}),window.addEventListener("mouseup",()=>{g=!1})}r(U,"makeDraggable");function B(e,t){if(t.loading){e.innerHTML='<div class="spin"></div><div class="empty">Analyzing your prompt\u2026</div>';return}if(t.error){e.innerHTML='<div class="empty">\u26A0\uFE0F '+l(t.error)+"</div>"+(t.needOptions?'<div class="actions"><button class="act primary" data-x="options">Open settings</button></div>':"");const n=e.querySelector('[data-x="options"]');n&&n.addEventListener("click",()=>x({type:"OPEN_OPTIONS"}));return}if(t.empty){e.innerHTML='<div class="empty">'+l(t.empty)+'</div><div class="actions"><button class="act primary" data-x="coach">\u2728 Coach my prompt</button></div>',e.querySelector('[data-x="coach"]').addEventListener("click",()=>b());return}if(t.templates){X(e);return}t.result&&G(e,t.result)}r(B,"renderBody");function G(e,t){const n=t.analysis.scores,i=r(o=>`<div class="score"><div class="num" style="color:${j(o)}">${o}</div><div class="bar"><i style="width:${o}%"></i></div></div>`,"dim");e.innerHTML=`
      <div class="scores">
        ${i(n.clarity)}${i(n.specificity)}${i(n.efficiency)}${i(n.safety)}
        <div class="score"><div class="num" style="color:${v()}">${n.overall}</div><div class="bar"><i style="width:${n.overall}%"></i></div></div>
      </div>
      <div class="tags">
        <span class="tag">goal: ${l(t.analysis.goal)}</span>
        <span class="tag">tone: ${l(t.analysis.tone)}</span>
        <span class="tag">~${t.analysis.wordCount} words \xB7 ~${t.analysis.tokenEstimate} tokens</span>
        ${(t.notes||[]).map(o=>`<span class="tag ${o.type==="warn"?"warn":o.type==="learn"?"learn":""}">${l(o.text)}</span>`).join("")}
        ${t.analysis.safetyIssues.map(o=>`<span class="tag warn">\u26A0 ${l(o.message)}</span>`).join("")}
      </div>
      <div class="sec-title">Original vs optimized</div>
      <div class="compare">
        <div class="col">
          <div class="sec-title" style="margin-bottom:4px">Original</div>
          <div class="orig">${l(t.original)}</div>
        </div>
        <div class="col">
          <div class="sec-title" style="margin-bottom:4px">Optimized <span style="opacity:.5">(editable)</span></div>
          <textarea class="opt">${l(t.optimized)}</textarea>
        </div>
      </div>
      <div class="actions">
        <button class="act primary" data-x="replace">Replace prompt</button>
        <button class="act" data-x="copy">Copy optimized</button>
        <button class="act" data-x="favorite">\u2606 Favorite</button>
        <button class="act" data-x="rerun">\u21BB Re-coach</button>
      </div>
    `,e.querySelector('[data-x="replace"]').addEventListener("click",()=>{const o=y(),c=e.querySelector(".opt").value;if(!o)return d("Could not find the chat input on this page.","err");A(o,c),d("Prompt replaced \u2014 review and send.","ok"),T()}),e.querySelector('[data-x="copy"]').addEventListener("click",async()=>{const o=e.querySelector(".opt").value;try{await navigator.clipboard.writeText(o),d("Copied to clipboard.","ok")}catch{try{await x({type:"COPY_TEXT",text:o}),d("Copied to clipboard.","ok")}catch{d("Copy failed \u2014 select the text manually.","err")}}}),e.querySelector('[data-x="favorite"]').addEventListener("click",async o=>{try{const c=await x({type:"SAVE_AI_RESULT",entry:{original:t.original,optimized:t.optimized,site:h,goal:t.analysis.goal,mode:t.mode,score:t.analysis.scores.overall,favorite:!0}});c&&c.ok&&(o.target.textContent="\u2605 Favorited",d("Saved to favorites.","ok"))}catch{d("Could not save favorite.","err")}}),e.querySelector('[data-x="rerun"]').addEventListener("click",()=>b(t.original))}r(G,"renderResult");async function F(){u({loading:!0});try{const e=await x({type:"GET_TEMPLATES"});E=e&&e.templates||[],u({templates:!0})}catch{u({error:"Could not load templates."})}}r(F,"openTemplates");function X(e){if(!E.length){e.innerHTML='<div class="empty">No templates found.</div>';return}e.innerHTML='<div class="sec-title">Insert a template</div><div class="tpl-list"></div>';const t=e.querySelector(".tpl-list");for(const n of E){const i=document.createElement("button");i.className="tpl",i.innerHTML="<b>"+l((n.icon||"")+" "+n.name)+"</b><span>"+l(n.category||"")+(n.description?" \u2014 "+l(n.description):"")+"</span>",i.addEventListener("click",()=>{const o=y();if(!o)return d("Could not find the chat input.","err");A(o,n.template),d("Template inserted \u2014 edit the {placeholders} in place.","ok"),T()}),t.appendChild(i)}}r(X,"renderTemplates");let s=null;function _(){s||!(a&&a.behavior&&a.behavior.showButtonOnSites!==!1)||(s=document.createElement("div"),s.id="prism-fab",s.title="Prism (Ctrl+Shift+E)",s.style.cssText=["position:fixed","z-index:2147483645","width:40px","height:40px","border-radius:50%","background:"+v(),"color:#fff","display:grid","place-items:center","font-size:19px","cursor:pointer","box-shadow:0 6px 20px rgba(0,0,0,.35)","user-select:none","transition:transform .12s ease, box-shadow .12s ease"].join(";"),s.textContent="\u{1F48E}",s.addEventListener("mouseenter",()=>{s.style.transform="scale(1.08)"}),s.addEventListener("mouseleave",()=>{s.style.transform="scale(1)"}),s.addEventListener("click",()=>b()),document.documentElement.appendChild(s),w())}r(_,"ensureFab");function w(){if(!s)return;const e=y();if(e){const t=e.getBoundingClientRect(),n=Math.min(t.right-28,window.innerWidth-56),i=Math.max(8,t.top-46);s.style.left=Math.max(8,n)+"px",s.style.top=i+"px"}else s.style.right="20px",s.style.bottom="20px",s.style.left="auto",s.style.top="auto"}r(w,"positionFab");let k=!1;const Y=new ResizeObserver(()=>{k||(k=!0,requestAnimationFrame(()=>{k=!1,w();const e=m&&m.querySelector?m.querySelector(".panel"):null;e&&e.style.top&&P(e)}))});function S(){Y.observe(document.documentElement),new MutationObserver(()=>{clearTimeout(S._t),S._t=setTimeout(()=>{_(),w()},350)}).observe(document.body||document.documentElement,{childList:!0,subtree:!0})}r(S,"startObservers"),window.addEventListener("keydown",e=>{e.ctrlKey&&e.shiftKey&&(e.key==="E"||e.key==="e")&&(e.preventDefault(),e.stopPropagation(),b())},!0),chrome.runtime.onMessage.addListener(e=>{e&&(e.type==="TRIGGER_COACH"&&b(e.selection||""),e.type==="SETTINGS_UPDATED"&&(a=e.settings,s&&(s.style.background=v())))}),r(async function(){await H(),_(),S(),window.addEventListener("resize",w)},"init")()})();
