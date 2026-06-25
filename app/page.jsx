"use client";
import { useState, useEffect, useRef } from "react";

const CURRENCY = "RM";
const fmt = n => `${CURRENCY} ${Math.abs(Number(n)).toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = ds => {
  const d = new Date(ds + "T00:00:00");
  const days = ["日","一","二","三","四","五","六"];
  return `${d.getMonth()+1}月${d.getDate()}日 周${days[d.getDay()]}`;
};
const font = "'Kaiti SC','楷体','STKaiti',serif";

const DEFAULT_WALLETS = [
  { id:"maybank",    name:"Maybank",     icon:"🟡", color:"#FFCC00", balance:0, custom:false },
  { id:"rhb",        name:"UOB",         icon:"🔵", color:"#0066CC", balance:0, custom:false },
  { id:"tng",        name:"Touch n Go",  icon:"🔷", color:"#1E90FF", balance:0, custom:false },
  { id:"credit",     name:"信用卡",       icon:"💳", color:"#8B5CF6", balance:0, custom:false },
  { id:"cash",       name:"现金",         icon:"💵", color:"#F59E0B", balance:0, custom:false },
];

const DEFAULT_CATS = {
  expense: ["餐饮","交通","购物","娱乐","医疗","教育","居家","旅行","美容","其他"],
  income:  ["工资","奖金","副业","投资","红包","其他收入"],
  savings: ["定期储蓄","应急基金","旅行基金","投资账户","其他储蓄"],
};
const DEFAULT_BUDGETS = { 餐饮:800, 交通:200, 购物:500, 娱乐:300, 医疗:200 };
const EMOJI_MAP = {
  餐饮:"🍜",交通:"🚇",购物:"🛍️",娱乐:"🎬",医疗:"💊",教育:"📚",居家:"🏠",旅行:"✈️",美容:"💄",其他:"📦",
  工资:"💼",奖金:"🎁",副业:"💡",投资:"📈",红包:"🧧",其他收入:"💰",
  定期储蓄:"🏦",应急基金:"🛡️",旅行基金:"🌍",投资账户:"📊",其他储蓄:"💎",
};
const ei = n => EMOJI_MAP[n] || "📌";
const CAT_COLORS = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#F7DC6F","#DDA0DD","#98D8C8","#F0B27A","#BB8FCE","#85C1E9","#82E0AA","#F1948A"];

// 🔒 配合安全后端的全局云端存储器封装
const cloudGet = async (key, globalPwd, userToken) => {
  try {
    const r = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, {
      method: "GET",
      headers: {
        "x-global-password": globalPwd,
        "x-user-token": userToken
      }
    });
    const j = await r.json();
    return j.data ?? null;
  } catch { return null; }
};

const cloudSet = async (key, value, globalPwd, userToken) => {
  try {
    await fetch("/api/storage", { 
      method:"POST", 
      headers:{
        "Content-Type":"application/json",
        "x-global-password": globalPwd,
        "x-user-token": userToken
      }, 
      body: JSON.stringify({ key, value }) 
    });
  } catch {}
};

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") return window.matchMedia("(prefers-color-scheme: dark)").matches;
    return false;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = e => setDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return dark ? {
    bg:"#000", card:"#1C1C1E", surface:"#2C2C2E", surface2:"#3A3A3C",
    text:"#F2F2F7", sub:"#8E8E93", border:"#38383A",
    accent:"#FFD60A", accentText:"#000", accentSoft:"rgba(255,214,10,0.13)",
    green:"#30D158", red:"#FF453A", orange:"#FF9F0A", blue:"#0A84FF", purple:"#BF5AF2", dark:true,
  } : {
    bg:"#F2F2F7", card:"#FFF", surface:"#F2F2F7", surface2:"#E5E5EA",
    text:"#1C1C1E", sub:"#6C6C70", border:"#E5E5EA",
    accent:"#1C1C1E", accentText:"#FFF", accentSoft:"rgba(28,28,30,0.07)",
    green:"#34C759", red:"#FF3B30", orange:"#FF9500", blue:"#007AFF", purple:"#AF52DE", dark:false,
  };
}

function Toast({ msg, T }) {
  if (!msg) return null;
  return (
    <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:T.text, color:T.bg, padding:"10px 20px", borderRadius:22, fontSize:13, zIndex:1000, whiteSpace:"nowrap", fontFamily:font, pointerEvents:"none", boxShadow:"0 4px 20px rgba(0,0,0,.2)" }}>
      {msg}
    </div>
  );
}

export default function App() {
  const T = useTheme();
  const [tab, setTab]         = useState("chat");
  const [toast, setToast]     = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const toastRef = useRef(null);

  // 🔑 安全机制本地缓存凭证
  const [globalPwd, setGlobalPwd] = useState(() => typeof window !== "undefined" ? localStorage.getItem("mt_global_pwd") || "" : "");
  const [userToken, setUserToken] = useState(() => typeof window !== "undefined" ? localStorage.getItem("mt_user_token") || "" : "");
  const [isAuth, setIsAuth]       = useState(false);

  const [cats, setCats]                 = useState(DEFAULT_CATS);
  const [records, setRecords]           = useState([]);
  const [wallets, setWallets]           = useState(DEFAULT_WALLETS);
  const [budgets, setBudgets]           = useState(DEFAULT_BUDGETS);
  const [wordMap, setWordMap]           = useState({});
  const [aaList, setAaList]             = useState([]);
  const [installments, setInstallments] = useState([]);
  const [settings, setSettings]         = useState({ alertStyle:"strict", defaultWallet:"cash" });

  // 🔐 启动身份验证阻断器
  useEffect(() => {
    if (globalPwd && userToken) {
      (async () => {
        setSyncing(true);
        // 使用提供的凭证尝试获取一次，以验证密码正确性
        const r = await cloudGet("records", globalPwd, userToken);
        if (r !== null) {
          setRecords(r);
          const [w,c,b,wm,aa,inst,s] = await Promise.all([
            cloudGet("wallets", globalPwd, userToken), cloudGet("cats", globalPwd, userToken),
            cloudGet("budgets", globalPwd, userToken), cloudGet("wordmap", globalPwd, userToken),
            cloudGet("aa", globalPwd, userToken), cloudGet("installments", globalPwd, userToken),
            cloudGet("settings", globalPwd, userToken),
          ]);
          if (w)    setWallets(w);
          if (c)    setCats(c);
          if (b)    setBudgets(b);
          if (wm)   setWordMap(wm);
          if (aa)   setAaList(aa);
          if (inst) setInstallments(inst);
          if (s)    setSettings(s);
          setIsAuth(true);
        } else {
          showToast("🔑 凭证无效，请重新验证");
          localStorage.removeItem("mt_global_pwd");
        }
        setSyncing(false);
        setLoaded(true);
      })();
    } else {
      setLoaded(true);
    }
  }, [globalPwd, userToken]);

  // 💾 数据变更时静默安全云同步
  useEffect(() => { if (isAuth && loaded) cloudSet("records", records, globalPwd, userToken); }, [records, loaded, isAuth]);
  useEffect(() => { if (isAuth && loaded) cloudSet("wallets", wallets, globalPwd, userToken); }, [wallets, loaded, isAuth]);
  useEffect(() => { if (isAuth && loaded) cloudSet("cats", cats, globalPwd, userToken); }, [cats, loaded, isAuth]);
  useEffect(() => { if (isAuth && loaded) cloudSet("budgets", budgets, globalPwd, userToken); }, [budgets, loaded, isAuth]);
  useEffect(() => { if (isAuth && loaded) cloudSet("wordmap", wordMap, globalPwd, userToken); }, [wordMap, loaded, isAuth]);
  useEffect(() => { if (isAuth && loaded) cloudSet("aa", aaList, globalPwd, userToken); }, [aaList, loaded, isAuth]);
  useEffect(() => { if (isAuth && loaded) cloudSet("installments", installments, globalPwd, userToken); }, [installments, loaded, isAuth]);
  useEffect(() => { if (isAuth && loaded) cloudSet("settings", settings, globalPwd, userToken); }, [settings, loaded, isAuth]);

  const showToast = msg => { setToast(msg); if (toastRef.current) clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(""), 3000); };
  const addRecord = r  => setRecords(p => [r, ...p]);
  const delRecord = id => setRecords(p => p.filter(r => r.id !== id));
  const updRecord = r  => { setRecords(p => p.map(x => x.id===r.id ? r : x)); if (r.desc&&r.category) setWordMap(m=>({...m,[r.desc.toLowerCase()]:r.category})); };
  const updWallet = (wid, delta) => setWallets(p => p.map(w => w.id===wid ? {...w, balance:(w.balance||0)+delta} : w));

  // 🔓 弹出登录框拦截
  if (!isAuth) {
    return (
      <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:T.bg, color:T.text, fontFamily:font, padding:20 }}>
        <div style={{ background:T.card, padding:24, borderRadius:20, width:"100%", maxWidth:320, boxSizing:"border-box", textAlign:"center", boxShadow:"0 8px 30px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>🔒</div>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>MoneyTalk 安全防线</div>
          <div style={{ fontSize:12, color:T.sub, marginBottom:20 }}>请输入全站访问密码及你的专属暗号</div>
          
          <input type="password" id="g_pwd" placeholder="全站密码 (APP_PASSWORD)" style={{ width:"100%", padding:"10px 12px", marginBottom:10, borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, boxSizing:"border-box" }}/>
          <input type="text" id="u_tok" placeholder="你的专属暗号 (如: jack888)" style={{ width:"100%", padding:"10px 12px", marginBottom:20, borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, boxSizing:"border-box" }}/>
          
          <button onClick={() => {
            const gp = document.getElementById("g_pwd").value;
            const ut = document.getElementById("u_tok").value.trim();
            if(!gp || !ut) return showToast("请填写完整信息");
            localStorage.setItem("mt_global_pwd", gp);
            localStorage.setItem("mt_user_token", ut);
            setGlobalPwd(gp);
            setUserToken(ut);
          }} style={{ width:"100%", padding:12, borderRadius:10, background:T.accent, color:T.accentText, border:"none", fontWeight:700, cursor:"pointer" }}>解锁进入</button>
        </div>
        <Toast msg={toast} T={T} />
      </div>
    );
  }

  if (!loaded) return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:T.bg, color:T.text, fontFamily:font, gap:16 }}>
      <div style={{ fontSize:48 }}>💬</div>
      <div style={{ fontSize:20, fontWeight:700 }}>MoneyTalk</div>
      <div style={{ fontSize:13, color:T.sub }}>正在同步数据…</div>
    </div>
  );

  const tabs = [
    { id:"chat",     icon:"💬", label:"记账" },
    { id:"records",  icon:"📋", label:"记录" },
    { id:"stats",    icon:"📊", label:"统计" },
    { id:"wallets",  icon:"👛", label:"钱包" },
    { id:"settings", icon:"⚙️", label:"设置" },
  ];

  return (
    <div style={{ fontFamily:font, background:T.bg, color:T.text, height:"100vh", maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {syncing && <div style={{ height:2, background:T.accent }} />}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {tab==="chat"     && <ChatTab     T={T} cats={cats} records={records} wallets={wallets} budgets={budgets} wordMap={wordMap} setWordMap={setWordMap} aaList={aaList} setAaList={setAaList} installments={installments} setInstallments={setInstallments} settings={settings} addRecord={addRecord} delRecord={delRecord} updWallet={updWallet} showToast={showToast} globalPwd={globalPwd} userToken={userToken} />}
        {tab==="records"  && <RecordsTab  T={T} records={records} delRecord={delRecord} updRecord={updRecord} cats={cats} wallets={wallets} showToast={showToast} />}
        {tab==="stats"    && <StatsTab    T={T} records={records} budgets={budgets} aaList={aaList} setAaList={setAaList} installments={installments} cats={cats} />}
        {tab==="wallets"  && <WalletsTab  T={T} wallets={wallets} setWallets={setWallets} records={records} showToast={showToast} />}
        {tab==="settings" && <SettingsTab T={T} cats={cats} setCats={setCats} budgets={budgets} setBudgets={setBudgets} wallets={wallets} settings={settings} setSettings={setSettings} installments={installments} setInstallments={setInstallments} addRecord={addRecord} updWallet={updWallet} showToast={showToast} />}
      </div>
      <nav style={{ display:"flex", background:T.card, borderTop:`1px solid ${T.border}`, paddingBottom:"env(safe-area-inset-bottom,4px)", flexShrink:0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, border:"none", background:"none", padding:"9px 0 5px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:tab===t.id?T.accent:T.sub, fontFamily:font }}>
            <span style={{ fontSize:21 }}>{t.icon}</span>
            <span style={{ fontSize:10 }}>{t.label}</span>
          </button>
        ))}
      </nav>
      <Toast msg={toast} T={T} />
    </div>
  );
}

function ChatTab({ T, cats, records, wallets, budgets, wordMap, setWordMap, aaList, setAaList, installments, setInstallments, settings, addRecord, delRecord, updWallet, showToast, globalPwd, userToken }) {
  const [msgs, setMsgs] = useState([{ id:0, role:"bot", text:`你好！把任何消费信息丢给我 💬\n\n• 海底捞 RM45 信用卡\n• 打车 12，奶茶 8 TnG\n• 聚餐 300 AA 小明 小红 信用卡\n• iPhone 4800 分12期 Maybank\n• 发工资 6500 Maybank\n• Maybank 转 200 到 TnG\n• 小明还了AA 100` }]);
  const [input, setInput]       = useState("");
  const [pending, setPending]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [undoItem, setUndoItem] = useState(null);
  const undoRef   = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);
  const push = (role, text) => { setMsgs(p => [...p, { id:Date.now()+Math.random(), role, text }]); };

  const enableUndo = (rid, label) => {
    setUndoItem({ rid, label });
    if (undoRef.current) clearTimeout(undoRef.current);
    undoRef.current = setTimeout(() => setUndoItem(null), 5000);
  };
  const doUndo = () => { if (!undoItem) return; delRecord(undoItem.rid); setUndoItem(null); clearTimeout(undoRef.current); push("bot", `↩️ 已撤销「${undoItem.label}」`); };

  const budgetWarn = (cat, amt) => {
    if (settings.alertStyle==="off"||!budgets[cat]) return null;
    const now=new Date();
    const spent=records.filter(r=>{const d=new Date(r.date+"T00:00:00");return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&r.category===cat&&r.type==="expense";}).reduce((s,r)=>s+r.amount,0)+amt;
    const pct=spent/budgets[cat];
    if(pct>=1) return settings.alertStyle==="fun"?`🚨【${cat}】预算爆了！超 ${fmt(spent-budgets[cat])}`:`提示：本月【${cat}】预算已超支 ${fmt(spent-budgets[cat])}。`;
    if(pct>=0.8) return settings.alertStyle==="fun"?`📊【${cat}】只剩 ${Math.round((1-pct)*100)}% 了～`:`提示：本月【${cat}】预算已用 ${Math.round(pct*100)}%，剩余 ${fmt(budgets[cat]-spent)}。`;
    return null;
  };

  const anomalyCheck = (desc, amt) => {
    const key=(desc||"").toLowerCase().trim();
    const sim=records.filter(r=>r.desc&&r.desc.toLowerCase().includes(key)&&r.type==="expense");
    if(sim.length<3)return null;
    const avg=sim.reduce((s,r)=>s+r.amount,0)/sim.length;
    if(amt>avg*3&&amt-avg>50)return `⚠️「${desc}」金额 ${fmt(amt)} 比平时均值 ${fmt(avg)} 高很多，是输错了吗？`;
    return null;
  };

  const finishRecord = (p, category) => {
    if (p.desc) setWordMap(m=>({...m,[p.desc.toLowerCase()]:category}));
    if (p.isTransfer) {
      if(p.fromWallet&&p.toWallet){updWallet(p.fromWallet,-p.amount);updWallet(p.toWallet,p.amount);const fw=wallets.find(w=>w.id===p.fromWallet)?.name||p.fromWallet;const tw=wallets.find(w=>w.id===p.toWallet)?.name||p.toWallet;push("bot",`🔄 已划转 ${fmt(p.amount)}\n${fw} → ${tw}`);}
      return;
    }
    if (p.isAASettle) {
      const r={id:Date.now()+Math.random(),desc:p.desc,amount:p.amount,category:"其他收入",walletId:p.walletId||"cash",type:"income",date:todayStr(),tags:["#AA收款"]};
      addRecord(r);updWallet(p.walletId||"cash",p.amount);
      setAaList(prev=>{let rem=p.amount;return prev.map(a=>{if(a.settled||rem<=0)return a;if(p.personName&&!a.people?.includes(p.personName))return a;const can=Math.min(a.toCollect-a.collected,rem);rem-=can;const nc=a.collected+can;return{...a,collected:nc,settled:nc>=a.toCollect};});});
      push("bot",`💰 收到AA款 ${fmt(p.amount)}${p.personName?" ("+p.personName+")":""}，已核销！`);
      return;
    }
    if (p.type==="income") {
      const r={id:Date.now()+Math.random(),desc:p.desc,amount:p.amount,category,walletId:p.walletId||"cash",type:"income",date:todayStr(),tags:p.tags||[]};
      addRecord(r);updWallet(r.walletId,p.amount);
      push("bot",`💰 收入已记！\n${ei(category)} ${category} +${fmt(p.amount)}\n💳 ${wallets.find(w=>w.id===r.walletId)?.name||"现金"}`);
      enableUndo(r.id,p.desc);return;
    }
    if (p.isInstallment) {
      const now=new Date();const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
      const inst={id:Date.now()+Math.random(),desc:p.desc,totalAmount:p.amount,monthlyAmount:p.monthlyAmount||p.amount,totalMonths:p.totalMonths||1,category,walletId:p.walletId||"credit",paidMonths:[ym],completed:false,startDate:todayStr(),tags:["#分期付款"]};
      setInstallments(prev=>[inst,...prev]);
      const r={id:Date.now()+Math.random()+1,desc:`${p.desc} (第1/${inst.totalMonths}期)`,amount:inst.monthlyAmount,category,walletId:inst.walletId,type:"expense",date:todayStr(),tags:["#分期付款"]};
      addRecord(r);updWallet(inst.walletId,-inst.monthlyAmount);
      push("bot",`✅ 分期已设置！\n${ei(category)} ${p.desc}\n总额 ${fmt(p.amount)} · 共${inst.totalMonths}期\n每期 ${fmt(inst.monthlyAmount)} · ${wallets.find(w=>w.id===inst.walletId)?.name||"信用卡"}`);
      enableUndo(r.id,p.desc);return;
    }
    if (p.isAA&&p.people?.length>0) {
      const totalPeople=p.people.length+1;const myShare=parseFloat((p.amount/totalPeople).toFixed(2));const toCollect=parseFloat((p.amount-myShare).toFixed(2));
      const r={id:Date.now()+Math.random(),desc:p.desc+" (AA份额)",amount:myShare,category,walletId:p.walletId||"cash",type:"expense",date:todayStr(),tags:[...(p.tags||[]),"#AA"]};
      addRecord(r);updWallet(p.walletId||"cash",-p.amount);
      const aa={id:Date.now()+Math.random()+1,desc:p.desc,total:p.amount,people:p.people,toCollect,collected:0,date:todayStr(),settled:false,perPerson:parseFloat((p.amount/totalPeople).toFixed(2))};
      setAaList(prev=>[aa,...prev]);
      const warn=budgetWarn(category,myShare);
      push("bot",`✅ AA记账！\n${ei(category)} 你的份 ${fmt(myShare)}\n待收：${p.people.join("、")} 各 ${fmt(aa.perPerson)}${warn?"\n\n"+warn:""}`);
      enableUndo(r.id,p.desc);return;
    }
    const r={id:Date.now()+Math.random(),desc:p.desc,amount:p.amount,category,walletId:p.walletId||settings.defaultWallet||"cash",type:"expense",date:todayStr(),tags:p.tags||[]};
    addRecord(r);updWallet(r.walletId,-p.amount);
    const warn=budgetWarn(category,p.amount);
    const wn=wallets.find(w=>w.id===r.walletId)?.name||"现金";
    push("bot",`✅ 已记录！\n${ei(category)} ${category} · ${fmt(p.amount)}\n💳 ${wn}${r.tags.length?" · "+r.tags.join(" "):""}\n${warn?"\n"+warn:""}`.trim());
    enableUndo(r.id,p.desc);
  };

  // 🤖 呼叫全新的本地后端 Gemini 引擎（流式读取）
  const handleSend = async () => {
    const text=input.trim();
    if(!text||loading)return;
    setInput("");
    
    if(pending){
      push("user",text);
      const chosen=cats.expense.includes(text)?text:(text==="是"||text==="对")?pending.suggestedCat:null;
      if(!chosen){push("bot",`请选择：${cats.expense.join("、")}`);return;}
      finishRecord(pending.parsed,chosen);
      const rest=pending.queue.slice(1);
      if(rest.length>0){const nx=rest[0];setPending({parsed:nx.parsed,suggestedCat:nx.suggestedCat,queue:rest});push("bot",`下一笔：「${nx.parsed.desc}」归入【${nx.suggestedCat||"？"}】？`);}
      else setPending(null);
      return;
    }
    
    push("user",text);
    setLoading(true);

    try {
      // 1. 请求自己安全防线包裹的后端路由 `/api/chat`
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-global-password": globalPwd
        },
        body: JSON.stringify({ message: text })
      });

      if (!resp.ok) throw new Error("API Error");

      // 2. 流式数据读取器处理
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let rawText = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunk = decoder.decode(value, { stream: !done });
        rawText += chunk;
      }

      // 3. 清理 AI 可能吐出来的 Markdown 包裹代码
      let cleanJson = rawText.replace(/```json|```/g, "").trim();
      // 提取最外层的完整 JSON 数组结构
      const startIdx = cleanJson.indexOf("[");
      const endIdx = cleanJson.lastIndexOf("]");
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJson = cleanJson.slice(startIdx, endIdx + 1);
      }

      const parsed = JSON.parse(cleanJson);
      setLoading(false);

      if(!Array.isArray(parsed) || parsed.length === 0){
        push("bot", "😅 没识别到财务信息，换个方式试试？");
        return;
      }

      for(const p of parsed){
        if(p.type==="expense" && p.amount){
          const a = anomalyCheck(p.desc, p.amount);
          if(a) { push("bot", a); return; }
        }
      }

      const toConfirm=[];
      for(const p of parsed){
        const fromMap = p.desc && wordMap[p.desc.toLowerCase()];
        if(fromMap && cats.expense.includes(fromMap)) p.category = fromMap;
        
        if(p.isTransfer || p.type==="transfer") finishRecord({...p, isTransfer:true}, "");
        else if(p.isAASettle) finishRecord(p, "");
        else if(p.confidence==="high" && p.category) finishRecord(p, p.category);
        else toConfirm.push({parsed:p, suggestedCat:p.category});
      }

      if(toConfirm.length > 0){
        const first = toConfirm[0];
        setPending({parsed:first.parsed, suggestedCat:first.suggestedCat, queue:toConfirm});
        push("bot", `🤔「${first.parsed.desc} ${fmt(first.parsed.amount)}」\n归入【${first.suggestedCat||"？"}】？${first.suggestedCat?"\n回复「是」或选其他：":"\n请选分类："}\n${cats.expense.join("、")}`);
      }
    } catch (err) {
      setLoading(false);
      push("bot", "解析出错或密码错误，请重新检查 🙏");
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:"14px 16px 10px", background:T.card, borderBottom:`1px solid ${T.border}`, flexShrink:0, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>MoneyTalk 💬</div>
          <div style={{ fontSize:11, color:T.sub }}>专属沙盒: <span style={{color:T.blue}}>{userToken}</span> · Gemini 芯片</div>
        </div>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ background:"none", border:`1px solid ${T.border}`, color:T.sub, padding:"4px 8px", borderRadius:8, fontSize:11, cursor:"pointer" }}>登出</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 12px 6px", display:"flex", flexDirection:"column", gap:10 }}>
        {msgs.map(m=>(
          <div key={m.id} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", alignItems:"flex-end", gap:7 }}>
            {m.role==="bot"&&<span style={{ fontSize:19, flexShrink:0, marginBottom:2 }}>🤖</span>}
            <div style={{ maxWidth:"80%", padding:"10px 14px", borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px", background:m.role==="user"?T.accent:T.card, color:m.role==="user"?T.accentText:T.text, fontSize:14, lineHeight:1.65, whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:font }}>{m.text}</div>
          </div>
        ))}
        {loading&&<div style={{ display:"flex", gap:7, alignItems:"flex-end" }}><span style={{ fontSize:19 }}>🤖</span><div style={{ background:T.card, borderRadius:"18px 18px 18px 4px", padding:"12px 16px", color:T.sub, letterSpacing:4, fontSize:18 }}>···</div></div>}
        <div ref={bottomRef}/>
      </div>
      {undoItem&&(
        <div style={{ padding:"8px 14px", background:T.dark?"#2C2C2E":"#FFF3CD", borderTop:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <span style={{ fontSize:13, color:T.sub }}>已记「{undoItem.label}」</span>
          <button onClick={doUndo} style={{ padding:"5px 14px", borderRadius:14, background:T.orange, border:"none", color:"#fff", fontSize:13, cursor:"pointer", fontWeight:600, fontFamily:font }}>5秒撤销</button>
        </div>
      )}
      {pending&&(
        <div style={{ padding:"8px 12px 6px", background:T.surface, borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
          {pending.suggestedCat&&<button onClick={()=>{push("user","是");finishRecord(pending.parsed,pending.suggestedCat);const r=pending.queue.slice(1);if(r.length>0){const nx=r[0];setPending({parsed:nx.parsed,suggestedCat:nx.suggestedCat,queue:r});push("bot",`下一笔：「${nx.parsed.desc}」归入【${nx.suggestedCat}】？`);}else setPending(null);}} style={{ padding:"6px 14px", borderRadius:20, background:T.accent, color:T.accentText, border:"none", fontSize:13, cursor:"pointer", fontWeight:700, fontFamily:font, marginBottom:7, marginRight:7 }}>✓ 是【{pending.suggestedCat}】</button>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {cats.expense.filter(c=>c!==pending.suggestedCat).map(c=>(
              <button key={c} onClick={()=>{push("user",c);finishRecord(pending.parsed,c);const r=pending.queue.slice(1);if(r.length>0){const nx=r[0];setPending({parsed:nx.parsed,suggestedCat:nx.suggestedCat,queue:r});push("bot",`下一笔：「${nx.parsed.desc}」归入【${nx.suggestedCat}】？`);}else setPending(null);}} style={{ padding:"5px 10px", borderRadius:16, border:`1px solid ${T.border}`, background:T.card, color:T.text, fontSize:12, cursor:"pointer", fontFamily:font }}>{ei(c)} {c}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding:"10px 11px", background:T.card, borderTop:`1px solid ${T.border}`, display:"flex", gap:8, alignItems:"flex-end", flexShrink:0 }}>
        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="输入消费、转账或分期（如：打车 15 tng）" rows={1} style={{ flex:1, border:`1px solid ${T.border}`, borderRadius:22, padding:"11px 15px", background:T.surface, color:T.text, fontSize:14, resize:"none", outline:"none", fontFamily:font, lineHeight:1.5, maxHeight:110 }}/>
        <button onClick={handleSend} style={{ width:42, height:42, borderRadius:"50%", border:"none", background:T.accent, color:T.accentText, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontWeight:700 }}>↑</button>
      </div>
    </div>
  );
}

// 保持 RecordsTab, StatsTab, WalletsTab, SettingsTab 等其他UI组件不变（直接沿用你原本精美的UI逻辑）
function RecordsTab({ T, records, delRecord, updRecord, cats, wallets, showToast }) {
  const [search, setSearch]         = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [openId, setOpenId]         = useState(null);
  const filtered = search.trim() ? records.filter(r=>[r.desc,r.category,...(r.tags||[])].join(" ").toLowerCase().includes(search.toLowerCase())) : records;
  const grouped = {};
  filtered.forEach(r=>{ if(!grouped[r.date])grouped[r.date]=[]; grouped[r.date].push(r); });
  const dates = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const searchTotal = search ? filtered.filter(r=>r.type==="expense").reduce((s,r)=>s+r.amount,0) : 0;
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:"14px 14px 10px", background:T.card, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:700, marginBottom:9 }}>📋 消费记录</div>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:T.surface, borderRadius:12, padding:"8px 12px" }}>
          <span style={{ color:T.sub }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索描述、分类、#标签" style={{ flex:1, border:"none", background:"none", color:T.text, fontSize:14, outline:"none", fontFamily:font }}/>
          {search&&<button onClick={()=>setSearch("")} style={{ border:"none", background:"none", color:T.sub, cursor:"pointer", fontSize:18 }}>×</button>}
        </div>
        {search&&<div style={{ marginTop:5, fontSize:12, color:T.sub }}>{filtered.length} 条 · 支出 <span style={{ color:T.red, fontWeight:600 }}>{fmt(searchTotal)}</span></div>}
      </div>
      <div style={{ flex:1, overflowY:"auto" }}>
        {dates.length===0&&<div style={{ textAlign:"center", color:T.sub, padding:60, fontSize:14 }}>{search?"没找到相关记录":"暂无记录～"}</div>}
        {dates.map(date=>{
          const dayExp=grouped[date].filter(r=>r.type==="expense").reduce((s,r)=>s+r.amount,0);
          return (
            <div key={date}>
              <div style={{ padding:"10px 14px 4px", display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, color:T.sub, fontWeight:600 }}>{fmtDate(date)}</span>
                <span style={{ fontSize:12, color:T.red, fontWeight:600 }}>-{fmt(dayExp)}</span>
              </div>
              {grouped[date].map(r=>(
                <RecordRow key={r.id} T={T} r={r} wallets={wallets} isOpen={openId===r.id} onOpen={()=>setOpenId(r.id)} onClose={()=>setOpenId(null)} onEdit={()=>setEditTarget({...r})} onDelete={()=>{ delRecord(r.id); showToast("已删除"); setOpenId(null); }}/>
              ))}
            </div>
          );
        })}
        <div style={{ height:20 }}/>
      </div>
      {editTarget&&<EditModal T={T} record={editTarget} cats={cats} wallets={wallets} onSave={r=>{updRecord(r);setEditTarget(null);showToast("已保存");}} onClose={()=>setEditTarget(null)}/>}
    </div>
  );
}
function RecordRow({ T, r, wallets, isOpen, onOpen, onClose, onEdit, onDelete }) {
  const startX = useRef(null);
  const wallet = wallets.find(w=>w.id===r.walletId);
  return (
    <div style={{ position:"relative", overflow:"hidden", margin:"0 10px 5px" }} onTouchStart={e=>{startX.current=e.touches[0].clientX;}} onTouchEnd={e=>{ if(startX.current===null)return; const dx=e.changedTouches[0].clientX-startX.current; if(dx<-50)onOpen(); else if(dx>50){onEdit();onClose();} else onClose(); startX.current=null; }}>
      <div style={{ position:"absolute", right:0, top:0, bottom:0, display:"flex", borderRadius:12, overflow:"hidden" }}>
        <button onClick={()=>{onEdit();onClose();}} style={{ width:58, background:"#007AFF", border:"none", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:font }}>编辑</button>
        <button onClick={onDelete} style={{ width:58, background:T.red, border:"none", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:font }}>删除</button>
      </div>
      <div style={{ background:T.card, borderRadius:12, padding:"11px 12px", display:"flex", alignItems:"center", gap:9, transform:isOpen?"translateX(-116px)":"translateX(0)", transition:"transform .25s", position:"relative", zIndex:1 }}>
        <div style={{ width:40, height:40, borderRadius:11, background:T.surface, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{ei(r.category)}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.desc}</div>
          <div style={{ fontSize:11, color:T.sub, marginTop:2, display:"flex", gap:5, flexWrap:"wrap" }}>
            <span>{r.category}</span>
            {wallet&&<span>{wallet.icon} {wallet.name}</span>}
            {(r.tags||[]).map(tg=><span key={tg} style={{ color:T.blue }}>{tg}</span>)}
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:15, fontWeight:700, color:r.type==="income"?T.green:T.text }}>{r.type==="income"?"+":"-"}{fmt(r.amount)}</div>
          <div style={{ fontSize:11, color:T.sub, marginTop:2 }}>{r.date.slice(5)}</div>
        </div>
      </div>
    </div>
  );
}
function EditModal({ T, record, cats, wallets, onSave, onClose }) {
  const [r, setR] = useState({...record});
  const allCats = [...cats.expense,...cats.income,...cats.savings];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"flex-end", zIndex:200 }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ width:"100%", maxWidth:430, margin:"0 auto", background:T.card, borderRadius:"22px 22px 0 0", padding:"18px 18px 40px" }}>
        <div style={{ width:36, height:4, background:T.border, borderRadius:2, margin:"0 auto 15px" }}/>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:13 }}>编辑记录</div>
        {[{l:"描述",k:"desc",t:"text"},{l:"金额",k:"amount",t:"number"},{l:"日期",k:"date",t:"date"}].map(f=>(
          <div key={f.k} style={{ marginBottom:9 }}>
            <div style={{ fontSize:12, color:T.sub, marginBottom:3 }}>{f.l}</div>
            <input type={f.t} value={r[f.k]||""} onChange={e=>setR({...r,[f.k]:f.t==="number"?parseFloat(e.target.value)||0:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, boxSizing:"border-box", fontFamily:font }}/>
          </div>
        ))}
        <div style={{ marginBottom:9 }}>
          <div style={{ fontSize:12, color:T.sub, marginBottom:3 }}>分类</div>
          <select value={r.category||""} onChange={e=>setR({...r,category:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, boxSizing:"border-box" }}>
            {allCats.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:15 }}>
          <div style={{ fontSize:12, color:T.sub, marginBottom:3 }}>钱包</div>
          <select value={r.walletId||"cash"} onChange={e=>setR({...r,walletId:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, boxSizing:"border-box" }}>
            {wallets.map(w=><option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:11, borderRadius:12, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, cursor:"pointer", fontFamily:font }}>取消</button>
          <button onClick={()=>onSave(r)} style={{ flex:1, padding:11, borderRadius:12, border:"none", background:T.accent, color:T.accentText, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:font }}>保存</button>
        </div>
      </div>
    </div>
  );
}
function StatsTab({ T, records, budgets, aaList, setAaList, installments, cats }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()+1);
  const [view, setView]   = useState("expense");
  const [drill, setDrill] = useState(null);
  const navM = d => { let m=month+d,y=year; if(m>12){m=1;y++;} if(m<1){m=12;y--;} setMonth(m);setYear(y); };
  const mRecs=records.filter(r=>{const d=new Date(r.date+"T00:00:00");return d.getFullYear()===year&&d.getMonth()+1===month;});
  const viewRecs=mRecs.filter(r=>r.type===view);
  const total=viewRecs.reduce((s,r)=>s+r.amount,0);
  const catMap={}; viewRecs.forEach(r=>{catMap[r.category]=(catMap[r.category]||0)+r.amount;});
  const catList=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const yearMonthly=Array.from({length:12},(_,i)=>records.filter(r=>{const d=new Date(r.date+"T00:00:00");return d.getFullYear()===year&&d.getMonth()===i&&r.type==="expense";}).reduce((s,r)=>s+r.amount,0));
  const maxM=Math.max(...yearMonthly,1);
  const pendingAA=aaList.filter(a=>!a.settled);
  const activeInst=installments.filter(i=>!i.completed);
  const tagMap={}; mRecs.filter(r=>r.type==="expense").forEach(r=>(r.tags||[]).forEach(tg=>{if(!tg.startsWith("#分期")&&tg!=="#AA")tagMap[tg]=(tagMap[tg]||0)+r.amount;}));
  const topTags=Object.entries(tagMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:"14px 14px 10px", background:T.card, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>📊 统计</div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:9 }}>
          <button onClick={()=>navM(-1)} style={{ width:30, height:30, borderRadius:8, border:"none", background:T.surface, color:T.text, cursor:"pointer", fontSize:16 }}>‹</button>
          <span style={{ flex:1, textAlign:"center", fontSize:15, fontWeight:600 }}>{year}年{month}月</span>
          <button onClick={()=>navM(1)} style={{ width:30, height:30, borderRadius:8, border:"none", background:T.surface, color:T.text, cursor:"pointer", fontSize:16 }}>›</button>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[["expense","支出"],["income","收入"],["savings","储蓄"]].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} style={{ flex:1, padding:"6px 0", borderRadius:10, border:"none", background:view===k?T.accent:T.surface, color:view===k?T.accentText:T.sub, fontSize:13, cursor:"pointer", fontWeight:view===k?700:400, fontFamily:font }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 12px 20px" }}>
        {pendingAA.length>0&&(
          <div style={{ background:T.dark?"#1A1400":"#FFF8E7", borderRadius:14, padding:"12px 13px", marginBottom:11, border:`1px solid ${T.orange}44` }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.orange, marginBottom:7 }}>🤝 AA待收 · {pendingAA.length}笔 · {fmt(pendingAA.reduce((s,a)=>s+(a.toCollect-a.collected),0))}</div>
            {pendingAA.map(a=>(
              <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{a.desc}</div>
                  <div style={{ fontSize:11, color:T.sub }}>{a.people?.join("、")} · 待收 {fmt(a.toCollect-a.collected)}</div>
                </div>
                <button onClick={()=>setAaList(p=>p.map(x=>x.id===a.id?{...x,settled:true}:x))} style={{ padding:"4px 10px", borderRadius:12, background:T.green, border:"none", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:font }}>已全收</button>
              </div>
            ))}
          </div>
        )}
        {activeInst.length>0&&(
          <div style={{ background:T.dark?"#001A2C":"#EFF6FF", borderRadius:14, padding:"12px 13px", marginBottom:11, border:`1px solid ${T.blue}44` }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.blue, marginBottom:7 }}>💳 分期追踪 · {activeInst.length}项</div>
            {activeInst.map(i=>{const paid=i.paidMonths?.length||0;const left=i.totalMonths-paid;return(
              <div key={i.id} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{i.desc}</span>
                  <span style={{ fontSize:12, color:T.sub }}>剩{left}期 · {fmt(i.monthlyAmount*left)}</span>
                </div>
                <div style={{ height:5, background:T.surface, borderRadius:3 }}>
                  <div style={{ height:"100%", width:`${(paid/i.totalMonths)*100}%`, background:T.blue, borderRadius:3, transition:"width .5s" }}/>
                </div>
                <div style={{ fontSize:11, color:T.sub, marginTop:2 }}>已还{paid}/{i.totalMonths}期 · 每期{fmt(i.monthlyAmount)}</div>
              </div>
            );})}
          </div>
        )}
        <div style={{ background:`linear-gradient(135deg,${T.dark?"#111827,#1f2937":"#1C1C1E,#2C2C2E"})`, borderRadius:16, padding:"20px", marginBottom:12, color:"#fff" }}>
          <div style={{ fontSize:12, opacity:.7 }}>本月{view==="expense"?"总支出":view==="income"?"总收入":"总储蓄"}</div>
          <div style={{ fontSize:32, fontWeight:800, marginTop:4, letterSpacing:-1 }}>{fmt(total)}</div>
          <div style={{ fontSize:12, opacity:.6, marginTop:4 }}>{viewRecs.length} 笔</div>
        </div>
        {catList.length>0&&(
          <div style={{ background:T.card, borderRadius:16, padding:"14px", marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:11 }}>分类明细</div>
            {catList.map(([cat,amt],i)=>{const bgt=budgets[cat];const pct=bgt?Math.min(amt/bgt,1):amt/total;const over=bgt&&amt>bgt;return(
              <div key={cat} style={{ marginBottom:12, cursor:"pointer" }} onClick={()=>setDrill(drill===cat?null:cat)}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:13 }}>{ei(cat)} {cat}</span>
                  <span style={{ fontSize:13, fontWeight:600 }}>{fmt(amt)}{bgt&&<span style={{ color:over?T.red:T.sub, fontSize:11 }}> /{fmt(bgt)}</span>}</span>
                </div>
                <div style={{ height:6, background:T.surface, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct*100}%`, background:over?T.red:CAT_COLORS[i%CAT_COLORS.length], borderRadius:3, transition:"width .5s" }}/>
                </div>
                {drill===cat&&(
                  <div style={{ marginTop:7, background:T.surface, borderRadius:10, padding:"7px 10px", maxHeight:160, overflowY:"auto" }}>
                    {viewRecs.filter(r=>r.category===cat).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>(
                      <div key={r.id} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${T.border}`, fontSize:12 }}>
                        <span style={{ color:T.sub }}>{r.date.slice(5)} {r.desc}</span>
                        <span style={{ fontWeight:600 }}>{fmt(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
        {topTags.length>0&&(
          <div style={{ background:T.card, borderRadius:16, padding:"14px", marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:9 }}>🏷️ 标签分析</div>
            {topTags.map(([tag,amt])=>(<div key={tag} style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}><span style={{ fontSize:13, color:T.blue }}>{tag}</span><span style={{ fontSize:13, fontWeight:600 }}>{fmt(amt)}</span></div>))}
          </div>
        )}
        <div style={{ background:T.card, borderRadius:16, padding:"14px" }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:9 }}>{year}年月度支出</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:70 }}>
            {yearMonthly.map((amt,i)=>(
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <div style={{ width:"100%", height:Math.max(3,(amt/maxM)*54), background:i+1===month?T.accent:T.surface2, borderRadius:"3px 3px 0 0", transition:"height .4s" }}/>
                <span style={{ fontSize:9, color:i+1===month?T.accent:T.sub }}>{i+1}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:7, textAlign:"right", fontSize:12, color:T.sub }}>全年：{fmt(yearMonthly.reduce((s,v)=>s+v,0))}</div>
        </div>
      </div>
    </div>
  );
}
function WalletsTab({ T, wallets, setWallets, records, showToast }) {
  const [editId, setEditId]   = useState(null);
  const [editBal, setEditBal] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ name:"", icon:"🏦", color:"#4ECDC4" });
  const totalAssets=wallets.filter(w=>w.id!=="credit").reduce((s,w)=>s+(w.balance||0),0);
  const creditDebt=wallets.find(w=>w.id==="credit")?.balance||0;
  const now=new Date();
  const monthRecs=records.filter(r=>{const d=new Date(r.date+"T00:00:00");return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();});
  const ICONS=["🏦","💳","💵","🟡","🔵","🟢","🔴","🟤","🧡","💜","⚫","🟩"];
  const COLORS=["#FFCC00","#C8102E","#1E90FF","#00B14F","#EE4D2D","#8B5CF6","#F59E0B","#8B4513","#FFD700","#006400","#00008B","#4ECDC4"];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:"14px 14px 10px", background:T.card, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:700 }}>👛 钱包总览</div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 12px" }}>
        <div style={{ background:`linear-gradient(135deg,${T.dark?"#0d2137,#1a3a5c":"#0A2540,#1a4a7a"})`, borderRadius:16, padding:"20px", marginBottom:13, color:"#fff" }}>
          <div style={{ fontSize:12, opacity:.7 }}>总资产（不含信用卡）</div>
          <div style={{ fontSize:32, fontWeight:800, marginTop:4 }}>{fmt(totalAssets)}</div>
          {creditDebt<0&&<div style={{ fontSize:12, opacity:.6, marginTop:3 }}>信用卡欠款：{fmt(Math.abs(creditDebt))}</div>}
        </div>
        {wallets.map(w=>{
          const mExp=monthRecs.filter(r=>r.walletId===w.id&&r.type==="expense").reduce((s,r)=>s+r.amount,0);
          return(
            <div key={w.id} style={{ background:T.card, borderRadius:14, padding:"13px", marginBottom:9 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:w.color+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:21 }}>{w.icon}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700 }}>{w.name}</div>
                    <div style={{ fontSize:11, color:T.sub, marginTop:1 }}>本月支出 {fmt(mExp)}</div>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  {editId===w.id?(
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <input type="number" value={editBal} onChange={e=>setEditBal(e.target.value)} style={{ width:80, padding:"4px 8px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13 }}/>
                      <button onClick={()=>{setWallets(p=>p.map(x=>x.id===w.id?{...x,balance:parseFloat(editBal)||0}:x));setEditId(null);showToast("余额已更新");}} style={{ padding:"4px 10px", borderRadius:8, background:T.accent, color:T.accentText, border:"none", fontSize:12, cursor:"pointer" }}>✓</button>
                      <button onClick={()=>setEditId(null)} style={{ padding:"4px 8px", borderRadius:8, background:T.surface, color:T.sub, border:"none", fontSize:12, cursor:"pointer" }}>✕</button>
                    </div>
                  ):(
                    <>
                      <div style={{ fontSize:17, fontWeight:800, color:w.id==="credit"&&w.balance<0?T.red:T.text }}>{fmt(w.balance||0)}</div>
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:2 }}>
                        <button onClick={()=>{setEditId(w.id);setEditBal(String(w.balance||0));}} style={{ fontSize:11, color:T.blue, background:"none", border:"none", cursor:"pointer", fontFamily:font }}>编辑余额</button>
                        {w.custom&&<button onClick={()=>{setWallets(p=>p.filter(x=>x.id!==w.id));showToast("已删除");}} style={{ fontSize:11, color:T.red, background:"none", border:"none", cursor:"pointer", fontFamily:font }}>删除</button>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!showAdd?(
          <button onClick={()=>setShowAdd(true)} style={{ width:"100%", padding:13, borderRadius:14, border:`2px dashed ${T.border}`, background:"none", color:T.sub, fontSize:14, cursor:"pointer", fontFamily:font }}>＋ 添加自定义钱包</button>
        ):(
          <div style={{ background:T.card, borderRadius:14, padding:14, marginTop:6 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:10 }}>新增钱包</div>
            <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="钱包名称" style={{ width:"100%", marginBottom:9, padding:"9px 12px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, boxSizing:"border-box", fontFamily:font }}/>
            <div style={{ fontSize:12, color:T.sub, marginBottom:5 }}>图标</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:9 }}>
              {ICONS.map(ic=>(<button key={ic} onClick={()=>setForm(p=>({...p,icon:ic}))} style={{ width:36, height:36, borderRadius:9, border:`2px solid ${form.icon===ic?T.accent:T.border}`, background:T.surface, fontSize:18, cursor:"pointer" }}>{ic}</button>))}
            </div>
            <div style={{ fontSize:12, color:T.sub, marginBottom:5 }}>颜色</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:13 }}>
              {COLORS.map(c=>(<button key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:"50%", border:`2px solid ${form.color===c?T.text:"transparent"}`, background:c, cursor:"pointer" }}/>))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, cursor:"pointer", fontFamily:font }}>取消</button>
              <button onClick={()=>{if(!form.name)return;setWallets(p=>[...p,{id:"c_"+Date.now(),name:form.name,icon:form.icon,color:form.color,balance:0,custom:true}]);setShowAdd(false);setForm({name:"",icon:"🏦",color:"#4ECDC4"});showToast("钱包已添加");}} style={{ flex:1, padding:"10px", borderRadius:10, background:T.accent, color:T.accentText, border:"none", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:font }}>添加</button>
            </div>
          </div>
        )}
        <div style={{ height:16 }}/>
      </div>
    </div>
  );
}
function SettingsTab({ T, cats, setCats, budgets, setBudgets, wallets, settings, setSettings, installments, setInstallments, addRecord, updWallet, showToast }) {
  const [open, setOpen]               = useState(null);
  const [newCat, setNewCat]           = useState({});
  const [budgetDraft, setBudgetDraft] = useState({...budgets});
  const sections=[{key:"expense",icon:"💸",label:"支出分类"},{key:"income",icon:"💰",label:"收入分类"},{key:"savings",icon:"🏦",label:"储蓄分类"}];
  const addCat=k=>{const v=(newCat[k]||"").trim();if(!v)return;if((cats[k]||[]).includes(v)){showToast("已存在");return;}setCats(p=>({...p,[k]:[...(p[k]||[]),v]}));setNewCat(p=>({...p,[k]:""}));};
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:"14px 14px 10px", background:T.card, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:700 }}>⚙️ 设置</div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 12px" }}>
        <div style={{ background:T.card, borderRadius:14, padding:"14px 15px", marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:9 }}>🔔 预算提醒风格</div>
          {[["strict","严格版 · 客观陈述"],["fun","轻松版 · 幽默调侃"],["off","关闭提醒"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSettings(s=>({...s,alertStyle:k}))} style={{ display:"block", width:"100%", padding:"9px 12px", marginBottom:6, borderRadius:10, border:`1.5px solid ${settings.alertStyle===k?T.accent:T.border}`, background:settings.alertStyle===k?T.accentSoft:"transparent", color:T.text, textAlign:"left", fontSize:13, cursor:"pointer", fontFamily:font }}>
              {settings.alertStyle===k?"● ":"○ "}{l}
            </button>
          ))}
        </div>
        <div style={{ background:T.card, borderRadius:14, padding:"14px 15px", marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>👛 默认钱包</div>
          <select value={settings.defaultWallet} onChange={e=>setSettings(s=>({...s,defaultWallet:e.target.value}))} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, boxSizing:"border-box" }}>
            {wallets.map(w=><option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
          </select>
        </div>
        <div style={{ background:T.card, borderRadius:14, marginBottom:10, overflow:"hidden" }}>
          <button onClick={()=>setOpen(open==="budget"?null:"budget")} style={{ width:"100%", padding:"14px 15px", border:"none", background:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", color:T.text, fontFamily:font, fontSize:14, fontWeight:700 }}>
            <span>📊 分类月预算</span><span style={{ color:T.sub, transform:open==="budget"?"rotate(180deg)":"none", transition:"transform .2s", fontSize:18 }}>⌄</span>
          </button>
          {open==="budget"&&(
            <div style={{ padding:"0 15px 14px" }}>
              {cats.expense.map(c=>(
                <div key={c} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:13, width:70, flexShrink:0 }}>{ei(c)} {c}</span>
                  <input type="number" value={budgetDraft[c]||""} onChange={e=>setBudgetDraft(p=>({...p,[c]:parseFloat(e.target.value)||0}))} placeholder="不限" style={{ flex:1, padding:"6px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13 }}/>
                  <span style={{ fontSize:11, color:T.sub, flexShrink:0 }}>RM/月</span>
                </div>
              ))}
              <button onClick={()=>{setBudgets(budgetDraft);showToast("预算已保存");}} style={{ width:"100%", padding:"10px", borderRadius:10, background:T.accent, color:T.accentText, border:"none", fontSize:14, cursor:"pointer", fontWeight:600, fontFamily:font }}>保存预算</button>
            </div>
          )}
        </div>
        <div style={{ background:T.card, borderRadius:14, marginBottom:10, overflow:"hidden" }}>
          <button onClick={()=>setOpen(open==="inst"?null:"inst")} style={{ width:"100%", padding:"14px 15px", border:"none", background:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", color:T.text, fontFamily:font, fontSize:14, fontWeight:700 }}>
            <span>💳 分期管理 · {installments.filter(i=>!i.completed).length}项</span><span style={{ color:T.sub, transform:open==="inst"?"rotate(180deg)":"none", transition:"transform .2s", fontSize:18 }}>⌄</span>
          </button>
          {open==="inst"&&(
            <div style={{ padding:"0 14px 14px" }}>
              {installments.length===0&&<div style={{ color:T.sub, fontSize:13, textAlign:"center", padding:"10px 0" }}>暂无分期</div>}
              {installments.map(i=>{const paid=i.paidMonths?.length||0;return(
                <div key={i.id} style={{ padding:"10px 0", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600 }}>{i.desc}</div>
                      <div style={{ fontSize:11, color:T.sub, marginTop:2 }}>每期 {fmt(i.monthlyAmount)} · 已还{paid}/{i.totalMonths}期</div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      {!i.completed&&<button onClick={()=>{const now=new Date();const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;if((i.paidMonths||[]).includes(ym)){showToast("本月已记录");return;}const r={id:Date.now()+Math.random(),desc:`${i.desc} (第${paid+1}/${i.totalMonths}期)`,amount:i.monthlyAmount,category:i.category,walletId:i.walletId,type:"expense",date:todayStr(),tags:["#分期付款"]};addRecord(r);updWallet(i.walletId,-i.monthlyAmount);setInstallments(p=>p.map(x=>x.id===i.id?{...x,paidMonths:[...(x.paidMonths||[]),ym],completed:paid+1>=i.totalMonths}:x));showToast(`已记录第${paid+1}期`);}} style={{ fontSize:11, padding:"4px 8px", borderRadius:10, background:T.accentSoft, color:T.accent, border:`1px solid ${T.accent}`, cursor:"pointer", fontFamily:font }}>记本月</button>}
                      <button onClick={()=>setInstallments(p=>p.filter(x=>x.id!==i.id))} style={{ fontSize:11, color:T.red, background:"none", border:"none", cursor:"pointer" }}>删除</button>
                    </div>
                  </div>
                  {i.completed&&<div style={{ fontSize:11, color:T.green, marginTop:3 }}>✅ 已还清</div>}
                </div>
              );})}
            </div>
          )}
        </div>
        {sections.map(s=>(
          <div key={s.key} style={{ background:T.card, borderRadius:14, marginBottom:10, overflow:"hidden" }}>
            <button onClick={()=>setOpen(open===s.key?null:s.key)} style={{ width:"100%", padding:"14px 15px", border:"none", background:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", color:T.text, fontFamily:font, fontSize:14, fontWeight:700 }}>
              <span>{s.icon} {s.label}</span><span style={{ color:T.sub, transform:open===s.key?"rotate(180deg)":"none", transition:"transform .2s", fontSize:18 }}>⌄</span>
            </button>
            {open===s.key&&(
              <div style={{ padding:"0 14px 14px" }}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                  {(cats[s.key]||[]).map(item=>(<div key={item} style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 10px", background:T.surface, borderRadius:18, fontSize:13 }}><span>{ei(item)} {item}</span><button onClick={()=>setCats(p=>({...p,[s.key]:p[s.key].filter(c=>c!==item)}))} style={{ background:"none", border:"none", color:T.red, cursor:"pointer", fontSize:15, padding:0, lineHeight:1 }}>×</button></div>))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={newCat[s.key]||""} onChange={e=>setNewCat(p=>({...p,[s.key]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addCat(s.key)} placeholder="添加新分类" style={{ flex:1, padding:"8px 12px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:font }}/>
                  <button onClick={()=>addCat(s.key)} style={{ padding:"8px 14px", borderRadius:10, background:T.accent, color:T.accentText, border:"none", fontSize:13, cursor:"pointer", fontFamily:font }}>添加</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{ textAlign:"center", color:T.sub, fontSize:12, padding:"18px 0 40px", lineHeight:2 }}>
          MoneyTalk · Web + PWA · RM<br/>数据安全存储在 Vercel 云端
        </div>
      </div>
    </div>
  );
}
