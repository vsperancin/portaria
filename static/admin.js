/* Portaria VinIA — admin dashboard */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let ALL = [];
  let filtered = [];
  let page = 1;
  let perPage = 25;
  let sortKey = "id";
  let sortDir = "desc";

  function maskCpf(d) {
    if (!d) return "";
    d = d.replace(/\D+/g, "");
    if (d.length !== 11) return d;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  function maskPhone(d) {
    if (!d) return "";
    d = d.replace(/\D+/g, "");
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return d;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  // ----- load -----
  // Capture the token from URL so the fetch can authenticate.
  const TOKEN = new URL(location.href).searchParams.get("token") || "";

  async function load() {
    const r = await fetch(`/api/admin/cadastros?token=${encodeURIComponent(TOKEN)}`,
                         { credentials: "same-origin" });
    if (!r.ok) {
      $("rows").innerHTML = `<tr><td colspan="5" class="empty">erro ${r.status}</td></tr>`;
      return;
    }
    const data = await r.json();
    ALL = Array.isArray(data) ? data : (data.items || []);
    renderStats();
    applyFilter();
  }

  // ----- stats -----
  function renderStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const today = ALL.filter(r => new Date(r.created_at) >= startOfToday).length;
    const week  = ALL.filter(r => new Date(r.created_at) >= startOfWeek).length;
    const unique = new Set(ALL.map(r => r.cpf)).size;

    $("statTotal").textContent = ALL.length;
    $("statToday").textContent = today;
    $("statWeek").textContent = week;
    $("statUnique").textContent = unique;
  }

  // ----- filter / sort / paginate -----
  function applyFilter() {
    const q = ($("search").value || "").toLowerCase().trim();
    filtered = ALL.filter(r => {
      if (!q) return true;
      return (r.nome || "").toLowerCase().includes(q)
          || (r.telefone || "").toLowerCase().includes(q)
          || (r.cpf || "").toLowerCase().includes(q);
    });

    filtered.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === "created_at") {
        av = new Date(av).getTime(); bv = new Date(bv).getTime();
      } else if (typeof av === "string") {
        av = av.toLowerCase(); bv = (bv || "").toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    page = 1;
    render();
  }

  function render() {
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    if (page > pages) page = pages;
    const start = (page - 1) * perPage;
    const slice = filtered.slice(start, start + perPage);

    if (total === 0) {
      $("rows").innerHTML = `<tr><td colspan="5" class="empty">nenhum cadastro encontrado.</td></tr>`;
    } else {
      $("rows").innerHTML = slice.map(r => `
        <tr>
          <td class="id">#${String(r.id).padStart(4, "0")}</td>
          <td>${esc(r.nome)}</td>
          <td>${esc(maskPhone(r.telefone))}</td>
          <td class="cpf">${esc(maskCpf(r.cpf))}</td>
          <td>${esc(fmtDate(r.created_at))}</td>
        </tr>
      `).join("");
    }

    $("showing").textContent = total === 0
      ? "0 resultados"
      : `mostrando ${start + 1}–${Math.min(start + perPage, total)} de ${total}`;
    $("pageInfo").textContent = `página ${page} / ${pages}`;
    $("prev").disabled = page <= 1;
    $("next").disabled = page >= pages;
  }

  // ----- sort headers -----
  document.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = key === "created_at" || key === "id" ? "desc" : "asc";
      }
      document.querySelectorAll("th.sortable").forEach(x => x.classList.remove("asc", "desc"));
      th.classList.add(sortDir);
      render();
    });
  });

  // ----- events -----
  $("search").addEventListener("input", applyFilter);
  $("perPage").addEventListener("change", () => {
    perPage = parseInt($("perPage").value, 10);
    render();
  });
  $("prev").addEventListener("click", () => { if (page > 1) { page--; render(); } });
  $("next").addEventListener("click", () => { page++; render(); });

  // ----- CSV export -----
  $("exportCsv").addEventListener("click", () => {
    const headers = ["id", "nome", "telefone", "cpf", "created_at"];
    const escCsv = (s) => {
      s = String(s ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const rows = filtered.map(r => headers.map(h => escCsv(r[h])).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `portaria-cadastros-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  load().catch(e => {
    $("rows").innerHTML = `<tr><td colspan="5" class="empty">erro: ${esc(e.message)}</td></tr>`;
  });
})();