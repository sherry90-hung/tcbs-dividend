
"use strict";
var DATA = null;
var STATE = { all:[], view:[], cat:"all", sortKey:"ex_sort", sortDir:1 };
function num(v){ return (v===null||v===undefined||v===""||isNaN(v))?null:Number(v); }
function fmtPct(v){ return v===null?"—":v.toFixed(2)+"%"; }
function fmtNum(v,d){ return v===null?"—":v.toFixed(d===undefined?2:d); }
function exSort(d){ var m=(d||"").match(/(\d{1,2})\s*\/\s*(\d{1,2})/); return m?parseInt(m[1],10)*100+parseInt(m[2],10):99999; }

function loadData(payload){
  var recs=(payload&&payload.records)||[];
  STATE.all=recs.map(function(r){
    return {
      stock_code:r.stock_code||"", stock_name:r.stock_name||"",
      current_yield_value:num(r.current_yield_value), cash_dividend_value:num(r.cash_dividend_value),
      closing_price_value:num(r.closing_price_value), pe_value:num(r.pe_value), pb_value:num(r.pb_value),
      ex_dividend_date:r.ex_dividend_date||"—", ex_sort:exSort(r.ex_dividend_date), ex_type:r.ex_type||"息",
      cat:(/^00/.test(r.stock_code||"")?"etf":"stock")
    };
  });
  document.getElementById("updated").textContent=(payload&&payload.updated)?payload.updated:"—";
  document.getElementById("srcCount").textContent=STATE.all.length+" 檔";
  applyFilters();
}
function applyFilters(){
  var kw=document.getElementById("fKeyword").value.trim().toLowerCase();
  var minY=parseFloat(document.getElementById("fYield").value);
  var maxP=parseFloat(document.getElementById("fPrice").value);
  var maxPe=parseFloat(document.getElementById("fPe").value);
  var maxPb=parseFloat(document.getElementById("fPb").value);
  STATE.view=STATE.all.filter(function(r){
    if(STATE.cat!=="all"&&r.cat!==STATE.cat) return false;
    if(kw){ if((r.stock_code+" "+r.stock_name).toLowerCase().indexOf(kw)===-1) return false; }
    if(!isNaN(minY)&&(r.current_yield_value===null||r.current_yield_value<minY)) return false;
    if(!isNaN(maxP)&&(r.closing_price_value===null||r.closing_price_value>maxP)) return false;
    if(!isNaN(maxPe)&&(r.pe_value===null||r.pe_value>maxPe)) return false;
    if(!isNaN(maxPb)&&(r.pb_value===null||r.pb_value>maxPb)) return false;
    return true;
  });
  sortView(); render();
}
function sortView(){
  var k=STATE.sortKey,dir=STATE.sortDir;
  STATE.view.sort(function(a,b){
    var x=a[k],y=b[k];
    if(typeof x==="string"||typeof y==="string"){ x=(x||"")+"";y=(y||"")+""; return x<y?-dir:x>y?dir:0; }
    if(x===null) return 1; if(y===null) return -1; return (x-y)*dir;
  });
}
function heatClass(v){ if(v===null)return""; if(v>=10)return"h4"; if(v>=7)return"h3"; if(v>=5)return"h2"; if(v>=3)return"h1"; return""; }
function render(){
  var tb=document.getElementById("tbody");
  if(!STATE.view.length){ tb.innerHTML='<tr><td colspan="7"><div class="empty"><b>沒有符合條件的標的</b><br>試著放寬條件或清除篩選。</div></td></tr>'; paintHead(); return; }
  tb.innerHTML=STATE.view.map(function(r){
    return '<tr>'+
      '<td class="txt cell-name"><span class="code">'+r.stock_code+'</span><span class="name">'+r.stock_name+'</span></td>'+
      '<td class="txt" data-label="除權息日">'+r.ex_dividend_date+((r.ex_type&&r.ex_type!=="息")?' <span class="badge">'+r.ex_type+'</span>':"")+'</td>'+
      '<td data-label="現金股利"'+(r.cash_dividend_value===null&&r.cat==="etf"?' class="muted-cell"':'')+'>'+(r.cash_dividend_value===null&&r.cat==="etf"?'待公告':fmtNum(r.cash_dividend_value,2))+'</td>'+
      '<td class="yield '+heatClass(r.current_yield_value)+'" data-label="殖利率">'+(r.current_yield_value===null&&r.cat==="etf"&&r.cash_dividend_value===null?'<span class="muted-cell">待公告</span>':fmtPct(r.current_yield_value))+'</td>'+
      '<td class="adv-col" data-label="收盤價">'+fmtNum(r.closing_price_value,2)+'</td>'+
      '<td class="adv-col" data-label="本益比">'+fmtNum(r.pe_value,2)+'</td>'+
      '<td class="adv-col" data-label="股價淨值比">'+fmtNum(r.pb_value,2)+'</td>'+
    '</tr>';
  }).join(""); paintHead();
}
function paintHead(){
  document.querySelectorAll("#headRow th").forEach(function(th){
    var base=th.getAttribute("data-label"); if(base===null){ base=th.textContent.replace(/[ ▲▼⇅]+$/,""); th.setAttribute("data-label",base); }
    if(th.getAttribute("data-key")===STATE.sortKey){ th.innerHTML=base+' <span class="arr">'+(STATE.sortDir===-1?"▼":"▲")+'</span>'; }
    else { th.innerHTML=base+' <span class="sort-ind">⇅</span>'; }
  });
}
document.getElementById("fKeyword").addEventListener("input",applyFilters);
["fYield","fPrice","fPe","fPb"].forEach(function(id){ var e=document.getElementById(id); e.addEventListener("input",applyFilters); e.addEventListener("keydown",function(ev){if(ev.key==="Enter")applyFilters();}); });
document.getElementById("btnApply").addEventListener("click",applyFilters);
document.getElementById("btnReset").addEventListener("click",function(){ ["fKeyword","fYield","fPrice","fPe","fPb"].forEach(function(id){document.getElementById(id).value="";}); applyFilters(); });
document.getElementById("showAdvCols").addEventListener("change",function(){ document.body.classList.toggle("show-adv",this.checked); });
document.getElementById("advToggle").addEventListener("click",function(){ this.classList.toggle("open"); document.getElementById("advPanel").classList.toggle("open"); });
document.getElementById("tabs").addEventListener("click",function(e){ var t=e.target.closest(".tab"); if(!t) return; document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("active");}); t.classList.add("active"); STATE.cat=t.getAttribute("data-cat"); applyFilters(); });
document.querySelectorAll("#headRow th").forEach(function(th){ th.addEventListener("click",function(){ var k=th.getAttribute("data-key"); if(STATE.sortKey===k){STATE.sortDir*=-1;} else {STATE.sortKey=k; STATE.sortDir=(k==="stock_name"||k==="ex_sort")?1:-1;} sortView(); render(); }); });
var DATA_RAW="https://raw.githubusercontent.com/sherry90-hung/tcbs-dividend/main/data.json", DATA_CDN="https://cdn.jsdelivr.net/gh/sherry90-hung/tcbs-dividend@main/data.json";
function _useBaked(){
  if(DATA&&DATA.records){ loadData(DATA); }
  else { document.getElementById("tbody").innerHTML='<tr><td colspan="7"><div class="empty"><b>尚未載入資料</b></div></td></tr>'; }
}
function _feed(j){
  if(j&&j.records&&j.records.length){ loadData(j); return true; }
  if(j&&j.data&&j.data.length){ loadData({updated:(j.data[0]&&j.data[0].updated)||"\u2014", records:j.data}); return true; }
  return false;
}
function _get(url,onfail){
  fetch(url,{cache:"no-store"})
    .then(function(r){ if(!r.ok) throw 0; return r.json(); })
    .then(function(j){ if(!_feed(j)) onfail(); })
    .catch(onfail);
}
_get(DATA_RAW, function(){ _get(DATA_CDN, _useBaked); });


/* ===== 加好友阻擋視窗（A方案：非好友才顯示；整張圖點擊→加好友，置中暗背景）===== */
(function(){
  var FRIEND_URL="https://tcbs.tw/gDTmm";
  var IMG="https://res.cloudinary.com/dneuq3mpl/image/upload/f_auto,q_auto,w_880/v1779772840/%E5%8A%A0%E5%A5%BD%E5%8F%8B%E8%A7%A3%E9%8E%96V2_e3h5oq.png";
  var force=/[?&]gate=1/.test(location.search);
  if(!(window.DVYT_FRIEND===false || force)) return;
  var css="#dvy-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;background:rgba(20,16,12,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:'Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif;}"
   +"#dvy-gate .g-box{width:min(430px,92vw);display:flex;flex-direction:column;gap:12px;margin:auto;}"
   +"#dvy-gate .g-imglink{display:block;line-height:0;cursor:pointer;}"
   +"#dvy-gate .g-imglink img{display:block;width:100%;height:auto;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.4);}"
   +"#dvy-gate a.g-btn{display:block;text-align:center;padding:15px;border-radius:12px;background:#06c755;color:#fff;font-weight:800;font-size:18px;text-decoration:none;box-shadow:0 8px 20px rgba(6,199,85,.35);letter-spacing:.03em;}"
   +"#dvy-gate a.g-btn:hover{background:#05b64c;}";
  var st=document.createElement("style"); st.textContent=css; (document.head||document.documentElement).appendChild(st);
  var ov=document.createElement("div"); ov.id="dvy-gate";
  ov.innerHTML='<div class="g-box"><a class="g-imglink" href="'+FRIEND_URL+'" target="_blank" rel="noopener"><img src="'+IMG+'" alt="加入好友解鎖完整名單"></a><a class="g-btn" href="'+FRIEND_URL+'" target="_blank" rel="noopener">＋ 加入 LINE 好友</a></div>';
  document.body.appendChild(ov);
  document.documentElement.style.overflow="hidden"; document.body.style.overflow="hidden";
})();
