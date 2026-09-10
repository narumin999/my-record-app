// フォルダの自動作成・取得
async function getOrCreateFolder(folderName, parentId = null) {
    let q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    } else {
        const metadata = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) metadata.parents = [parentId];

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        const createData = await createRes.json();
        return createData.id;
    }
}

// データベース(records.json)の読み書き
async function getDatabase(htmlFolderId) {
    const q = `name='records.json' and '${htmlFolderId}' in parents and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json();
    
    if (data.files && data.files.length > 0) {
        const fileId = data.files[0].id;
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const records = await fileRes.json();
        return { fileId, records };
    } else {
        return { fileId: null, records: [] };
    }
}

async function saveDatabase(htmlFolderId, existingFileId, records) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    
    const metadata = { name: 'records.json', mimeType: 'application/json' };
    if (!existingFileId) metadata.parents = [htmlFolderId];

    const multipartRequestBody =
        delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
        delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(records, null, 2) + close_delim;

    const url = existingFileId 
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    
    const method = existingFileId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
    });
    const data = await res.json();
    return data.id;
}

// 画像アップロード
async function uploadImageToDrive(base64Data, filename, folderId) {
    const metadata = { name: filename, mimeType: 'image/jpeg', parents: [folderId] };
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    const base64 = base64Data.split(',')[1];
    
    const multipartRequestBody =
        delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
        delimiter + 'Content-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\n\r\n' + base64 + close_delim;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
    });
    const data = await res.json();
    return data.id; 
}

// HTMLファイル作成・更新
async function saveHtmlFile(htmlFolderId, existingFileId, title, displayDate, locationStr, text, uploadedImgIds) {
    // 場所の文字列がある場合、Googleマップの検索URLを作成してリンク化する
    let locationHtml = '';
    if (locationStr) {
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationStr)}`;
        locationHtml = `<p style="color:#666;">場所: <a href="${mapUrl}" target="_blank" style="color:#4285f4; text-decoration:underline;">${locationStr}</a></p>`;
    }

    let htmlContent = `<!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
    <body style="font-family:sans-serif; padding:16px; max-width:800px; margin:0 auto;">
        <h2>${title}</h2>
        <p style="color:#666;">日時: ${displayDate}</p>
        ${locationHtml}
        <div style="line-height:1.6; margin-top:16px;">${text}</div>
    `;
    if (uploadedImgIds.length > 0) {
        htmlContent += `\n    <hr>\n    <p>添付画像:</p>\n    <div style="display:flex; flex-wrap:wrap; gap:10px;">`;
        uploadedImgIds.forEach(id => {
            htmlContent += `
        <a href="https://drive.google.com/file/d/${id}/view" target="_blank">
            <img src="https://drive.google.com/thumbnail?id=${id}&sz=w800" alt="写真" style="max-height:200px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
        </a>`;
        });
        htmlContent += `\n    </div>`;
    }
    htmlContent += `\n</body>\n</html>`;

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    
    const metadata = { name: `${title}_${displayDate.slice(0,10)}.html`, mimeType: 'text/html' };
    if (!existingFileId) metadata.parents = [htmlFolderId];

    const multipartRequestBody =
        delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
        delimiter + 'Content-Type: text/html\r\n\r\n' + htmlContent + close_delim;

    const url = existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`;
    
    const method = existingFileId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
    });
    const data = await res.json();
    return data.id;
}

// ドライブファイル削除
async function deleteDriveFile(fileId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
}
