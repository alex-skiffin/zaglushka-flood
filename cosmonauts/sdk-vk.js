// ═══════════════════════════════════════════════════════════════════════════
// Адаптер платформы: VK Games (VK Mini Apps)
//
// Глобальный объект `vkBridge` (при подключении скриптом — имя `vkBridge`,
// при импорте из npm — `bridge`).
//
// Особенности, которые обязаны быть учтены (см. план, §7.2):
//   • vkBridge.send('VKWebAppInit') ОБЯЗАН уйти в первые 30 секунд — иначе
//     игра не запускается. Инициализация делается сразу при загрузке скрипта,
//     НЕ после window.load.
//   • Реклама: vkBridge.send('VKWebAppShowNativeAds', {ad_format:'reward'|'interstitial'})
//     → {result:boolean}. Награда — только при result:true.
//   • Сохранения: VKWebAppStorageSet / VKWebAppStorageGet — ЛИМИТ 4096 символов
//     на значение. Формат сохранения разбит на 3 ключа (см. saveDataParts) —
//     каждый влезает.
//   • Язык: vk_language из VKWebAppGetLaunchParams (ru,en,uk,ua,be,kz,pt,es).
//   • Пауза/возобновление: VKWebAppViewHide / VKWebAppViewRestore.
//     Событий GameplayStart/Stop в VK НЕТ.
//   • Interstitial: только между экранами, НЕ на запуске (п. 5.1.5.2(б)) и
//     не чаще 1 раза в 30 с (п. 5.1.5.2(г)).
//   • Очки в штатную таблицу VK из браузера записать НЕЛЬЗЯ: только
//     secure.addAppEvent, а он требует сервисный ключ (серверная часть).
//     Своего бэкенда у игры нет, поэтому таблица лидеров в сборке VK не
//     ведётся — она есть только в сборке Яндекс Игр.
//
// ВАЖНО: скрипт VK Bridge грузится асинхронно, но VKWebAppInit должен уйти
// как можно раньше. Поэтому init() вызывается сразу, а не по событию load.
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const PLATFORM = {
    name:'vk',
    ready:false,
    lang:'ru',
    // IAP в VK Mini Apps нет — покупки только за монеты и rewarded-рекламу.
    capabilities:{ads:false,interstitial:false,iap:false,leaderboard:false,cloudSave:false,auth:false},
    _bridge:null,
    _ready:null,
    // Интервал между interstitial: не чаще 1 раза в 30 с.
    _lastInterstitial:0,
    _INTERSTITIAL_COOLDOWN:30000,
  };

  function bridge(){
    if(PLATFORM._bridge) return PLATFORM._bridge;
    if(window.vkBridge) PLATFORM._bridge = window.vkBridge;
    else if(window.bridge) PLATFORM._bridge = window.bridge;
    return PLATFORM._bridge;
  }

  // Вызов метода VK: всегда промис, ошибки не бросаются наружу.
  function call(method, params){
    const b = bridge();
    if(!b || typeof b.send !== 'function') return Promise.reject(new Error('no-bridge'));
    try{
      return Promise.resolve(b.send(method, params||{})).catch(e=>{throw e;});
    }catch(e){
      return Promise.reject(e);
    }
  }

  // ── Реклама ───────────────────────────────────────────────────────────────
  PLATFORM.showRewarded = function(h){
    h = h || {};
    let settled=false;
    const done=(cb,arg)=>{ if(settled)return; settled=true; try{ if(cb) cb(arg); }catch(e){} };
    call('VKWebAppShowNativeAds',{ad_format:'reward'}).then(res=>{
      // result:true — реклама показана и засчитана
      if(res && res.result){
        try{ if(h.onOpen) h.onOpen(); }catch(e){}
        try{ if(h.onRewarded) h.onRewarded(); }catch(e){}
      }
      done(h.onClose, res);
    }).catch(err=>{
      done(h.onError, err);
    });
  };

  PLATFORM.showInterstitial = function(h){
    h = h || {};
    let settled=false;
    const done=(cb,arg)=>{ if(settled)return; settled=true; try{ if(cb) cb(arg); }catch(e){} };
    // Пункт 5.1.5.2(г): не чаще 1 interstitial в 30 с
    const now=Date.now();
    if(now-PLATFORM._lastInterstitial < PLATFORM._INTERSTITIAL_COOLDOWN){ done(h.onClose); return; }
    call('VKWebAppShowNativeAds',{ad_format:'interstitial'}).then(res=>{
      if(res && res.result) PLATFORM._lastInterstitial=now;
      done(h.onClose, res);
    }).catch(err=>{ done(h.onError, err); });
  };

  // ── Геймплей / загрузка ───────────────────────────────────────────────────
  // В VK нет GameplayAPI — площадка сама знает, когда приложение в фокусе.
  PLATFORM.setGameplay = function(){};
  PLATFORM.loadingReady = function(){};

  // ── Сохранения: VKWebAppStorageSet/Get ───────────────────────────────────
  // Лимит 4096 символов на значение — формат разбит на 3 ключа.
  PLATFORM.saveData = function(parts){
    const keys = Object.keys(parts||{});
    if(!keys.length) return Promise.resolve(true);
    return keys.reduce((chain,k)=>chain.then(()=>{
      const value = JSON.stringify(parts[k]);
      if(value.length > 4096){
        // Превышение лимита VK — молча пропускаем эту часть, игру не роняем.
        return Promise.resolve();
      }
      return call('VKWebAppStorageSet',{key:k,value:value}).catch(()=>{});
    }), Promise.resolve()).then(()=>true);
  };
  PLATFORM.loadData = function(keys){
    return Promise.all((keys||[]).map(k=>{
      return call('VKWebAppStorageGet',{keys:[k]}).then(res=>{
        const raw = res && res.keys && res.keys[0] && res.keys[0].value;
        if(raw==null) return [k,null];
        try{ return [k, JSON.parse(raw)]; }catch(e){ return [k,null]; }
      }).catch(()=>[k,null]);
    })).then(pairs=>{
      const out={};
      pairs.forEach(([k,v])=>{ if(v!=null) out[k]=v; });
      return out;
    });
  };

  // ── Игрок: в VK нет отдельного игрока, только пользователь VK ───────────
  PLATFORM.getPlayer = function(){ return Promise.resolve(null); };
  PLATFORM.isAuthorized = function(){ return false; };
  PLATFORM.openAuthDialog = function(){ return Promise.resolve(false); };

  // ── Лидерборд ─────────────────────────────────────────────────────────────
  // Штатную таблицу VK из браузера не заполнить: secure.addAppEvent требует
  // сервисный ключ, а он живёт на сервере. Своего бэкенда у игры больше нет,
  // поэтому таблицы лидеров в сборке VK нет — она есть только в Яндекс Играх.

  // ── Покупки: в VK нет ────────────────────────────────────────────────────
  PLATFORM.getPayments = function(){ return Promise.resolve(null); };

  // ── Пауза/возобновление: VKWebAppViewHide / VKWebAppViewRestore ──────────
  PLATFORM.setPauseHandlers = function(onPause, onResume){
    PLATFORM._onPause = onPause;
    PLATFORM._onResume = onResume;
    const b = bridge();
    if(!b || typeof b.on !== 'function') return;
    try{
      b.on('VKWebAppViewHide', ()=>{ try{ if(PLATFORM._onPause) PLATFORM._onPause(); }catch(e){} });
      b.on('VKWebAppViewRestore', ()=>{ try{ if(PLATFORM._onResume) PLATFORM._onResume(); }catch(e){} });
    }catch(e){}
  };
  PLATFORM._onPause = null;
  PLATFORM._onResume = null;

  // ── Инициализация ─────────────────────────────────────────────────────────
  // ВАЖНО: вызывается сразу при загрузке скрипта — VKWebAppInit обязан уйти
  // в первые 30 секунд, иначе игра не запустится.
  PLATFORM.init = function(){
    if(PLATFORM._ready) return PLATFORM._ready;
    PLATFORM._ready = new Promise(resolve=>{
      const b = bridge();
      if(!b){
        // Мост не загрузился (локальный тест) — играем без площадки.
        // ready=true: инициализация завершилась, просто без площадки.
        PLATFORM.ready = true;
        resolve(PLATFORM);
        return;
      }
      // VKWebAppInit — обязательный первый вызов, и он должен уйти немедленно.
      call('VKWebAppInit',{})
        .then(()=>call('VKWebAppGetLaunchParams',{}))
        .then(params=>{
          const vkLang = params && params.vk_language || '';
          const l = String(vkLang).slice(0,2).toLowerCase();
          // В игре 4 языка: ru/en/tr/es. Из языков VK берём tr (есть) и es (есть);
          // украинский/казахский и прочие → русский.
          PLATFORM.lang = (l==='en'||l==='tr'||l==='es') ? l : 'ru';
          PLATFORM.capabilities.ads = true;
          PLATFORM.capabilities.interstitial = true;
          PLATFORM.capabilities.cloudSave = true;
          // Лидерборда в сборке VK нет — таблица лидеров есть только в сборке
          // Яндекс Игр. Кнопку рейтинга игра прячет сама (capabilities).
          PLATFORM.capabilities.leaderboard = false;
          PLATFORM.ready = true;
          resolve(PLATFORM);
        })
        .catch(()=>{
          // Мост ответил ошибкой — играем без площадки, но не падаем
          PLATFORM.ready = true;
          resolve(PLATFORM);
        });
    });
    return PLATFORM._ready;
  };

  window.PLATFORM = PLATFORM;
  window.PLATFORM_READY = PLATFORM.init();
})();
