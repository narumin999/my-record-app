let selectedPhotosData = []; 
let autocomplete = null;
let selectedColorId = "";
let editingRecordId = null; 

window.onload = function () {
    // Google Maps APIを安全に動的読み込み
    const mapScript = document.createElement('script');
    mapScript.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.MAP_API_KEY}&libraries=places&language=ja`;
    mapScript.async = true;
    mapScript.defer = true;
    mapScript.onload = () => {
        initAutocomplete();
    };
    document.head.appendChild(mapScript);

    initDateFields();
    initColorPalette();

    // 認証の初期化
    initAuth(() => {
        loadRecordsList();
    });
};

function initColorPalette() {
    const chips = document.querySelectorAll('.color-chip');
    chips.forEach(chip => {
        chip.onclick = () => {
            chips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedColorId = chip.getAttribute('data-value');
        };
    });
}

function initAutocomplete() {
    const input = document.getElementById('input-location');
    if (window.google && window.google.maps && window.google.maps.places) {
        autocomplete = new google.maps.places.Autocomplete(input, { types: ['geocode', 'establishment'] });
    } else {
        setTimeout(initAutocomplete, 500);
    }
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
        } catch(e) { console.error("写真読み込み失敗", e); }
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
        img.style.width = '60px';
        img.style.height = '60px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';
        
        const delBtn = document.createElement('button');
        delBtn.innerText = '×';
        delBtn.style.position = 'absolute';
        delBtn.style.top = '-5px';
        delBtn.style.right = '-5px';
        delBtn.style.background = 'red';
        delBtn.style.color = 'white';
        delBtn.style.border = 'none';
        delBtn.style.borderRadius = '50%';
        delBtn.style.cursor = 'pointer';
        delBtn.onclick = () => {
            selectedPhotosData.splice(index, 1);
            renderPreview();
        };
        
        container.appendChild(img);
        container.appendChild(delBtn);
        preview.appendChild(container);
    });
}

async function saveRecord() {
    const title = document.getElementById('input-title').value;
    const text = document.getElementById('input-text').value;
    if(!title) { alert("タイトルは必須です！"); return; }

    const isAllDay = document.getElementById('is-allday').checked;
    let startObj, endObj, displayDate;
    if (isAllDay) {
        const d = document.getElementById('input-date').value;
        if(!d) { alert("日付を選択してください"); return; }
        startObj = { date: d };
        endObj = { date: d };
        displayDate = d;
    } else {
        const sDt = document.getElementById('input-start-datetime').value;
        const eDt = document.getElementById('input-end-datetime').value;
        if(!sDt || !eDt) { alert("開始と終了の日時を選択してください"); return; }
        startObj = { dateTime: sDt + ":00+09:00" };
        endObj = { dateTime: eDt + ":00+09:00" };
        displayDate = sDt.replace('T', ' ');
    }

    const locationStr = document.getElementById('input-location').value;
    const status = document.getElementById('status-msg');
    
    try {
        status.innerText = "保存先フォルダを準備中...";
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        const photosFolderId = await getOrCreateFolder('photos', rootFolderId);

        let { fileId: dbFileId, records } = await getDatabase(htmlFolderId);
        
        let existingRecord = null;
        if (editingRecordId) {
            existingRecord = records.find(r => r.id === editingRecordId);
        }

        status.innerText = "写真をアップロード中...";
        const uploadedImgIds = [];
        for (let item of selectedPhotosData) {
            if (item.isNew) {
                const imgId = await uploadImageToDrive(item.url, `${displayDate.slice(0,10)}_${title}.jpg`, photosFolderId);
                uploadedImgIds.push(imgId);
            } else {
                uploadedImgIds.push(item.id);
            }
        }

        status.innerText = "HTMLファイルを保存中...";
        const htmlFileId = await saveHtmlFile(
            htmlFolderId, 
            existingRecord ? existingRecord.htmlFileId : null, 
            title, displayDate, locationStr, text, uploadedImgIds
        );

        const snippet = text.length > 100 ? text.substring(0, 100) + "..." : text;
        const descriptionStr = `${snippet}\n\n▼全文・画像はこちら\n${CONFIG.VIEWER_API_URL}?id=${htmlFileId}`;
        const eventData = { summary: `[記録] ${title}`, description: descriptionStr, start: startObj, end: endObj };
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
            title, displayDate, isAllDay, 
            start: isAllDay ? document.getElementById('input-date').value : document.getElementById('input-start-datetime').value,
            end: isAllDay ? document.getElementById('input-date').value : document.getElementById('input-end-datetime').value,
            location: locationStr,
            colorId: selectedColorId,
            text,
            photos: uploadedImgIds
        };

        if (existingRecord) {
            const index = records.findIndex(r => r.id === editingRecordId);
            records[index] = recordData;
        } else {
            records.unshift(recordData);
        }

        await saveDatabase(htmlFolderId, dbFileId, records);

        status.innerText = "保存が完了しました！";
        status.style.color = "green";
        
        resetForm();
        setTimeout(() => { status.innerText = ""; status.style.color = "#333"; }, 3000);
        switchTab('view');

    } catch (error) {
        console.error(error);
        status.innerText = "エラーが発生しました。";
        status.style.color = "red";
    }
}

async function loadRecordsList() {
    try {
        const rootFolderId = await getOrCreateFolder('MyRecordApp');
        const htmlFolderId = await getOrCreateFolder('html', rootFolderId);
        const { records } = await getDatabase(htmlFolderId);
        
        const listDiv = document.getElementById('record-list');
        listDiv.innerHTML = '';
        
        if(!records || records.length === 0) {
            listDiv.innerHTML = '<p style="color:#666;">記録がまだありません。</p>';
            return;
        }

        records.forEach(record => {
            const item = document.createElement('div');
            item.className = 'record-item';
            item.innerHTML = `
                <div>
                    <strong>${record.title}</strong>
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

    selectedColorId = record.colorId || "";
    document.querySelectorAll('.color-chip').forEach(c => {
        c.classList.remove('selected');
        if (c.getAttribute('data-value') === selectedColorId) {
            c.classList.add('selected');
        }
    });

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
        let { fileId: dbFileId, records } = await getDatabase(htmlFolderId);

        const record = records.find(r => r.id === editingRecordId);
        if (record) {
            if (record.htmlFileId) await deleteDriveFile(record.htmlFileId);
            if (record.calendarEventId) await deleteCalendarEvent(record.calendarEventId);
            
            records = records.filter(r => r.id !== editingRecordId);
            await saveDatabase(htmlFolderId, dbFileId, records);
        }

        status.innerText = "削除しました";
        status.style.color = "green";
        resetForm();
        setTimeout(() => { status.innerText = ""; status.style.color = "#333"; }, 2000);
        switchTab('view');

    } catch (error) {
        console.error(error);
        status.innerText = "削除に失敗しました。";
        status.style.color = "red";
    }
}

function resetForm() {
    editingRecordId = null;
    document.getElementById('input-title').value = '';
    document.getElementById('input-text').value = '';
    document.getElementById('input-location').value = '';
    selectedPhotosData = [];
    renderPreview();
    initDateFields();
    document.getElementById('is-allday').checked = true;
    toggleDateTime();
    
    document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
    document.querySelector('.color-chip[data-value=""]').classList.add('selected');
    selectedColorId = "";

    document.getElementById('save-btn-text').innerText = "保存 (Drive連携 & カレンダー登録)";
    document.getElementById('delete-btn').style.display = 'none';
}
