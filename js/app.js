let selectedFilesData = []; // photos から files に変更
let autocomplete = null;
let selectedColorId = "";
let modalSelectedColorId = "";
let editingRecordId = null; 

let globalCategories = [
    { name: "記録", colorId: "" }, { name: "外食", colorId: "11" },
    { name: "旅行", colorId: "7" }, { name: "お城めぐり", colorId: "8" },
    { name: "星景写真", colorId: "9" }, { name: "開発", colorId: "10" }
];

const CALENDAR_COLORS = [
    { val: "", name: "標準", bg: "#f1f3f4", color: "#5f6368" },
    { val: "1", name: "ラベンダー", bg: "#7986CB" }, { val: "2", name: "セージ", bg: "#33B679" },
    { val: "3", name: "ブドウ", bg: "#8E24AA" }, { val: "4", name: "フラミンゴ", bg: "#E67C73" },
    { val: "5", name: "バナナ", bg: "#F6BF26" }, { val: "6", name: "ミカン", bg: "#F4511E" },
    { val: "7", name: "ピーコック", bg: "#039BE5" }, { val: "8", name: "グラファイト", bg: "#616161" },
    { val: "9", name: "ブルーベリー", bg: "#3F51B5" }, { val: "10", name: "バジル", bg: "#0B8043" },
    { val: "11", name: "トマト", bg: "#D50000" }
];

window.onload = function () {
    const mapScript = document.createElement('script');
    mapScript.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.MAP_API_KEY}&libraries=places&language=ja`;
    mapScript.async = true; mapScript.defer = true;
    mapScript.onload = () => { initAutocomplete(); };
    document.head.appendChild(mapScript);

    initDateFields(); generateColorPalette('color-palette', false); generateColorPalette('modal-color-palette', true);
    initAuth(() => { loadRecordsList(); });
};

function generateColorPalette(containerId, isModal) {
    const container = document.getElementById(containerId); container.innerHTML = '';
    CALENDAR_COLORS.forEach(c => {
        const chip = document.createElement('div'); chip.className = 'color-chip';
        if (c.val === "") chip.classList.add('selected');
        chip.setAttribute('data-value', c.val); chip.title = c.name; chip.style.background = c.bg;
        if (c.color) chip.style.color = c.color;
        if (c.val === "") chip.innerText = "標準";
        
        chip.onclick = () => {
            container.querySelectorAll('.color-chip').forEach(el => el.classList.remove('selected'));
            chip.classList.add('selected');
            if (isModal) modalSelectedColorId = c.val; else selectedColorId = c.val;
        };
        container.appendChild(chip);
    });
}

function selectColorInMainPalette(colorId) {
    selectedColorId = colorId || "";
    document.querySelectorAll('#color-palette .color-chip').forEach(c => {
        c.classList.remove('selected');
        if (c.getAttribute('data-value') === selectedColorId) c.classList.add('selected');
    });
}

function renderCategorySelect() {
    const select = document.getElementById('input-category');
    const currentVal = select.value; select.innerHTML = '';
    globalCategories.forEach(cat => {
        const opt = document.createElement('option'); opt.value = cat.name; opt.innerText = cat.name; select.appendChild(opt);
    });
    if (globalCategories.some(c => c.name === currentVal)) select.value = currentVal;
    else if (globalCategories.length > 0) select.value = globalCategories[0].name;
}

function onCategoryChange() {
    const catName = document.getElementById('input-category').value;
    const cat = globalCategories.find(c => c.name === catName);
    if (cat) selectColorInMainPalette(cat.colorId);
}

function openCategoryModal() { document.getElementById('category-modal').style.display = 'flex'; renderCategoryListInModal(); }
function closeCategoryModal() { document.getElementById('category-modal').style.display = 'none'; document.getElementById('new-cat-name').value = ''; document.getElementById('modal-status-msg').innerText = ''; }

function renderCategoryListInModal() {
    const list = document.getElementById('category-list'); list.innerHTML = '';
    globalCategories.forEach((cat, index) => {
        const colorObj = CALENDAR_COLORS.find(c => c.val === (cat.colorId || ""));
        const bg = colorObj ? colorObj.bg : "#f1f3f4";
        list.innerHTML += `<div class="cat-list-item"><div><span class="cat-color-indicator" style="background: ${bg}"></span><span style="font-weight:bold;">${cat.name}</span></div><button type="button" class="btn btn-danger" style="width:auto; padding:6px 12px; font-size:12px; margin:0;" onclick="deleteCategory(${index})">削除</button></div>`;
    });
}

async function addCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return alert('分類名を入力してください');
    if (globalCategories.find(c => c.name === name)) return alert('その分類は既に存在します');
    globalCategories.push({ name: name, colorId: modalSelectedColorId });
    document.getElementById('new-cat-name').value = ''; generateColorPalette('modal-color-palette', true); modalSelectedColorId = "";
    renderCategoryListInModal(); renderCategorySelect(); await saveCategoriesToDrive();
}

async function deleteCategory(index) {
    if (globalCategories[index].name === "記録") return alert('デフォルトの「記録」は削除できません');
    if (confirm(`分類「${globalCategories[index].name}」を削除しますか？`)) {
        globalCategories.splice(index, 1); renderCategoryListInModal(); renderCategorySelect(); await saveCategoriesToDrive();
    }
}

async function saveCategoriesToDrive() {
    const status = document.getElementById('modal-status-msg');
    status.innerText = 'Google Driveに設定を保存中...'; status.style.color = '#333';
    try {
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        let { fileId: dbFileId, dbData } = await getDatabase(htmlFolderId);
        let records = [];
        if (Array.isArray(dbData)) records = dbData; else if (dbData && dbData.records) records = dbData.records;
        const newData = { records: records, categories: globalCategories };
        await saveDatabase(htmlFolderId, dbFileId, newData);
        status.innerText = '保存が完了しました！'; status.style.color = 'green'; setTimeout(() => status.innerText = '', 2000);
    } catch (e) { status.innerText = 'エラーが発生しました'; status.style.color = 'red'; }
}

function initAutocomplete() {
    const input = document.getElementById('input-location');
    if (window.google && window.google.maps && window.google.maps.places) autocomplete = new google.maps.places.Autocomplete(input, { types: ['geocode', 'establishment'] });
    else setTimeout(initAutocomplete, 500);
}

function initDateFields() {
    const now = new Date(); const tzOffset = now.getTimezoneOffset() * 60000; const localTime = new Date(Date.now() - tzOffset);
    document.getElementById('input-date').value = localTime.toISOString().slice(0, 10);
    document.getElementById('input-start-datetime').value = localTime.toISOString().slice(0, 16);
    document.getElementById('input-end-datetime').value = new Date(localTime.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
}

function toggleDateTime() {
    const isAllDay = document.getElementById('is-allday').checked;
    document.getElementById('date-inputs').style.display = isAllDay ? 'block' : 'none';
    document.getElementById('datetime-inputs').style.display = isAllDay ? 'none' : 'block';
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if(tab === 'create') { document.querySelectorAll('.tab-btn')[0].classList.add('active'); document.getElementById('tab-create').classList.add('active'); } 
    else { document.querySelectorAll('.tab-btn')[1].classList.add('active'); document.getElementById('tab-view').classList.add('active'); loadRecordsList(); }
}

// ▼ 画像以外のファイルも読み込む処理
async function processFiles(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    document.getElementById('status-msg').innerText = "ファイルを読み込み中...";
    
    for (let file of files) {
        try {
            let base64Data;
            if (file.type.startsWith('image/')) {
                // 画像の場合はキャンバスでリサイズ
                base64Data = await resizeImage(file, 1200, 1200);
            } else {
                // 動画や書類の場合（メモリ制限のため20MB以上は弾く）
                if (file.size > 20 * 1024 * 1024) {
                    alert(`「${file.name}」はサイズが大きすぎます（約20MB以下にしてください）`);
                    continue;
                }
                base64Data = await readFileAsDataURL(file);
            }
            selectedFilesData.push({ url: base64Data, name: file.name, type: file.type, isNew: true });
        } catch(e) { console.error(e); }
    }
    document.getElementById('status-msg').innerText = "";
    renderFilePreview();
    event.target.value = ""; 
}

// ファイルをそのままBase64に変換する関数
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width; let height = img.height;
                if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } } 
                else { if (height > maxHeight) { width = Math.round((height * maxHeight) / height); height = maxHeight; } }
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.85)); 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function renderFilePreview() {
    const preview = document.getElementById('selected-files-preview');
    preview.innerHTML = '';
    selectedFilesData.forEach((item, index) => {
        const container = document.createElement('div');
        container.style.position = 'relative';
        
        let content;
        if (item.type && item.type.startsWith('image/')) {
            content = document.createElement('img');
            content.src = item.url;
            content.style.width = '60px'; content.style.height = '60px';
            content.style.objectFit = 'cover'; content.style.borderRadius = '4px';
        } else {
            content = document.createElement('div');
            content.style.width = '60px'; content.style.height = '60px';
            content.style.backgroundColor = '#ddd'; content.style.borderRadius = '4px';
            content.style.display = 'flex'; content.style.alignItems = 'center'; content.style.justifyContent = 'center';
            content.style.fontSize = '10px'; content.style.textAlign = 'center'; content.style.padding = '2px'; content.style.boxSizing = 'border-box';
            // ファイル名が長い場合は省略
            content.innerText = item.name.length > 10 ? item.name.substring(0, 8) + '...' : item.name;
        }
        
        const delBtn = document.createElement('button');
        delBtn.innerText = '×';
        delBtn.style.position = 'absolute'; delBtn.style.top = '-5px'; delBtn.style.right = '-5px';
        delBtn.style.background = 'red'; delBtn.style.color = 'white'; delBtn.style.border = 'none';
        delBtn.style.borderRadius = '50%'; delBtn.style.cursor = 'pointer';
        delBtn.onclick = () => { selectedFilesData.splice(index, 1); renderFilePreview(); };
        
        container.appendChild(content);
        container.appendChild(delBtn);
        preview.appendChild(container);
    });
}

function stripHtmlTags(html) { if (!html) return ''; return html.replace(/<[^>]*>/g, '').trim(); }

function formatText(type) {
    const textarea = document.getElementById('input-text');
    const start = textarea.selectionStart; const end = textarea.selectionEnd; const selectedText = textarea.value.substring(start, end);
    let replacement = '';
    switch(type) {
        case 'b': replacement = `<b>${selectedText}</b>`; break;
        case 'i': replacement = `<i>${selectedText}</i>`; break;
        case 'u': replacement = `<u>${selectedText}</u>`; break;
        case 's': replacement = `<s>${selectedText}</s>`; break;
        case 'ul': replacement = `<ul>\n  <li>${selectedText || 'リスト項目'}</li>\n</ul>`; break;
        case 'ol': replacement = `<ol>\n  <li>${selectedText || 'リスト項目'}</li>\n</ol>`; break;
        case 'a':
            const url = prompt("リンク先のURLを入力してください:", "https://"); if (!url) return;
            const linkText = selectedText || prompt("リンクの表示テキストを入力してください:", "リンク");
            replacement = `<a href="${url}" target="_blank">${linkText}</a>`; break;
        case 'clear': replacement = stripHtmlTags(selectedText); break;
    }
    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    textarea.focus(); textarea.setSelectionRange(start + replacement.length, start + replacement.length);
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
        
        // 旧互換性のためフォルダ名は「photos」のまま利用します
        const filesFolderId = await getOrCreateFolder('photos', rootFolderId); 

        let { fileId: dbFileId, dbData } = await getDatabase(htmlFolderId);
        let records = [];
        if (Array.isArray(dbData)) records = dbData; else if (dbData && dbData.records) records = dbData.records;
        let existingRecord = editingRecordId ? records.find(r => r.id === editingRecordId) : null;

        status.innerText = "ファイルをアップロード中...";
        const uploadedFiles = [];
        for (let item of selectedFilesData) {
            if (item.isNew) {
                // 画像の場合は元のファイル名がないことがあるためデフォルト名を付与
                const filename = item.name || `${displayDate.slice(0,10)}_${title}_添付.jpg`;
                const fileType = item.type || 'image/jpeg';
                const fileId = await uploadFileToDrive(item.url, filename, fileType, filesFolderId);
                uploadedFiles.push({ id: fileId, name: filename, type: fileType });
            } else { 
                uploadedFiles.push({ id: item.id, name: item.name, type: item.type }); 
            }
        }

        status.innerText = "HTMLファイルを保存中...";
        const htmlFileId = await saveHtmlFile(htmlFolderId, existingRecord ? existingRecord.htmlFileId : null, title, displayDate, locationStr, text, uploadedFiles);

        const plainText = stripHtmlTags(text);
        const snippet = plainText.length > 100 ? plainText.substring(0, 100) + "..." : plainText;
        const descriptionStr = `${snippet}\n\n▼全文・画像・ファイルはこちら\n${CONFIG.VIEWER_API_URL}?id=${htmlFileId}`;
        
        const eventData = { summary: `[${category}] ${title}`, description: descriptionStr, start: startObj, end: endObj };
        if (locationStr) eventData.location = locationStr;
        if (selectedColorId) eventData.colorId = selectedColorId;

        let calendarEventId = existingRecord ? existingRecord.calendarEventId : null;
        if (calendarEventId) {
            status.innerText = "カレンダーの予定を更新中..."; await updateCalendarEvent(calendarEventId, eventData);
        } else {
            status.innerText = "カレンダーに予定を追加中..."; calendarEventId = await createCalendarEvent(eventData);
        }

        const recordData = {
            id: editingRecordId || 'rec_' + Date.now(),
            htmlFileId: htmlFileId, calendarEventId: calendarEventId, category: category,
            title, displayDate, isAllDay, 
            start: isAllDay ? document.getElementById('input-date').value : document.getElementById('input-start-datetime').value,
            end: isAllDay ? document.getElementById('input-date').value : document.getElementById('input-end-datetime').value,
            location: locationStr, colorId: selectedColorId, text, files: uploadedFiles
        };

        if (existingRecord) {
            const index = records.findIndex(r => r.id === editingRecordId);
            records[index] = recordData;
        } else { records.unshift(recordData); }

        const newData = { records: records, categories: globalCategories };
        await saveDatabase(htmlFolderId, dbFileId, newData);

        status.innerText = "保存が完了しました！"; status.style.color = "green";
        resetForm(); setTimeout(() => { status.innerText = ""; status.style.color = "#333"; }, 3000); switchTab('view');
    } catch (error) { console.error(error); status.innerText = "エラーが発生しました。"; status.style.color = "red"; }
}

async function loadRecordsList() {
    try {
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        const { dbData } = await getDatabase(htmlFolderId);
        let records = [];
        if (Array.isArray(dbData)) records = dbData; 
        else if (dbData) {
            records = dbData.records || [];
            if (dbData.categories && dbData.categories.length > 0) globalCategories = dbData.categories;
        }
        renderCategorySelect();
        
        const listDiv = document.getElementById('record-list'); listDiv.innerHTML = '';
        if(!records || records.length === 0) { listDiv.innerHTML = '<p style="color:#666;">記録がまだありません。</p>'; return; }
        records.forEach(record => {
            const item = document.createElement('div'); item.className = 'record-item';
            const displayCategory = record.category || '記録';
            item.innerHTML = `<div><strong>[${displayCategory}] ${record.title}</strong><div style="font-size: 12px; color: #666; margin-top: 2px;">${record.displayDate}</div></div><span style="font-size:12px; color:blue;">[編集]</span>`;
            item.onclick = () => loadRecordIntoForm(record);
            listDiv.appendChild(item);
        });
    } catch (error) { console.error(error); }
}

function loadRecordIntoForm(record) {
    editingRecordId = record.id;
    document.getElementById('input-category').value = record.category || '記録';
    onCategoryChange();
    if (record.colorId !== undefined) selectColorInMainPalette(record.colorId);

    document.getElementById('input-title').value = record.title;
    document.getElementById('input-text').value = record.text || '';
    document.getElementById('input-location').value = record.location || '';
    
    document.getElementById('is-allday').checked = record.isAllDay; toggleDateTime();
    if (record.isAllDay) document.getElementById('input-date').value = record.start;
    else { document.getElementById('input-start-datetime').value = record.start; document.getElementById('input-end-datetime').value = record.end; }

    // ▼ 古い形式（photos: [id1, id2]）と新しい形式（files: [{id, name, type}]）の両方を安全に読み込む処理
    let filesData = [];
    if (record.files) {
        filesData = record.files;
    } else if (record.photos) {
        filesData = record.photos.map(id => ({ id: id, name: '画像', type: 'image/jpeg' }));
    }

    selectedFilesData = filesData.map(f => {
        let fileUrl = `https://drive.google.com/thumbnail?id=${f.id}&sz=w200`;
        return { id: f.id, url: fileUrl, isNew: false, name: f.name || 'ファイル', type: f.type || 'application/octet-stream' };
    });
    renderFilePreview();

    document.getElementById('save-btn-text').innerText = "変更を保存する";
    document.getElementById('delete-btn').style.display = 'block';
    switchTab('create');
}

async function deleteCurrentRecord() {
    if (!editingRecordId) return;
    if (!confirm("この記録とGoogleカレンダーの予定を完全に削除しますか？")) return;
    const status = document.getElementById('status-msg'); status.innerText = "削除中...";
    try {
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        let { fileId: dbFileId, dbData } = await getDatabase(htmlFolderId);
        let records = [];
        if (Array.isArray(dbData)) records = dbData; else if (dbData && dbData.records) records = dbData.records;

        const record = records.find(r => r.id === editingRecordId);
        if (record) {
            if (record.htmlFileId) await deleteDriveFile(record.htmlFileId);
            if (record.calendarEventId) await deleteCalendarEvent(record.calendarEventId);
            records = records.filter(r => r.id !== editingRecordId);
            const newData = { records: records, categories: globalCategories };
            await saveDatabase(htmlFolderId, dbFileId, newData);
        }
        status.innerText = "削除しました"; status.style.color = "green";
        resetForm(); setTimeout(() => { status.innerText = ""; status.style.color = "#333"; }, 2000); switchTab('view');
    } catch (error) { console.error(error); status.innerText = "削除に失敗しました。"; status.style.color = "red"; }
}

function resetForm() {
    editingRecordId = null;
    document.getElementById('input-category').value = '記録'; onCategoryChange();
    document.getElementById('input-title').value = ''; document.getElementById('input-text').value = ''; document.getElementById('input-location').value = '';
    selectedFilesData = []; renderFilePreview();
    initDateFields(); document.getElementById('is-allday').checked = true; toggleDateTime();
    document.getElementById('save-btn-text').innerText = "保存 (Drive連携 & カレンダー登録)";
    document.getElementById('delete-btn').style.display = 'none';
}
