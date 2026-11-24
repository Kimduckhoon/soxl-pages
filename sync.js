/* 기록 자동 저장 (app.html 전용)
   계산기·모의투자 기록(이 휴대폰 localStorage)을 사장님 구글시트(Apps Script 웹 앱, apps_script/app_records.gs)에
   사용자 코드별로 저장한다.
   - 앱을 열 때·다시 볼 때 시트에서 불러오고, 기록이 바뀌면 2초 뒤 저장한다.
   - base = 이 휴대폰이 마지막으로 맞춘 시트 저장 시각. 다른 휴대폰이 더 새로 저장했으면 덮지 않고 묻는다.
   - ENDPOINT 가 비어 있으면 아무것도 하지 않는다(버튼도 숨김). */
window.SoxlSync = (function () {
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbyeFsWnFjiDWal_vQjiJPZj-dZr8IV6M4P52Tz9QFiHGZoZqW2GoL4FXOwO7uoSpJvXRw/exec";
  var KEYS = { calc: "soxl-calc-v1", paper: "soxl-paper-v1" }, SKEY = "soxl-sync-v1";
  var $ = function (id) { return document.getElementById(id); };
  var st = {}, timer = null, busy = false, onChanged = function () {};

  function load() { try { st = JSON.parse(localStorage.getItem(SKEY) || "{}") || {}; } catch (e) { st = {}; } }
  function keep() { try { localStorage.setItem(SKEY, JSON.stringify(st)); } catch (e) {} }
  function local() { var d = {}; Object.keys(KEYS).forEach(function (k) { var v = localStorage.getItem(KEYS[k]); if (v) d[k] = v; }); return d; }
  function hasLocal() { return Object.keys(local()).length > 0; }
  function apply(data) {
    Object.keys(KEYS).forEach(function (k) { if (data && data[k]) localStorage.setItem(KEYS[k], data[k]); else localStorage.removeItem(KEYS[k]); });
  }
  function badge(text, cls) { var b = $("cloud"); b.hidden = false; b.textContent = text; b.className = cls || ""; }
  function when(t) {
    if (!t) return "";
    var d = new Date(t);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function timeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]); }
  function get(code) { return timeout(fetch(ENDPOINT + "?code=" + encodeURIComponent(code)).then(function (r) { return r.json(); }), 10000); }
  function post(body) {
    return timeout(fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }), 20000);
  }
  function showOk() { badge("☁ 저장됨 " + when(st.base), "ok"); }
  function conflict() { st.conflict = true; keep(); badge("☁ 확인 필요", "warn"); }
  function errBadge(r) { badge(r && r.error === "code" ? "☁ 코드 확인" : "☁ 오류", "warn"); }

  // 시트에서 불러오기. 이 휴대폰에 아직 안 올린 변경(dirty)이 있으면 덮지 않는다. 화면을 바꿨으면 true.
  function pull() {
    if (!st.code) return Promise.resolve(false);
    return get(st.code).then(function (r) {
      if (!r.ok) { errBadge(r); return false; }
      st.name = r.name; keep();
      if (!r.savedAt) { if (hasLocal()) return push(false).then(function () { return false; }); showOk(); return false; }
      if (r.savedAt > (st.base || 0)) {
        if (st.dirty && hasLocal()) { conflict(); return false; }
        apply(r.data); st.base = r.savedAt; st.dirty = false; st.conflict = false; keep(); showOk(); return true;
      }
      if (st.dirty) return push(false).then(function () { return false; });
      showOk(); return false;
    }).catch(function () { badge("☁ 연결 안 됨", "warn"); return false; });
  }
  function push(force) {
    if (!st.code || busy) return Promise.resolve();
    busy = true; badge("☁ 저장 중…", "busy");
    return post({ code: st.code, base: st.base || 0, force: !!force, data: local() }).then(function (r) {
      if (r.ok) { st.base = r.savedAt; st.dirty = false; st.conflict = false; keep(); showOk(); }
      else if (r.error === "conflict") conflict();
      else errBadge(r);
    }).catch(function () { badge("☁ 저장 안 됨", "warn"); }).then(function () { busy = false; });
  }
  function later() { clearTimeout(timer); timer = setTimeout(function () { push(false); }, 2000); }

  // 설정 창
  function openDlg(msg) {
    $("cCode").value = st.code || "";
    $("cWho").innerHTML = st.code
      ? "<b>" + (st.name || "연결됨").replace(/</g, "&lt;") + "</b> 님 기록이 구글시트에 자동 저장되고 있어요." + (st.base ? " 마지막 저장 " + when(st.base) + "." : "")
      : "받은 <b>내 코드</b>를 넣으면 계산기·모의투자 기록이 구글시트에 자동 저장돼요. 휴대폰을 바꿔도 같은 코드를 넣으면 그대로 돌아와요.";
    $("cMsg").textContent = msg || (st.conflict ? "다른 휴대폰에서 더 새로 저장한 기록이 있어요. 어느 쪽을 남길지 골라 주세요." : "");
    $("cPull").hidden = $("cPush").hidden = $("cOff").hidden = !st.code;
    $("cLink").textContent = st.code ? "코드 바꾸기" : "연결하기";
    if (!$("cDlg").open) $("cDlg").showModal();
  }
  function wire() {
    $("cloud").onclick = function () { openDlg(); };
    $("cClose").onclick = function () { $("cDlg").close(); };
    $("cLink").onclick = function () {
      var code = $("cCode").value.trim();
      if (!code) { $("cMsg").textContent = "코드를 넣어 주세요."; return; }
      $("cMsg").textContent = "확인 중…";
      get(code).then(function (r) {
        if (!r.ok) { $("cMsg").textContent = "등록되지 않은 코드예요. 받은 코드를 다시 확인해 주세요."; return; }
        st = { code: code, name: r.name, base: 0, dirty: hasLocal() }; keep();
        if (r.savedAt && hasLocal()) {
          conflict();
          openDlg("시트에 " + r.name + " 님 기록(" + when(r.savedAt) + " 저장)이 있고, 이 휴대폰에도 기록이 있어요. 어느 쪽을 남길까요?");
          return;
        }
        if (r.savedAt) { apply(r.data); st.base = r.savedAt; st.dirty = false; keep(); showOk(); onChanged(); $("cDlg").close(); return; }
        push(false).then(function () { openDlg("연결했어요. 앞으로 기록이 자동 저장돼요."); });
      }).catch(function () { $("cMsg").textContent = "인터넷 연결을 확인해 주세요."; });
    };
    $("cPull").onclick = function () {
      if (!confirm("이 휴대폰 기록을 구글시트 기록으로 바꿀까요?")) return;
      get(st.code).then(function (r) {
        if (!r.ok) { $("cMsg").textContent = "불러오지 못했어요."; return; }
        apply(r.data); st.base = r.savedAt || 0; st.dirty = false; st.conflict = false; keep(); showOk(); onChanged(); $("cDlg").close();
      }).catch(function () { $("cMsg").textContent = "인터넷 연결을 확인해 주세요."; });
    };
    $("cPush").onclick = function () {
      if (!confirm("구글시트 기록을 이 휴대폰 기록으로 덮을까요? (이전 시트 기록은 '이력' 탭에 남아요)")) return;
      push(true).then(function () { $("cDlg").close(); });
    };
    $("cOff").onclick = function () {
      if (!confirm("이 휴대폰에서 자동 저장을 끌까요? 휴대폰 기록과 시트 기록은 그대로 남아요.")) return;
      st = {}; keep(); badge("기록 저장", ""); $("cDlg").close();
    };
    // 계산기·모의투자 화면(같은 사이트의 다른 창)이 기록을 저장하면 storage 이벤트가 온다 → 2초 뒤 시트에 저장
    window.addEventListener("storage", function (e) {
      if (!st.code) return;
      for (var k in KEYS) if (e.key === KEYS[k]) { st.dirty = true; keep(); if (!st.conflict) later(); return; }
    });
    // 앱으로 돌아올 때 다른 휴대폰 기록을 확인하고, 앱을 떠날 때 남은 변경을 저장
    document.addEventListener("visibilitychange", function () {
      if (!st.code || st.conflict) return;
      if (document.visibilityState === "visible" && !busy) pull().then(function (changed) { if (changed) onChanged(); });
      if (document.visibilityState === "hidden" && st.dirty) { clearTimeout(timer); push(false); }
    });
  }
  // 앱 시작: 화면을 열기 전에 시트 기록을 먼저 맞춘다(최대 6초)
  function start(cb) {
    onChanged = cb || onChanged;
    if (!ENDPOINT) return Promise.resolve();
    load(); wire();
    if (!st.code) { badge("기록 저장", ""); return Promise.resolve(); }
    if (st.conflict) { conflict(); return Promise.resolve(); }
    badge("☁ 불러오는 중…", "busy");
    var late = false, p = pull();
    p.then(function (changed) { if (changed && late) onChanged(); });   // 6초 넘게 걸려 화면이 먼저 열렸으면 다시 그린다
    return timeout(p, 6000).catch(function () { late = true; });
  }
  return { start: start };
})();
