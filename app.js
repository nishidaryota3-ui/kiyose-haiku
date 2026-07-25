const SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';

let haikuDatabase = [];
let currentRoomHaikus = []; 
let currentIndex = 0;
let isRoomOpen = false;
let currentDisplayType = ''; 
let infoRevealed = false;

let navState = { currentLayer: 'topPage', category: '', seasonName: '', kigoName: '', authorName: '', isDetarame: false };

// スワイプ検知変数
let touchStartX = 0;
let touchStartY = 0;

window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // 1. キャッシュデータの即時復元（オフライン・爆速起動対策）
    restoreCachedHaikuDatabase();

    // 2. スプレッドシートから最新データの非同期取得
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?range=A:H&tqx=responseHandler:mainDataReceived`;
    document.body.appendChild(script);

    // スワイプイベントの登録
    initSwipeEvents();
};

// ローカルストレージからのキャッシュ復元
function restoreCachedHaikuDatabase() {
    try {
        const cachedData = localStorage.getItem('omikuji_haikuDatabase');
        if (cachedData) {
            haikuDatabase = JSON.parse(cachedData);
            if (haikuDatabase.length > 0) {
                document.getElementById('loadingOverlay').style.display = 'none';
                launchOmikuji();
                createHaijinList();
            }
        }
    } catch (e) {
        console.error('キャッシュ復元エラー:', e);
    }
}

function mainDataReceived(data) {
    try {
        const rows = data.table.rows;
        let freshDatabase = [];

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c || !c[0] || !c[0].v) continue;
            
            let phraseStr = String(c[0].v).trim();
            if (phraseStr === '俳句' || phraseStr === '句' || phraseStr === '') continue;

            let cleanSeason = c[6] && c[6].v ? String(c[6].v).trim().toLowerCase() : '';
            if (cleanSeason === 'sinnen') cleanSeason = 'shinnen';
            if (cleanSeason === 'fuyu') cleanSeason = 'huyu';
            if (cleanSeason === 'season' || cleanSeason === '季節') continue;

            freshDatabase.push({
                phrase: phraseStr,      
                author: c[1] && c[1].v ? String(c[1].v).trim() : '作者不詳',      
                authorKana: c[2] && c[2].v ? String(c[2].v).trim() : '',  
                kigo: c[3] && c[3].v ? String(c[3].v).trim() : '',        
                parentKigo: c[4] && c[4].v ? String(c[4].v).trim() : '',  
                kigoKana: c[5] && c[5].v ? String(c[5].v).trim() : '',    
                season: cleanSeason,                                      
                detailSeason: c[7] && c[7].v ? String(c[7].v).trim() : '' 
            });
        }

        if (freshDatabase.length > 0) {
            haikuDatabase = freshDatabase;
            // ローカルストレージへ保存（次回オフライン用）
            localStorage.setItem('omikuji_haikuDatabase', JSON.stringify(haikuDatabase));

            document.getElementById('loadingOverlay').style.display = 'none';
            
            // キャッシュがなくて初回起動だった場合のみ画面初期化
            if (!isRoomOpen && navState.currentLayer === 'topPage' && currentRoomHaikus.length === 0) {
                launchOmikuji();
                createHaijinList();
            }
        } else if (haikuDatabase.length === 0) {
            document.getElementById('loadingOverlay').innerText = 'データが空か、解析に失敗しました。';
        }
    } catch (error) {
        console.error(error);
        if (haikuDatabase.length === 0) {
            document.getElementById('loadingOverlay').innerText = 'システムエラーが発生しました。';
        }
    }
}

function launchOmikuji() {
    currentDisplayType = 'detarame';
    navState.category = 'omikuji_all';
    navState.isDetarame = true;
    
    currentRoomHaikus = [...haikuDatabase]; 
    shuffleArray(currentRoomHaikus);
    
    currentIndex = 0; 
    renderPage('roomPage'); 
    updateHaikuDisplay();
}

function triggerInstantOmikuji() {
    launchOmikuji();
}

function updateBreadcrumb() {
    const container = document.getElementById('globalBreadcrumb');
    if (navState.currentLayer === 'topPage') {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    let html = `<span class="link" onclick="renderPage('topPage')">home</span>`;
    
    if (navState.category === 'omikuji_all') {
        html += ` <span class="separator">&lt;</span> <span class="current">おみ句じ</span>`;
    } else if (navState.category === 'haijin') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="renderPage('haijinPage')">おみ句じ（俳人）</span>`;
        if (navState.currentLayer === 'roomPage') html += ` <span class="separator">&lt;</span> <span class="current">${navState.authorName}</span>`;
    } else if (navState.category === 'haiku') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="renderPage('haikuPage')">おみ句じ（季節）</span>`;
        if (navState.currentLayer === 'roomPage') html += ` <span class="separator">&lt;</span> <span class="current">${navState.seasonName}</span>`;
    } else if (navState.category === 'saijiki') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="renderPage('saijikiPage')">季寄せ</span>`;
        if (currentDisplayType !== 'kigo_muki') {
            if (navState.currentLayer === 'kigoListPage' || navState.currentLayer === 'roomPage') {
                html += ` <span class="separator">&lt;</span> <span class="link" onclick="showKigoList(getSeasonCode('${navState.seasonName}'), '${navState.seasonName}')">${navState.seasonName}</span>`;
            }
        }
        if (navState.currentLayer === 'roomPage') {
            const currentHaiku = currentRoomHaikus[currentIndex];
            let detailSuffix = (currentHaiku && currentHaiku.detailSeason) ? `（${currentHaiku.detailSeason}）` : '';
            html += ` <span class="separator">&lt;</span> <span class="current">${navState.kigoName}${detailSuffix}</span>`;
        }
    }
    container.innerHTML = html;
}

function renderPage(pageId) {
    document.querySelectorAll('.layer-page').forEach(page => page.style.display = 'none');
    const target = document.getElementById(pageId);
    if(target) target.style.display = 'flex';
    document.getElementById('infoTrigger').style.display = 'none';
    navState.currentLayer = pageId;
    
    if (pageId === 'topPage') { navState.category = ''; navState.isDetarame = false; }
    else if (pageId === 'haijinPage') navState.category = 'haijin';
    else if (pageId === 'haikuPage') navState.category = 'haiku';
    else if (pageId === 'saijikiPage') navState.category = 'saijiki';
    
    isRoomOpen = (pageId === 'roomPage');

    const catBtn = document.getElementById('fixedCatBtn');
    if (navState.category === 'saijiki') {
        catBtn.classList.remove('hidden');
    } else {
        catBtn.classList.add('hidden');
    }

    updateBreadcrumb();
}

function navigateTo(pageId) { renderPage(pageId); }
function getSeasonNameJa(code) { const map = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'}; return map[code] || code; }
function getSeasonCode(name) { const map = {'春':'haru', '夏':'natsu', '秋':'aki', '冬':'huyu', '新年':'shinnen', '無季':'muki'}; return map[name] || ''; }

function createHaijinList() {
    const container = document.getElementById('haijinList'); container.innerHTML = '';
    let authorMap = {};
    haikuDatabase.forEach(item => { if (!authorMap[item.author]) authorMap[item.author] = item.authorKana || item.author; });
    let uniqueAuthors = Object.keys(authorMap);
    uniqueAuthors.sort((a, b) => authorMap[a].localeCompare(authorMap[b], 'ja'));
    uniqueAuthors.forEach(author => {
        const el = document.createElement('div'); el.className = 'vertical-link'; el.innerText = author; 
        el.onclick = function() { jumpToAuthorRoom(author); };
        container.appendChild(el);
    });
    container.style.justifyContent = (uniqueAuthors.length > 5) ? 'flex-start' : 'center';
}

function jumpToAuthorRoom(author) {
    navState.authorName = author;
    openRoom('author', author, author);
}

function showKigoList(seasonCode, seasonName) {
    navState.seasonName = seasonName; navState.category = 'saijiki';
    const container = document.getElementById('kigoList'); container.innerHTML = '';
    
    let kigoMap = {};
    haikuDatabase.forEach(item => { 
        if (item.season === seasonCode) { 
            let targetKigo = item.parentKigo || item.kigo;
            if (targetKigo && !kigoMap[targetKigo]) {
                kigoMap[targetKigo] = item.kigoKana || targetKigo; 
            }
        } 
    });
    
    let uniqueKigos = Object.keys(kigoMap);
    if (uniqueKigos.length === 0) { alert('まだこの季節の季語が登録されていません。'); return; }
    uniqueKigos.sort((a, b) => kigoMap[a].localeCompare(kigoMap[b], 'ja'));
    uniqueKigos.forEach(kigo => {
        const el = document.createElement('div'); el.className = 'vertical-link'; el.innerText = kigo;
        el.onclick = function() { navState.kigoName = kigo; openRoom('kigo', kigo, kigo); }; 
        container.appendChild(el);
    });
    container.style.justifyContent = (uniqueKigos.length > 8) ? 'flex-start' : 'center';
    renderPage('kigoListPage');
}

function openRoom(type, targetValue, displayName) {
    currentDisplayType = type; 
    if (type === 'author') { navState.category = 'haijin'; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.author === targetValue); shuffleArray(currentRoomHaikus); }
    else if (type === 'haiku_season') { navState.category = 'haiku'; navState.seasonName = displayName; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.season === targetValue); shuffleArray(currentRoomHaikus); }
    else if (type === 'kigo') { navState.category = 'saijiki'; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => (item.parentKigo === targetValue || item.kigo === targetValue)); shuffleArray(currentRoomHaikus); }
    else if (type === 'detarame') { navState.category = 'omikuji_all'; navState.isDetarame = true; currentRoomHaikus = [...haikuDatabase]; shuffleArray(currentRoomHaikus); }
    else if (type === 'kigo_muki') { navState.category = 'saijiki'; navState.seasonName = '無季'; navState.kigoName = '無季'; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.season === 'muki'); shuffleArray(currentRoomHaikus); }
    
    if (currentRoomHaikus.length === 0) { alert('まだ条件に合う俳句が登録されていません。'); return; }
    currentIndex = 0; renderPage('roomPage'); updateHaikuDisplay();
}

function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
function changeHaiku(direction) { if (currentIndex + direction >= 0 && currentIndex + direction < currentRoomHaikus.length) { currentIndex += direction; updateHaikuDisplay(); } }

function revealHiddenInfo() {
    infoRevealed = true; 
    document.getElementById('infoTrigger').style.display = 'none';
    const currentHaiku = currentRoomHaikus[currentIndex];
    
    document.getElementById('roomMainTag').innerHTML = `<a href="javascript:void(0);" onclick="jumpToAuthorRoom('${currentHaiku.author}')">${currentHaiku.author}</a>`;
    updateBreadcrumb();
}

/* 🏷️ 右上情報：カテゴリーごとの厳密な表示コントロール */
function updateHaikuDisplay() {
    const currentHaiku = currentRoomHaikus[currentIndex];
    document.getElementById('haikuPhrase').innerText = currentHaiku.phrase;

    let kigoString = '';
    if (currentHaiku.season === 'muki') {
        kigoString = '無季';
    } else {
        let pKigo = currentHaiku.parentKigo || currentHaiku.kigo;
        let dSeason = currentHaiku.detailSeason ? `（${currentHaiku.detailSeason}）` : '';
        kigoString = pKigo + dSeason;
    }

    if (navState.category === 'omikuji_all') {
        infoRevealed = false; 
        document.getElementById('roomMainTag').innerText = ''; 
        document.getElementById('infoTrigger').style.display = 'inline-block';
    } 
    // 1. 「俳人」カテゴリーのみ：右上に「季語＋（詳細季節）」を表示
    else if (navState.category === 'haijin') {
        document.getElementById('infoTrigger').style.display = 'none'; 
        const mainTag = document.getElementById('roomMainTag');
        mainTag.className = 'info-upper-tag';
        mainTag.innerText = kigoString;
    }
    // 2. 「季節」「季寄せ」などその他のカテゴリー：右上に「作者名」を表示
    else {
        document.getElementById('infoTrigger').style.display = 'none'; 
        const mainTag = document.getElementById('roomMainTag');
        mainTag.className = 'info-upper-tag';
        mainTag.innerText = currentHaiku.author;
    }

    if (currentIndex === 0) document.getElementById('prevBtn').classList.add('disabled'); else document.getElementById('prevBtn').classList.remove('disabled');
    if (currentIndex === currentRoomHaikus.length - 1) document.getElementById('nextBtn').classList.add('disabled'); else document.getElementById('nextBtn').classList.remove('disabled');
    
    updateBreadcrumb();
}

// 📱 スワイプ（フリック）操作の感度ロジック
function initSwipeEvents() {
    const room = document.getElementById('roomPage');
    if (!room) return;

    room.addEventListener('touchstart', function(e) {
        if (!isRoomOpen) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    room.addEventListener('touchend', function(e) {
        if (!isRoomOpen) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) {
                changeHaiku(1);
            } else {
                changeHaiku(-1);
            }
        }
    }, { passive: true });
}

// キーボード操作対応
document.addEventListener('keydown', function(event) {
    if (event.key === 'o' || event.key === 'O') {
        triggerInstantOmikuji();
        return;
    }

    if (!isRoomOpen) return;
    if (event.key === 'ArrowLeft') changeHaiku(1); 
    if (event.key === 'ArrowRight') changeHaiku(-1); 
    if (event.key === 'i' || event.key === 'I') { if (navState.category === 'omikuji_all' && !infoRevealed) revealHiddenInfo(); }
});
