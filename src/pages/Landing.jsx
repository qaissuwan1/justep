import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const linkReset = { textDecoration: "none" };

const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{font-family:'Inter',sans-serif;background:#fff;color:#1E2A4A;}

/* ─── NAVBAR ─── */
.nav{position:sticky;top:0;z-index:100;background:rgba(255,255,255,0.95);backdrop-filter:blur(12px);border-bottom:1px solid #E2E8F0;padding:0 48px;height:64px;display:flex;align-items:center;justify-content:space-between;}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none;}
.logo-sq{width:34px;height:34px;background:linear-gradient(135deg,#4F8EF7,#38BDF8);border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:800;}
.logo-txt{font-size:18px;font-weight:800;color:#1E2A4A;letter-spacing:-0.3px;}
.logo-txt span{color:#4F8EF7;}
.nav-right{display:flex;align-items:center;gap:18px;}
.nav-links{display:flex;align-items:center;gap:4px;}
.nav-link{padding:8px 14px;font-size:14px;color:#475569;border-radius:7px;cursor:pointer;border:none;background:none;text-decoration:none;transition:all 0.2s;}
.nav-link:hover{color:#1E2A4A;background:#F8FAFF;}
.nav-actions{display:flex;align-items:center;gap:8px;}
.btn-ghost{padding:9px 18px;font-size:14px;font-weight:600;color:#1E2A4A;border:1.5px solid #E2E8F0;border-radius:9px;background:#fff;cursor:pointer;transition:all 0.2s;}
.btn-ghost:hover{border-color:#4F8EF7;color:#4F8EF7;}
.btn-primary{padding:9px 20px;font-size:14px;font-weight:700;color:#fff;background:#1E2A4A;border:none;border-radius:9px;cursor:pointer;transition:all 0.2s;}
.btn-primary:hover{background:#2D4070;transform:translateY(-1px);box-shadow:0 4px 14px rgba(30,42,74,0.25);}

/* ─── HERO ─── */
.hero{padding:80px 48px 60px;text-align:center;background:linear-gradient(180deg,#F8FAFF 0%,#fff 100%);}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:#EEF3FF;color:#4F8EF7;font-size:13px;font-weight:600;padding:6px 14px;border-radius:999px;margin-bottom:28px;border:1px solid #C7D9FF;}
.hero-badge-dot{width:6px;height:6px;border-radius:50%;background:#4F8EF7;}
.hero h1{font-size:56px;font-weight:900;line-height:1.1;letter-spacing:-1.5px;color:#1E2A4A;margin-bottom:20px;}
.hero h1 span{color:#4F8EF7;background:linear-gradient(135deg,#4F8EF7,#38BDF8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.hero-desc{font-size:18px;color:#475569;max-width:540px;margin:0 auto 36px;line-height:1.65;}
.hero-btn{display:inline-flex;align-items:center;gap:8px;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;background:linear-gradient(135deg,#1E2A4A,#2D4070);border:none;border-radius:12px;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 20px rgba(30,42,74,0.3);}
.hero-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(30,42,74,0.35);}
.hero-btn-arrow{font-size:18px;transition:transform 0.2s;}
.hero-btn:hover .hero-btn-arrow{transform:translateX(4px);}

/* ─── DEMO WIDGET ─── */
.demo-wrap{margin:52px auto 0;max-width:820px;position:relative;}
.demo-glow{position:absolute;inset:-2px;background:linear-gradient(135deg,#4F8EF7,#38BDF8,#8B5CF6);border-radius:18px;opacity:0.25;filter:blur(16px);z-index:0;}
.demo-inner{position:relative;z-index:1;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 24px 60px rgba(0,0,0,0.1);}

/* Browser chrome */
.d-bar{background:#F1F5F9;padding:9px 14px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #E2E8F0;}
.d-dot{width:10px;height:10px;border-radius:50%;}
.d-topnav{background:#1E2A4A;padding:9px 16px;display:flex;align-items:center;justify-content:space-between;}
.d-logo-row{display:flex;align-items:center;gap:7px;}
.d-logo-sq{width:24px;height:24px;background:linear-gradient(135deg,#4F8EF7,#38BDF8);border-radius:5px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;}
.d-logo-txt{font-size:13px;font-weight:800;color:#fff;}
.d-logo-txt span{color:#38BDF8;}
.d-nav-tag{font-size:10px;color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.08);padding:4px 10px;border-radius:5px;transition:all 0.4s;}
.d-prog{height:2px;background:#E2E8F0;}
.d-prog-fill{height:100%;background:linear-gradient(90deg,#4F8EF7,#38BDF8);width:0%;}

/* Demo split */
.d-split{display:flex;height:340px;}
.d-left{width:46%;border-right:1px solid #E2E8F0;padding:16px;display:flex;flex-direction:column;gap:9px;background:#fff;}
.d-right{width:54%;padding:16px;display:flex;flex-direction:column;gap:9px;background:#FAFBFF;}

.d-tag{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:700;color:#4F8EF7;background:#EEF3FF;padding:3px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.06em;align-self:flex-start;}
.d-stem{font-size:11.5px;color:#1E2A4A;line-height:1.65;font-weight:500;}
.d-stem mark{background:linear-gradient(120deg,#FEF9C3,#FDE68A);border-radius:2px;padding:1px 3px;}
.d-opts{display:flex;flex-direction:column;gap:5px;}
.d-opt{padding:8px 10px;border-radius:7px;font-size:11px;border:1.5px solid #E2E8F0;background:#fff;color:#334155;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;user-select:none;}
.d-circ{width:14px;height:14px;border-radius:50%;border:1.5px solid #CBD5E1;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:8px;transition:all 0.2s;}
.d-opt:hover{border-color:#4F8EF7;background:#F0F7FF;transform:translateX(3px);}
.d-opt.selecting{border-color:#4F8EF7;background:#EEF3FF;transform:translateX(4px);box-shadow:0 2px 10px rgba(79,142,247,0.2);}
.d-opt.correct{border-color:#10B981;background:#ECFDF5;color:#065F46;font-weight:600;animation:pop 0.3s ease;}
.d-opt.correct .d-circ{border-color:#10B981;background:#10B981;color:#fff;}
@keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.02)}100%{transform:scale(1)}}
.d-opt.wrong{border-color:#EF4444;background:#FEF2F2;color:#991B1B;animation:shake 0.3s ease;}
.d-opt.wrong .d-circ{border-color:#EF4444;background:#EF4444;color:#fff;}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
.ripple{position:absolute;border-radius:50%;background:rgba(79,142,247,0.2);transform:scale(0);animation:rip 0.4s ease-out forwards;pointer-events:none;}
@keyframes rip{to{transform:scale(4);opacity:0;}}

.d-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:#CBD5E1;text-align:center;}
.d-empty-icon{font-size:32px;animation:bob 2s ease-in-out infinite;}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.d-exp{display:none;flex-direction:column;gap:8px;height:100%;}
.d-exp.show{display:flex;animation:slideIn 0.3s ease;}
@keyframes slideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
.d-result{padding:10px 12px;border-radius:8px;}
.d-result.wrong{background:#FEF2F2;border:1.5px solid #FECACA;}
.d-result.correct{background:#ECFDF5;border:1.5px solid #BBF7D0;}
.d-result-title{font-size:13px;font-weight:800;}
.d-result.wrong .d-result-title{color:#991B1B;}
.d-result.correct .d-result-title{color:#065F46;}
.d-result-sub{font-size:10px;color:#475569;margin-top:2px;}
.d-exp-body{background:#fff;border-radius:8px;border:1px solid #E2E8F0;padding:12px;flex:1;}
.d-exp-lbl{font-size:9px;font-weight:700;color:#4F8EF7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;}
.d-exp-txt{font-size:11px;color:#334155;line-height:1.7;}
.d-exp-txt strong{color:#1E2A4A;font-weight:700;}
.d-trap{margin-top:7px;padding:7px 9px;background:#FFFBEB;border-radius:6px;border-left:3px solid #F59E0B;font-size:10px;color:#92400E;line-height:1.55;animation:trapSlide 0.3s ease 0.15s both;}
@keyframes trapSlide{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}

/* FC scene */
.fc-split{display:flex;height:340px;}
.fc-l{width:48%;border-right:1px solid #E2E8F0;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#fff;}
.fc-r{width:52%;padding:16px;display:flex;flex-direction:column;justify-content:center;gap:9px;background:#FAFBFF;}
.fc-persp{perspective:700px;width:220px;height:140px;}
.fc-card{width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform 0.6s cubic-bezier(0.4,0,0.2,1);}
.fc-card.flipped{transform:rotateY(180deg);}
.fc-face{position:absolute;inset:0;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;backface-visibility:hidden;text-align:center;}
.fc-front-f{background:linear-gradient(135deg,#1E2A4A,#2D4070);box-shadow:0 6px 18px rgba(30,42,74,0.3);}
.fc-back-f{background:#fff;border:1.5px solid #E2E8F0;transform:rotateY(180deg);}
.fc-tag2{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;}
.fc-front-f .fc-tag2{color:#38BDF8;}
.fc-back-f .fc-tag2{color:#10B981;}
.fc-front-f .fc-q2{font-size:12.5px;color:#fff;font-weight:600;line-height:1.4;}
.fc-back-f .fc-a2{font-size:11.5px;color:#1E2A4A;line-height:1.5;font-weight:500;}
.fc-hint2{font-size:10px;color:#94A3B8;transition:opacity 0.3s;}
.fc-btns2{display:flex;gap:6px;opacity:0;transform:translateY(5px);transition:all 0.3s ease;}
.fc-btns2.show{opacity:1;transform:translateY(0);}
.fc-btn2{padding:6px 13px;border-radius:6px;font-size:10.5px;font-weight:700;border:none;cursor:default;transition:all 0.2s;}
.fc-btn2.again{background:#FEF2F2;color:#991B1B;}
.fc-btn2.good{background:#ECFDF5;color:#065F46;}
.fc-btn2.good.picked{transform:scale(1.1);box-shadow:0 3px 10px rgba(16,185,129,0.3);}
.fc-btn2.easy{background:#EEF3FF;color:#1D4ED8;}
.fc-stat2{background:#fff;border-radius:8px;border:1px solid #E2E8F0;padding:10px 12px;}
.fc-stat2-lbl{font-size:8.5px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;}
.fc-stat2-val{font-size:20px;font-weight:800;color:#1E2A4A;}
.fc-stat2-sub{font-size:9px;color:#475569;margin-top:2px;}
.fc-prog2{background:#fff;border-radius:8px;border:1px solid #E2E8F0;padding:10px 12px;}
.fc-prog2-title{font-size:10px;font-weight:700;color:#1E2A4A;margin-bottom:8px;}
.prow{display:flex;align-items:center;gap:6px;margin-bottom:5px;}
.pname{font-size:9.5px;color:#475569;width:68px;flex-shrink:0;}
.pbar{flex:1;background:#F1F5F9;border-radius:999px;height:5px;overflow:hidden;}
.pfill{height:100%;border-radius:999px;width:0%;transition:width 0.8s cubic-bezier(0.4,0,0.2,1);}
.ppct{font-size:9.5px;color:#475569;width:26px;text-align:right;}

/* Demo bottom */
.d-bot{background:#F8FAFF;border-top:1px solid #E2E8F0;padding:9px 16px;display:flex;justify-content:center;gap:8px;}
.d-bb{padding:6px 14px;border-radius:7px;font-size:11px;font-weight:600;border:1px solid #E2E8F0;background:#fff;color:#1E2A4A;}
.d-bb.primary{background:#1E2A4A;color:#fff;border-color:#1E2A4A;}
.d-bb.red{color:#EF4444;border-color:#FECACA;}

/* Dots */
.demo-dots{display:flex;gap:6px;justify-content:center;margin-top:14px;}
.dd{width:8px;height:8px;border-radius:50%;background:#CBD5E1;cursor:pointer;transition:all 0.3s;}
.dd.active{background:#4F8EF7;width:22px;border-radius:4px;}
.demo-lbl{text-align:center;font-size:12px;color:#94A3B8;margin-top:7px;font-weight:500;}

/* ─── FEATURES ─── */
.features{padding:80px 48px;background:#F8FAFF;}
.section-eyebrow{text-align:center;font-size:12px;font-weight:700;color:#4F8EF7;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;}
.section-title{text-align:center;font-size:36px;font-weight:800;color:#1E2A4A;margin-bottom:10px;letter-spacing:-0.5px;}
.section-sub{text-align:center;font-size:16px;color:#475569;margin-bottom:52px;}
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:900px;margin:0 auto;}
.feat-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:26px;transition:all 0.2s;}
.feat-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.07);border-color:#C7D9FF;}
.feat-icon{width:42px;height:42px;background:#EEF3FF;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:14px;}
.feat-title{font-size:15px;font-weight:700;color:#1E2A4A;margin-bottom:7px;}
.feat-desc{font-size:13px;color:#475569;line-height:1.65;}

/* ─── PRICING ─── */
.pricing{padding:80px 48px;background:#fff;}
.price-card{max-width:440px;margin:0 auto;background:#fff;border:1.5px solid #E2E8F0;border-radius:18px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,0.06);}
.price-badge{display:inline-block;background:#EEF3FF;color:#4F8EF7;font-size:12px;font-weight:700;padding:4px 14px;border-radius:999px;margin-bottom:18px;border:1px solid #C7D9FF;}
.price-name{font-size:13px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;}
.price-val{font-size:52px;font-weight:900;color:#1E2A4A;letter-spacing:-1px;margin-bottom:4px;}
.price-note{font-size:14px;color:#475569;margin-bottom:24px;}
.price-divider{border:none;border-top:1px solid #E2E8F0;margin-bottom:22px;}
.price-item{display:flex;align-items:flex-start;gap:10px;margin-bottom:13px;font-size:14px;color:#1E2A4A;line-height:1.5;}
.price-check{color:#10B981;font-size:16px;flex-shrink:0;margin-top:1px;}
.price-btn{display:block;width:100%;padding:15px;background:linear-gradient(135deg,#1E2A4A,#2D4070);color:#fff;border:none;border-radius:11px;font-size:15px;font-weight:700;cursor:pointer;margin-top:26px;text-align:center;transition:all 0.2s;box-shadow:0 4px 16px rgba(30,42,74,0.25);}
.price-btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(30,42,74,0.3);}

/* ─── FOOTER ─── */
.footer{background:#1E2A4A;padding:28px 48px;display:flex;align-items:center;justify-content:space-between;}
.footer-logo{display:flex;align-items:center;gap:8px;}
.footer-txt{font-size:13px;font-weight:800;color:#fff;}
.footer-txt span{color:#38BDF8;}
.footer-copy{font-size:12px;color:rgba(255,255,255,0.4);}
.footer-links{display:flex;gap:18px;}
.footer-link{font-size:13px;color:rgba(255,255,255,0.55);text-decoration:none;transition:color 0.2s;}
.footer-link:hover{color:#fff;}

/* ─── SCENE SWITCHING ─── */
.d-scene{display:none;}
.d-scene.active{display:flex;}

/* ─── RESPONSIVE (phones, <=768px) ─── */
@media (max-width: 768px){
  /* nav: drop section links, shrink so it fits one row */
  .nav{padding:0 16px;height:58px;}
  .nav-links{display:none;}
  .nav-right{gap:8px;}
  .nav-link{padding:8px 10px;}
  .btn-primary{padding:8px 14px;font-size:13px;}

  /* hero: smaller type + padding so headings don't overflow */
  .hero{padding:44px 20px 36px;}
  .hero-badge{margin-bottom:20px;font-size:12px;}
  .hero h1{font-size:32px;letter-spacing:-0.5px;margin-bottom:16px;}
  .hero-desc{font-size:15px;margin-bottom:28px;}
  .hero-btn{padding:13px 26px;font-size:14px;}

  /* demo widget: stack the two split panes vertically */
  .demo-wrap{margin-top:40px;}
  .d-split,.fc-split{flex-direction:column;height:auto;}
  .d-left,.d-right,.fc-l,.fc-r{width:100%;}
  .d-left,.fc-l{border-right:none;border-bottom:1px solid #E2E8F0;}
  .d-right{min-height:170px;}
  .d-empty{height:auto;padding:28px 0;}
  .d-exp{height:auto;}
  .d-exp-body{flex:none;}
  .d-bot{flex-wrap:wrap;}

  /* features: single-column cards, smaller section headings */
  .features{padding:56px 20px;}
  .section-title{font-size:26px;}
  .section-sub{font-size:15px;margin-bottom:32px;}
  .feat-grid{grid-template-columns:1fr;gap:14px;max-width:420px;}
  .feat-card{padding:22px;}

  /* pricing */
  .pricing{padding:56px 20px;}
  .price-card{padding:28px 22px;}
  .price-val{font-size:44px;}

  /* footer: stack + center */
  .footer{flex-direction:column;gap:10px;text-align:center;padding:24px 20px;}
}
`;

export default function Landing() {
  const rootRef = useRef(null);
  const goToRef = useRef(() => {});
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (sel) => root.querySelector(sel);

    let progRAF;
    const timeouts = [];
    const st = (fn, ms) => {
      const t = setTimeout(fn, ms);
      timeouts.push(t);
      return t;
    };

    const lbls = [
      "Question Bank — high-yield MCQs with instant explanations",
      "Flashcards — flip and rate with spaced repetition",
    ];
    const tags = ["Pharmacology · Question Bank", "Pharmacology · Flashcards"];

    function setDots(i) {
      root.querySelectorAll(".dd").forEach((d, j) => d.classList.toggle("active", j === i));
      $("#demoLbl").textContent = lbls[i];
      $("#dNavTag").textContent = tags[i];
    }

    function startProg(ms, cb) {
      cancelAnimationFrame(progRAF);
      const f = $("#dProgFill");
      f.style.transition = "none";
      f.style.width = "0%";
      const s = performance.now();
      function step(n) {
        const p = Math.min(((n - s) / ms) * 100, 100);
        f.style.width = p + "%";
        if (p < 100) progRAF = requestAnimationFrame(step);
        else {
          f.style.width = "0%";
          cb();
        }
      }
      progRAF = requestAnimationFrame(step);
    }

    function showScene(id) {
      root.querySelectorAll(".d-scene").forEach((s) => s.classList.remove("active"));
      $("#" + id).classList.add("active");
    }

    function addRipple(el) {
      const r = document.createElement("div");
      r.className = "ripple";
      const s = Math.max(el.offsetWidth, el.offsetHeight);
      r.style.cssText = `width:${s}px;height:${s}px;left:${el.offsetWidth / 2 - s / 2}px;top:${el.offsetHeight / 2 - s / 2}px;`;
      el.appendChild(r);
      st(() => r.remove(), 450);
    }

    function runQ() {
      setDots(0);
      showScene("dSceneQ");
      [0, 1, 2, 3].forEach((i) => {
        $("#o" + i).className = "d-opt";
        $("#c" + i).textContent = "";
      });
      $("#dEmpty").style.display = "flex";
      $("#dExp").classList.remove("show");

      st(() => ($("#o0").className = "d-opt selecting"), 500);
      st(() => {
        $("#o0").className = "d-opt";
        $("#o1").className = "d-opt selecting";
      }, 1100);
      st(() => {
        const o1 = $("#o1");
        addRipple(o1);
        o1.className = "d-opt correct";
        $("#c1").textContent = "✓";
        $("#o0").className = "d-opt wrong";
        $("#c0").textContent = "✗";
        $("#dResult").className = "d-result wrong";
        $("#dResultTitle").innerHTML = "❌ Incorrect!";
        $("#dResultSub").textContent = "Correct answer: B — Blockade of β1-adrenergic receptors";
        $("#dEmpty").style.display = "none";
        $("#dExp").classList.add("show");
      }, 1700);
      startProg(5000, () => runFC());
    }

    function runFC() {
      setDots(1);
      showScene("dSceneFC");
      $("#fcCard").classList.remove("flipped");
      $("#fcHint").style.opacity = "1";
      $("#fcBtns").className = "fc-btns2";
      $("#fcGood").classList.remove("picked");
      ["fp1", "fp2", "fp3"].forEach((id) => ($("#" + id).style.width = "0%"));
      st(() => {
        $("#fp1").style.width = "45%";
        $("#fp2").style.width = "68%";
        $("#fp3").style.width = "82%";
      }, 300);
      st(() => {
        $("#fcCard").classList.add("flipped");
        $("#fcHint").style.opacity = "0";
      }, 1600);
      st(() => ($("#fcBtns").className = "fc-btns2 show"), 2400);
      st(() => $("#fcGood").classList.add("picked"), 3000);
      startProg(4000, () => runQ());
    }

    function goTo(i) {
      cancelAnimationFrame(progRAF);
      if (i === 0) runQ();
      else runFC();
    }
    goToRef.current = goTo;

    // Wire up option clicks
    const optHandlers = [];
    [0, 1, 2, 3].forEach((i) => {
      const el = $("#o" + i);
      const handler = function () {
        if (this.className.includes("correct") || this.className.includes("wrong")) return;
        cancelAnimationFrame(progRAF);
        addRipple(this);
        [0, 1, 2, 3].forEach((j) => {
          $("#o" + j).className = "d-opt";
          $("#c" + j).textContent = "";
        });
        const correct = 1;
        if (i === correct) {
          this.className = "d-opt correct";
          $("#c" + i).textContent = "✓";
          $("#dResult").className = "d-result correct";
          $("#dResultTitle").innerHTML = "✅ Correct!";
          $("#dResultSub").textContent = "Great job! Beta blockade is the answer.";
        } else {
          this.className = "d-opt wrong";
          $("#c" + i).textContent = "✗";
          $("#o" + correct).className = "d-opt correct";
          $("#c" + correct).textContent = "✓";
          $("#dResult").className = "d-result wrong";
          $("#dResultTitle").innerHTML = "❌ Incorrect!";
          $("#dResultSub").textContent = "Correct answer: B — Blockade of β1-adrenergic receptors";
        }
        $("#dEmpty").style.display = "none";
        $("#dExp").classList.add("show");
        startProg(4000, () => runFC());
      };
      el.addEventListener("click", handler);
      optHandlers.push([el, handler]);
    });

    runQ();

    return () => {
      cancelAnimationFrame(progRAF);
      timeouts.forEach(clearTimeout);
      optHandlers.forEach(([el, h]) => el.removeEventListener("click", h));
    };
  }, []);

  // Highlight the nav link for whichever section is in view.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sections = ["features", "pricing"]
      .map((id) => root.querySelector("#" + id))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setActiveSection((prev) =>
            entry.isIntersecting ? entry.target.id : prev === entry.target.id ? null : prev
          );
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const activeLink = { color: "#4F8EF7", fontWeight: 700 };

  return (
    <div ref={rootRef}>
      <style>{css}</style>

      {/* NAVBAR */}
      <nav className="nav">
        <Link className="nav-logo" to="/" style={linkReset}>
          <div className="logo-sq">J</div>
          <div className="logo-txt">JU<span>step</span></div>
        </Link>
        <div className="nav-right">
          <div className="nav-links">
            <a className="nav-link" href="#features" style={activeSection === "features" ? activeLink : undefined}>Features</a>
            <a className="nav-link" href="#pricing" style={activeSection === "pricing" ? activeLink : undefined}>Buy Now</a>
          </div>
          <div className="nav-actions">
            <Link className="nav-link" to="/login" style={linkReset}>Log In</Link>
            <Link className="btn-primary" to="/signup" style={{ ...linkReset, display: "inline-flex", alignItems: "center" }}>
              Get Started →
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-badge">
          <div className="hero-badge-dot"></div>
          Built for Jordanian medical students
        </div>
        <h1>Ace your medical exams<br />with <span>JUstep</span></h1>
        <p className="hero-desc">A modern question bank, smart flashcards, and performance analytics — everything you need to master USMLE Step 1 and your university curriculum in one place.</p>
        <Link className="hero-btn" to="/signup" style={linkReset}>
          Start learning free <span className="hero-btn-arrow">→</span>
        </Link>

        {/* DEMO ANIMATION */}
        <div className="demo-wrap">
          <div className="demo-glow"></div>
          <div className="demo-inner">
            <div className="d-bar">
              <div className="d-dot" style={{ background: "#EF4444" }}></div>
              <div className="d-dot" style={{ background: "#F59E0B" }}></div>
              <div className="d-dot" style={{ background: "#10B981" }}></div>
            </div>
            <div className="d-topnav">
              <div className="d-logo-row">
                <div className="d-logo-sq">J</div>
                <div className="d-logo-txt">JU<span>step</span></div>
              </div>
              <div className="d-nav-tag" id="dNavTag">Pharmacology · Question Bank</div>
            </div>
            <div className="d-prog"><div className="d-prog-fill" id="dProgFill"></div></div>

            {/* Q Scene */}
            <div className="d-scene active" id="dSceneQ">
              <div className="d-split">
                <div className="d-left">
                  <div className="d-tag">📋 Pharmacology · Beta Blockers</div>
                  <div className="d-stem">A 58-year-old man with <mark>stable angina</mark> reports <mark>cold extremities</mark> after starting a new medication. Which mechanism is most likely?</div>
                  <div className="d-opts">
                    <div className="d-opt" id="o0"><span>A. Activation of α2-adrenergic receptors</span><div className="d-circ" id="c0"></div></div>
                    <div className="d-opt" id="o1"><span>B. Blockade of β1-adrenergic receptors</span><div className="d-circ" id="c1"></div></div>
                    <div className="d-opt" id="o2"><span>C. Inhibition of ACE</span><div className="d-circ" id="c2"></div></div>
                    <div className="d-opt" id="o3"><span>D. Blockade of calcium channels</span><div className="d-circ" id="c3"></div></div>
                  </div>
                </div>
                <div className="d-right">
                  <div className="d-empty" id="dEmpty">
                    <div className="d-empty-icon">💡</div>
                    <span style={{ fontSize: "11px" }}>Select an answer to see<br />the full explanation</span>
                  </div>
                  <div className="d-exp" id="dExp">
                    <div className="d-result" id="dResult">
                      <div className="d-result-title" id="dResultTitle"></div>
                      <div className="d-result-sub" id="dResultSub"></div>
                    </div>
                    <div className="d-exp-body">
                      <div className="d-exp-lbl">📖 Explanation</div>
                      <div className="d-exp-txt"><strong>Beta blockers</strong> competitively block β-adrenergic receptors. β1 blockade → ↓ HR &amp; contractility. <strong>Cold extremities</strong> = β2 blockade → peripheral vasoconstriction.
                        <div className="d-trap">⚠️ <strong>Board trap:</strong> Non-selective agents (propranolol) worsen asthma. Use cardioselective (metoprolol) in COPD/asthma.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* FC Scene */}
            <div className="d-scene" id="dSceneFC">
              <div className="fc-split">
                <div className="fc-l">
                  <div className="fc-persp">
                    <div className="fc-card" id="fcCard">
                      <div className="fc-face fc-front-f">
                        <div className="fc-tag2">⚡ Pharmacology</div>
                        <div className="fc-q2">Mechanism of action of warfarin?</div>
                      </div>
                      <div className="fc-face fc-back-f">
                        <div className="fc-tag2">✓ Answer</div>
                        <div className="fc-a2">Inhibits vitamin K epoxide reductase → ↓ clotting factors II, VII, IX, X.</div>
                      </div>
                    </div>
                  </div>
                  <div className="fc-hint2" id="fcHint">🔄 Flipping...</div>
                  <div className="fc-btns2" id="fcBtns">
                    <button className="fc-btn2 again">Again</button>
                    <button className="fc-btn2 good" id="fcGood">Good ✓</button>
                    <button className="fc-btn2 easy">Easy</button>
                  </div>
                </div>
                <div className="fc-r">
                  <div className="fc-stat2">
                    <div className="fc-stat2-lbl">Cards due today</div>
                    <div className="fc-stat2-val">24</div>
                    <div className="fc-stat2-sub">Spaced repetition · resets daily</div>
                  </div>
                  <div className="fc-prog2">
                    <div className="fc-prog2-title">Flashcard Progress</div>
                    <div className="prow"><div className="pname">Pharmacology</div><div className="pbar"><div className="pfill" style={{ background: "#14B8A6" }} id="fp1"></div></div><div className="ppct">45%</div></div>
                    <div className="prow"><div className="pname">Pathology</div><div className="pbar"><div className="pfill" style={{ background: "#3B82F6" }} id="fp2"></div></div><div className="ppct">68%</div></div>
                    <div className="prow"><div className="pname">Anatomy</div><div className="pbar"><div className="pfill" style={{ background: "#8B5CF6" }} id="fp3"></div></div><div className="ppct">82%</div></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="d-bot">
              <div className="d-bb red">End Session</div>
              <div className="d-bb">← Previous</div>
              <div className="d-bb primary">Next →</div>
            </div>
          </div>
          <div className="demo-dots">
            <div className="dd active" onClick={() => goToRef.current(0)}></div>
            <div className="dd" onClick={() => goToRef.current(1)}></div>
          </div>
          <div className="demo-lbl" id="demoLbl">Question Bank — high-yield MCQs with instant explanations</div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="section-eyebrow">Everything you need</div>
        <div className="section-title">Study smarter, not harder</div>
        <div className="section-sub">Built around how medical students actually learn</div>
        <div className="feat-grid">
          <div className="feat-card">
            <div className="feat-icon">🧠</div>
            <div className="feat-title">High-yield question bank</div>
            <div className="feat-desc">Curated MCQs aligned with your university curriculum and USMLE Step 1 standards.</div>
          </div>
          <div className="feat-card">
            <div className="feat-icon">🃏</div>
            <div className="feat-title">Smart flashcards</div>
            <div className="feat-desc">Spaced repetition system that surfaces the cards you need most, exactly when you need them.</div>
          </div>
          <div className="feat-card">
            <div className="feat-icon">📊</div>
            <div className="feat-title">Performance analytics</div>
            <div className="feat-desc">Track accuracy by subject, identify weak areas, and watch your progress in real time.</div>
          </div>
          <div className="feat-card">
            <div className="feat-icon">📄</div>
            <div className="feat-title">Past papers</div>
            <div className="feat-desc">Practise with real exam-style questions drawn from previous university assessments.</div>
          </div>
          <div className="feat-card">
            <div className="feat-icon">🤖</div>
            <div className="feat-title">AI-generated content</div>
            <div className="feat-desc">New questions and flashcards generated directly from lecture material — always up to date.</div>
          </div>
          <div className="feat-card">
            <div className="feat-icon">🏆</div>
            <div className="feat-title">Leaderboard</div>
            <div className="feat-desc">Compete with classmates across Jordan and stay motivated with daily streaks and rankings.</div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="section-eyebrow">Pricing</div>
        <div className="section-title">Simple, honest pricing</div>
        <div className="section-sub">Free forever while we're in beta</div>
        <div className="price-card">
          <div className="price-badge">Current plan</div>
          <div className="price-name">JUstep</div>
          <div className="price-val">Free</div>
          <div className="price-note">No credit card required</div>
          <hr className="price-divider" />
          <div className="price-item"><span className="price-check">✓</span>Full access to the question bank</div>
          <div className="price-item"><span className="price-check">✓</span>High-yield content aligned with Step 1</div>
          <div className="price-item"><span className="price-check">✓</span>Smart flashcards with spaced repetition</div>
          <div className="price-item"><span className="price-check">✓</span>Past paper practice questions</div>
          <div className="price-item"><span className="price-check">✓</span>Performance analytics dashboard</div>
          <div className="price-item"><span className="price-check">✓</span>Leaderboard and streak tracking</div>
          <div className="price-item"><span className="price-check">✓</span>AI-generated questions from lectures</div>
          <Link className="price-btn" to="/signup" style={linkReset}>Sign up free →</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-logo">
          <div className="logo-sq" style={{ width: "28px", height: "28px", fontSize: "13px" }}>J</div>
          <div className="footer-txt">JU<span>step</span></div>
        </div>
        <div className="footer-links">
          <Link className="footer-link" to="/privacy">Privacy</Link>
          <Link className="footer-link" to="/terms">Terms</Link>
        </div>
        <div className="footer-copy">© 2026 JUstep. Built for Jordanian medical students.</div>
      </footer>
    </div>
  );
}
