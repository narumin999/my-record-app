let selectedPhotosData = []; 
let autocomplete = null;
let selectedColorId = "";
let modalSelectedColorId = "";
let editingRecordId = null; 

// ▼グローバルな分類データ（初期設定）
let globalCategories = [
    { name: "記録", colorId: "" },
    { name: "外食", colorId: "11" },
    { name: "旅行", colorId: "7" },
    { name: "お城めぐり", colorId: "8" },
    { name: "星景写真", colorId: "9" },
    { name: "開発", colorId: "10" }
];

const CALENDAR_COLORS = [
    { val: "", name: "標準", bg: "#f1f3f4", color: "#5f6368" },
    { val: "1", name: "ラベンダー", bg: "#7986CB" },
    { val: "2", name: "セージ", bg: "#33B679" },
    { val: "3", name: "ブドウ", bg: "#8E24AA" },
    { val: "4", name: "フラミンゴ", bg: "#E67C73" },
    { val: "5", name: "バナナ", bg: "#F6BF26" },
    { val: "6", name: "ミカン", bg: "#F4511E" },
    { val: "7", name: "ピーコック", bg: "#039BE5" },
    { val: "8", name: "グラファイト", bg: "#616161" },
    { val: "9", name: "ブルーベリー", bg: "#3F51B5" },
    { val: "10", name: "バジル", bg: "#0B8043" },
    { val: "11", name: "トマト", bg: "#D50000" }
];

window.onload = function () {
    const mapScript = document.createElement('script');
    mapScript.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.MAP_API_KEY}&libraries=places&language=ja`;
    mapScript.async = true;
    mapScript.defer = true;
    mapScript.onload = () => { initAutocomplete(); };
    document.head.appendChild(mapScript);

    initDateFields();
    generateColorPalette('color-palette', false);
    generateColorPalette('modal-color-palette', true);

    initAuth(() => { loadRecordsList(); });
};

// --- カラーパレットの動的生成と選択処理 ---
function generateColorPalette(containerId, isModal) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    CALENDAR_COLORS.forEach(c => {
        const chip = document.createElement('div');
        chip.className = 'color-chip';
        if (c.val === "") chip.classList.add('selected');
        chip.setAttribute('data-value', c.val);
        chip.title = c.name;
        chip.style.background = c.bg;
        if (c.color) chip.style.color = c.color;
        if (c.val === "") chip.innerText = "標準";
        
        chip.onclick = () => {
            container.querySelectorAll('.color-chip').forEach(el => el.classList.remove('selected'));
            chip.classList.add('selected');
            if (isModal) {
                modalSelectedColorId = c.val;
            } else {
                selectedColorId = c.val;
            }
        };
        container.appendChild(chip);
    });
}

function selectColorInMainPalette(colorId) {
    selectedColorId = colorId || "";
    document.querySelectorAll('#color-palette .color-chip').forEach(c => {
        c.classList.remove('selected');
        if (c.getAttribute('data-value') === selectedColorId) {
            c.classList.add('selected');
        }
    });
}

// --- 分類の描画・連動処理 ---
function renderCategorySelect() {
    const select = document.getElementById('input-category');
    const currentVal = select.value;
    select.innerHTML = '';
    globalCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.innerText = cat.name;
        select.appendChild(opt);
    });
    
    if (globalCategories.some(c => c.name === currentVal)) {
        select.value = currentVal;
    } else if (globalCategories.length > 0) {
        select.value = globalCategories[0].name;
    }
}

function onCategoryChange() {
    const catName = document.getElementById('input-category').value;
    const cat = globalCategories.find(c => c.name === catName);
    if (cat) selectColorInMainPalette(cat.colorId); // ここでカレンダーの色を自動連動！
}

// --- 分類管理ポップアップ機能 ---
function openCategoryModal() {
    document.getElementById('category-modal').style.display = 'flex';
    renderCategoryListInModal();
}

function closeCategoryModal() {
    document.getElementById('category-modal').style.display = 'none';
    document.getElementById('new-cat-name').value = '';
    document.getElementById('modal-status-msg').innerText = '';
}

function renderCategoryListInModal() {
    const list = document.getElementById('category-list');
    list.innerHTML = '';
    globalCategories.forEach((cat, index) => {
        const colorObj = CALENDAR_COLORS.find(c => c.val === (cat.colorId || ""));
        const bg = colorObj ? colorObj.bg : "#f1f3f4";
        
        list.innerHTML += `
            <div class="cat-list-item">
                <div>
                    <span class="cat-color-indicator" style="background: ${bg}"></span>
                    <span style="font-weight:bold;">${cat.name}</span>
                </div>
                <button type="button" class="btn btn-danger" style="width:auto; padding:6px 12px; font-size:12px; margin:0;" onclick="deleteCategory(${index})">削除</button>
            </div>
        `;
    });
}

async function addCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return alert('分類名を入力してください');
    if (globalCategories.find(c => c.name === name)) return alert('その分類は既に存在します');
    
    globalCategories.push({ name: name, colorId: modalSelectedColorId });
    document.getElementById('new-cat-name').value = '';
    generateColorPalette('modal-color-palette', true); // 色選択をリセット
    modalSelectedColorId = "";
    
    renderCategoryListInModal();
    renderCategorySelect();
    await saveCategoriesToDrive();
}

async function deleteCategory(index) {
    if (globalCategories[index].name === "記録") return alert('デフォルトの「記録」は削除できません');
    if (confirm(`分類「${globalCategories[index].name}」を削除しますか？`)) {
        globalCategories.splice(index, 1);
        renderCategoryListInModal();
        renderCategorySelect();
        await saveCategoriesToDrive();
    }
}

async function saveCategoriesToDrive() {
    const status = document.getElementById('modal-status-msg');
    status.innerText = 'Google Driveに設定を保存中...';
    status.style.color = '#333';
    try {
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        let { fileId: dbFileId, dbData } = await getDatabase(htmlFolderId);
        
        let records = [];
        if (Array.isArray(dbData)) records = dbData;
        else if (dbData && dbData.records) records = dbData.records;
        
        // 記録と分類設定をまとめて保存
        const newData = { records: records, categories: globalCategories };
        await saveDatabase(htmlFolderId, dbFileId, newData);
        
        status.innerText = '保存が完了しました！';
        status.style.color = 'green';
        setTimeout(() => status.innerText = '', 2000);
    } catch (e) {
        status.innerText = 'エラーが発生しました';
        status.style.color = 'red';
    }
}

// --- その他のUI・保存ロジック（既存機能＋分類対応） ---
function initAutocomplete() {
    const input = document.getElementById('input-location');
    if (window.google && window.google.maps && window.google.maps.places) {
        autocomplete = new google.maps.places.Autocomplete(input, { types: ['geocode', 'establishment'] });
    } else { setTimeout(initAutocomplete, 500); }
}

function initDateFields() {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localTime = new Date(Date.now() - tzOffset);
    document.getElementById('input-date').value = localTime.toISOString().slice(0, 10);
    document.getElementById('input-start-datetime').value = localTime.toISOString().slice(0, 16);
    const oneHourLater = new Date(localTime.getTime() + 60 * 60 * 1000);
    document.getElementById('input-end-datetime').value = oneHourLater.toISOString().slice(0, 16);
}

function toggleDateTime() {
    const isAllDay = document.getElementById('is-allday').checked;
    document.getElementById('date-inputs').style.display = isAllDay ? 'block' : 'none';
    document.getElementById('datetime-inputs').style.display = isAllDay ? 'none' : 'block';
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if(tab === 'create') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-create').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-view').classList.add('active');
        loadRecordsList();
    }
}

async function processPhotos(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    document.getElementById('status-msg').innerText = "写真を読み込み中...";
    for (let file of files) {
        try {
            const base64Data = await resizeImage(file, 1200, 1200);
            selectedPhotosData.push({ url: base64Data, isNew: true });
        } catch(e) { console.error(e); }
    }
    document.getElementById('status-msg').innerText = "";
    renderPreview();
    event.target.value = ""; 
}

function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
                } else {
                    if (height > maxHeight) { width = Math.round((height * maxHeight) / height); height = maxHeight; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85)); 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function renderPreview() {
    const preview = document.getElementById('selected-photos-preview');
    preview.innerHTML = '';
    selectedPhotosData.forEach((item, index) => {
        const container = document.createElement('div');
        container.style.position = 'relative';
        
        const img = document.createElement('img');
        img.src = item.url;
        img.style.width = '60px'; img.style.height = '60px';
        img.style.objectFit = 'cover'; img.style.borderRadius = '4px';
        
        const delBtn = document.createElement('button');
        delBtn.innerText = '×';
        delBtn.style.position = 'absolute'; delBtn.style.top = '-5px'; delBtn.style.right = '-5px';
        delBtn.style.background = 'red'; delBtn.style.color = 'white'; delBtn.style.border = 'none';
        delBtn.style.borderRadius = '50%'; delBtn.style.cursor = 'pointer';
        delBtn.onclick = () => { selectedPhotosData.splice(index, 1); renderPreview(); };
        
        container.appendChild(img);
        container.appendChild(delBtn);
        preview.appendChild(container);
    });
}

function stripHtmlTags(html) { if (!html) return ''; return html.replace(/<[^>]*>/g, '').trim(); }

function formatText(type) {
    const textarea = document.getElementById('input-text');
    const start = textarea.selectionStart; const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let replacement = '';
    switch(type) {
        case 'b': replacement = `<b>${selectedText}</b>`; break;
        case 'i': replacement = `<i>${selectedText}</i>`; break;
        case 'u': replacement = `<u>${selectedText}</u>`; break;
        case 's': replacement = `<s>${selectedText}</s>`; break;
        case 'ul': replacement = `<ul>\n  <li>${selectedText || 'リスト項目'}</li>\n</ul>`; break;
        case 'ol': replacement = `<ol>\n  <li>${selectedText || 'リスト項目'}</li>\n</ol>`; break;
        case 'a':
            const url = prompt("リンク先のURLを入力してください:", "https://");
            if (!url) return;
            const linkText = selectedText || prompt("リンクの表示テキストを入力してください:", "リンク");
            replacement = `<a href="${url}" target="_blank">${linkText}</a>`; break;
        case 'clear': replacement = stripHtmlTags(selectedText); break;
    }
    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + replacement.length, start + replacement.length);
}

async function saveRecord() {
    const category = document.getElementById('input-category').value || '記録';
    const title = document.getElementById('input-title').value;
    const text = document.getElementById('input-text').value;
    if(!title) { alert("タイトルは必須です！"); return; }

    const isAllDay = document.getElementById('is-allday').checked;
    let startObj, endObj, displayDate;
    if (isAllDay) {
        const d = document.getElementById('input-date').value;
        if(!d) { alert("日付を選択してください"); return; }
        startObj = { date: d }; endObj = { date: d }; displayDate = d;
    } else {
        const sDt = document.getElementById('input-start-datetime').value;
        const eDt = document.getElementById('input-end-datetime').value;
        if(!sDt || !eDt) { alert("開始と終了の日時を選択してください"); return; }
        startObj = { dateTime: sDt + ":00+09:00" }; endObj = { dateTime: eDt + ":00+09:00" }; displayDate = sDt.replace('T', ' ');
    }
    const locationStr = document.getElementById('input-location').value;
    const status = document.getElementById('status-msg');
    
    try {
        status.innerText = "保存先フォルダを準備中...";
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        const photosFolderId = await getOrCreateFolder('photos', rootFolderId);

        let { fileId: dbFileId, dbData } = await getDatabase(htmlFolderId);
        let records = [];
        if (Array.isArray(dbData)) records = dbData;
        else if (dbData && dbData.records) records = dbData.records;
        
        let existingRecord = editingRecordId ? records.find(r => r.id === editingRecordId) : null;

        status.innerText = "写真をアップロード中...";
        const uploadedImgIds = [];
        for (let item of selectedPhotosData) {
            if (item.isNew) {
                const imgId = await uploadImageToDrive(item.url, `${displayDate.slice(0,10)}_${title}.jpg`, photosFolderId);
                uploadedImgIds.push(imgId);
            } else { uploadedImgIds.push(item.id); }
        }

        status.innerText = "HTMLファイルを保存中...";
        const htmlFileId = await saveHtmlFile(htmlFolderId, existingRecord ? existingRecord.htmlFileId : null, title, displayDate, locationStr, text, uploadedImgIds);

        const plainText = stripHtmlTags(text);
        const snippet = plainText.length > 100 ? plainText.substring(0, 100) + "..." : plainText;
        const descriptionStr = `${snippet}\n\n▼全文・画像はこちら\n${CONFIG.VIEWER_API_URL}?id=${htmlFileId}`;
        
        const eventData = { summary: `[${category}] ${title}`, description: descriptionStr, start: startObj, end: endObj };
        if (locationStr) eventData.location = locationStr;
        if (selectedColorId) eventData.colorId = selectedColorId;

        let calendarEventId = existingRecord ? existingRecord.calendarEventId : null;
        if (calendarEventId) {
            status.innerText = "カレンダーの予定を更新中...";
            await updateCalendarEvent(calendarEventId, eventData);
        } else {
            status.innerText = "カレンダーに予定を追加中...";
            calendarEventId = await createCalendarEvent(eventData);
        }

        const recordData = {
            id: editingRecordId || 'rec_' + Date.now(),
            htmlFileId: htmlFileId,
            calendarEventId: calendarEventId,
            category: category,
            title, displayDate, isAllDay, 
            start: isAllDay ? document.getElementById('input-date').value : document.getElementById('input-start-datetime').value,
            end: isAllDay ? document.getElementById('input-date').value : document.getElementById('input-end-datetime').value,
            location: locationStr,
            colorId: selectedColorId,
            text, photos: uploadedImgIds
        };

        if (existingRecord) {
            const index = records.findIndex(r => r.id === editingRecordId);
            records[index] = recordData;
        } else { records.unshift(recordData); }

        const newData = { records: records, categories: globalCategories };
        await saveDatabase(htmlFolderId, dbFileId, newData);

        status.innerText = "保存が完了しました！"; status.style.color = "green";
        resetForm();
        setTimeout(() => { status.innerText = ""; status.style.color = "#333"; }, 3000);
        switchTab('view');
    } catch (error) {
        console.error(error); status.innerText = "エラーが発生しました。"; status.style.color = "red";
    }
}

async function loadRecordsList() {
    try {
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        const { dbData } = await getDatabase(htmlFolderId);
        
        let records = [];
        if (Array.isArray(dbData)) {
            records = dbData;
        } else if (dbData) {
            records = dbData.records || [];
            if (dbData.categories && dbData.categories.length > 0) {
                globalCategories = dbData.categories;
            }
        }
        
        renderCategorySelect(); // ここでユーザー固有の分類をプルダウンに反映
        
        const listDiv = document.getElementById('record-list');
        listDiv.innerHTML = '';
        if(!records || records.length === 0) {
            listDiv.innerHTML = '<p style="color:#666;">記録がまだありません。</p>'; return;
        }
        records.forEach(record => {
            const item = document.createElement('div');
            item.className = 'record-item';
            const displayCategory = record.category || '記録';
            item.innerHTML = `
                <div>
                    <strong>[${displayCategory}] ${record.title}</strong>
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">${record.displayDate}</div>
                </div>
                <span style="font-size:12px; color:blue;">[編集]</span>
            `;
            item.onclick = () => loadRecordIntoForm(record);
            listDiv.appendChild(item);
        });
    } catch (error) { console.error(error); }
}

function loadRecordIntoForm(record) {
    editingRecordId = record.id;
    
    document.getElementById('input-category').value = record.category || '記録';
    onCategoryChange(); // 分類に合わせて色を自動切換
    
    // 過去データ等で独自の色が上書きされていた場合はそれを優先
    if (record.colorId !== undefined) {
        selectColorInMainPalette(record.colorId);
    }

    document.getElementById('input-title').value = record.title;
    document.getElementById('input-text').value = record.text || '';
    document.getElementById('input-location').value = record.location || '';
    
    document.getElementById('is-allday').checked = record.isAllDay;
    toggleDateTime();
    if (record.isAllDay) {
        document.getElementById('input-date').value = record.start;
    } else {
        document.getElementById('input-start-datetime').value = record.start;
        document.getElementById('input-end-datetime').value = record.end;
    }

    selectedPhotosData = (record.photos || []).map(id => ({ id: id, url: `https://drive.google.com/thumbnail?id=${id}&sz=w200`, isNew: false }));
    renderPreview();

    document.getElementById('save-btn-text').innerText = "変更を保存する";
    document.getElementById('delete-btn').style.display = 'block';

    switchTab('create');
}

async function deleteCurrentRecord() {
    if (!editingRecordId) return;
    if (!confirm("この記録とGoogleカレンダーの予定を完全に削除しますか？")) return;
    const status = document.getElementById('status-msg');
    status.innerText = "削除中...";
    try {
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        let { fileId: dbFileId, dbData } = await getDatabase(htmlFolderId);
        
        let records = [];
        if (Array.isArray(dbData)) records = dbData;
        else if (dbData && dbData.records) records = dbData.records;

        const record = records.find(r => r.id === editingRecordId);
        if (record) {
            if (record.htmlFileId) await deleteDriveFile(record.htmlFileId);
            if (record.calendarEventId) await deleteCalendarEvent(record.calendarEventId);
            records = records.filter(r => r.id !== editingRecordId);
            
            const newData = { records: records, categories: globalCategories };
            await saveDatabase(htmlFolderId, dbFileId, newData);
        }
        status.innerText = "削除しました"; status.style.color = "green";
        resetForm();
        setTimeout(() => { status.innerText = ""; status.style.color = "#333"; }, 2000);
        switchTab('view');
    } catch (error) {
        console.error(error); status.innerText = "削除に失敗しました。"; status.style.color = "red";
    }
}

function resetForm() {
    editingRecordId = null;
    document.getElementById('input-category').value = '記録';
    onCategoryChange(); // 色をデフォルトに戻す
    document.getElementById('input-title').value = '';
    document.getElementById('input-text').value = '';
    document.getElementById('input-location').value = '';
    selectedPhotosData = [];
    renderPreview();
    initDateFields();
    document.getElementById('is-allday').checked = true;
    toggleDateTime();
    
    document.getElementById('save-btn-text').innerText = "保存 (Drive連携 & カレンダー登録)";
    document.getElementById('delete-btn').style.display = 'none';
}
