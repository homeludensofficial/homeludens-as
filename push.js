/*
 * 새 건 푸시 알림 켜고 끄기 — 클레임 앱·AS 앱이 같이 쓴다 (원본: shared/push.js, 배포 때 각 앱에 복사).
 *
 * 켜면 이 기기의 푸시 구독을 Supabase push_subs 에 (기기 주소, 앱, 내 이메일)로 저장한다.
 * 실제 발송은 업무지원포털 Apps Script(ClaimSync.gs notifyClaimAs)가 1분마다 한다.
 * 공개 열쇠는 포털이 settings 'push' 에 넣어 둔 값(installClaimNotify).
 *
 *   HLPush.init({ sb, app:'claim'|'as', email, button, toast })
 */
window.HLPush = (function () {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  let ctx = null, reg = null, on = false, busy = false;

  const fromB64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

  function draw() {
    const b = ctx && ctx.button; if (!b) return;
    b.hidden = false;
    b.textContent = busy ? '알림 설정 중…' : on ? '알림 켜짐' : '알림 받기';
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? '누르면 이 기기에서 새 건 알림을 끕니다' : '새 건이 등록되면 이 기기로 알림을 받습니다';
  }

  async function refresh() {
    on = false;
    if (reg) {
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (sub) {
        const { data } = await ctx.sb.from('push_subs').select('endpoint').eq('endpoint', sub.endpoint).eq('app', ctx.app).maybeSingle();
        on = !!data;
      }
    }
    draw();
  }

  async function turnOn() {
    if (!supported || !reg) {
      if (isIOS && !standalone) {
        ctx.toast('아이폰은 홈 화면 앱에서만 알림을 켤 수 있어요. Safari 공유 버튼 → "홈 화면에 추가" 후, 그 앱에서 다시 눌러 주세요. (예전에 추가한 아이콘은 지우고 새로 추가)');
      } else ctx.toast('이 브라우저는 알림을 지원하지 않아요. 크롬이나 휴대폰 홈 화면 앱에서 켜 주세요.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { ctx.toast('알림이 허용되지 않았어요. 휴대폰 설정 → 알림에서 이 앱을 허용한 뒤 다시 눌러 주세요.'); return; }
    const { data: cfg } = await ctx.sb.from('settings').select('value').eq('key', 'push').maybeSingle();
    const key = cfg && cfg.value && cfg.value.vapidPublic;
    if (!key) { ctx.toast('알림 서버 설정이 아직 끝나지 않았어요. 관리자에게 알려 주세요.'); return; }
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const cur = sub.options && sub.options.applicationServerKey;
      const same = cur && btoa(String.fromCharCode(...new Uint8Array(cur))) === btoa(String.fromCharCode(...fromB64u(key)));
      if (!same) { await sub.unsubscribe().catch(() => {}); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
    const j = sub.toJSON();
    const { error } = await ctx.sb.from('push_subs').upsert({ endpoint: j.endpoint, app: ctx.app, email: ctx.email, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (error) throw error;
    on = true;
    ctx.toast('이 기기로 새 건 알림을 받습니다. (1분 안에 도착)');
  }

  async function turnOff() {
    const sub = reg && await reg.pushManager.getSubscription().catch(() => null);
    if (sub) {
      await ctx.sb.from('push_subs').delete().eq('endpoint', sub.endpoint).eq('app', ctx.app);
      await sub.unsubscribe().catch(() => {});
    }
    on = false;
    ctx.toast('이 기기의 새 건 알림을 껐습니다.');
  }

  async function toggle() {
    if (busy) return;
    busy = true; draw();
    try { on ? await turnOff() : await turnOn(); }
    catch (e) { ctx.toast('알림을 설정하지 못했어요. 잠시 후 다시 눌러 주세요.'); }
    busy = false; draw();
  }

  async function init(o) {
    ctx = o;
    if (o.button && !o.button._hl) { o.button._hl = true; o.button.addEventListener('click', toggle); }
    if (supported) {
      try { reg = await navigator.serviceWorker.register(o.sw || 'sw.js'); } catch (e) { reg = null; }
    }
    await refresh().catch(() => draw());
  }

  function hide() { if (ctx && ctx.button) ctx.button.hidden = true; }

  return { init, hide };
})();
