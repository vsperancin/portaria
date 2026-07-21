/* Portaria VinIA — comportamento: máscaras, validação cliente, animação de catraca + confete */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // -------- Máscaras --------
  const onlyDigits = (s) => (s || "").replace(/\D+/g, "");

  function maskCPF(v) {
    v = onlyDigits(v).slice(0, 11);
    if (v.length <= 3)  return v;
    if (v.length <= 6)  return v.slice(0,3) + "." + v.slice(3);
    if (v.length <= 9)  return v.slice(0,3) + "." + v.slice(3,6) + "." + v.slice(6);
    return v.slice(0,3) + "." + v.slice(3,6) + "." + v.slice(6,9) + "-" + v.slice(9);
  }
  function maskPhone(v) {
    v = onlyDigits(v).slice(0, 11);
    if (v.length === 0) return "";
    if (v.length <= 2)  return "(" + v;
    if (v.length <= 6)  return "(" + v.slice(0,2) + ") " + v.slice(2);
    if (v.length <= 10) return "(" + v.slice(0,2) + ") " + v.slice(2,6) + "-" + v.slice(6);
    return "(" + v.slice(0,2) + ") " + v.slice(2,7) + "-" + v.slice(7);
  }

  const cpfEl = $("cpf");
  const telEl = $("telefone");
  if (cpfEl) cpfEl.addEventListener("input", (e) => { e.target.value = maskCPF(e.target.value); });
  if (telEl) telEl.addEventListener("input", (e) => { e.target.value = maskPhone(e.target.value); });

  // -------- Validação CPF --------
  function cpfIsValid(d) {
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
    let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
    if (d1 !== parseInt(d[9])) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
    let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
    return d2 === parseInt(d[10]);
  }

  function phoneIsValid(d) {
    if (d.length !== 10 && d.length !== 11) return false;
    const ddd = parseInt(d.slice(0,2));
    if (ddd < 11 || ddd > 99) return false;
    if (d.length === 11 && d[2] !== "9") return false;
    if (d.length === 10 && d[2] === "9") return false;
    return true;
  }

  // -------- Submissão --------
  const form    = $("form");
  const submit  = $("submit");
  const errorEl = $("error");
  const badge   = $("badge");
  const turnstile = $("turnstile");
  const tScreen = $("tScreen");
  const led     = $("led");
  const bLine1  = $("bLine1");
  const bLine2  = $("bLine2");
  const bLine3  = $("bLine3");

  function showError(field, msg) {
    errorEl.hidden = false;
    errorEl.textContent = msg;
    if (field) field.classList.add("invalid");
    setTimeout(() => field && field.classList.remove("invalid"), 450);
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  function lockBadgeText(nome) {
    bLine1.textContent = "Bem-vindo(a)";
    bLine2.textContent = nome.split(" ")[0].toUpperCase();
    bLine3.textContent = "verificando...";
  }
  function unlockBadgeText() {
    bLine3.textContent = "LIBERADO · passe!";
    led.classList.add("on");
    tScreen.textContent = "LIBERADO";
  }
  function rejectBadgeText() {
    bLine3.textContent = "ACESSO NEGADO";
    tScreen.textContent = "BLOQUEADO";
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();

      const nome    = ($("nome").value || "").trim();
      const telDig  = onlyDigits(telEl.value);
      const cpfDig  = onlyDigits(cpfEl.value);

      if (nome.length < 3 || nome.split(" ").length < 2)
        return showError($("nome"), "informe nome completo (nome e sobrenome).");

      if (!phoneIsValid(telDig))
        return showError(telEl, "telefone inválido (use DDD + número).");

      if (!cpfIsValid(cpfDig))
        return showError(cpfEl, "CPF inválido. Confira os dígitos.");

      submit.classList.add("loading");
      submit.disabled = true;

      lockBadgeText(nome);
      badge.classList.add("slide");
      tScreen.textContent = "LENDO...";

      try {
        const r = await fetch("/api/cadastrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, telefone: telDig, cpf: cpfDig }),
        });
        const data = await r.json();

        if (data.ok) {
          unlockBadgeText();
          fireConfetti(1500);
          setTimeout(() => window.location.href = "/sucesso", 1400);
          return;
        }
        // falhou
        badge.classList.remove("slide");
        turnstile.classList.add("fail");
        rejectBadgeText();
        showError(null, data.error || "não foi possível cadastrar.");
        setTimeout(() => turnstile.classList.remove("fail"), 600);
        setTimeout(() => { bLine3.textContent = "aguardando..."; tScreen.textContent = "AGUARDANDO"; led.classList.remove("on"); }, 1800);
      } catch (err) {
        badge.classList.remove("slide");
        showError(null, "erro de rede: " + err.message);
      } finally {
        submit.classList.remove("loading");
        submit.disabled = false;
      }
    });
  }

  // -------- Confete --------
  window.fireConfetti = function fireConfetti(durationMs = 1500) {
    const c = document.getElementById("confetti");
    if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      c.width  = innerWidth  * dpr;
      c.height = innerHeight * dpr;
      c.style.width  = innerWidth  + "px";
      c.style.height = innerHeight + "px";
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = ["#1a73e8", "#34a853", "#fbbc04", "#ff5252", "#a142f4"];
    const N = 220;
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * 80,
      r: 4 + Math.random() * 6,
      vx: -2 + Math.random() * 4,
      vy: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() > 0.5 ? "rect" : "circ",
    }));

    const start = performance.now();
    function frame(t) {
      const elapsed = t - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.08;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (elapsed < durationMs) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    requestAnimationFrame(frame);
  };
})();