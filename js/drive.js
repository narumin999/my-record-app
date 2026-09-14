// ... (getOrCreateFolder, getDatabase, saveDatabase は変更なし) ...
async function getOrCreateFolder(folderName, parentId = null) {
    let q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
    const metadata = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) metadata.parents = [parentId];
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
    const createData = await createRes.json();
    return createData.id;
}

async function getDatabase(htmlFolderId) {
    const q = `name='records.json' and '${htmlFolderId}' in parents and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id)`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.files && data.files.length > 0) {
        const fileId = data.files[0].id;
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        const dbData = await fileRes.json();
        return { fileId, dbData };
    } else { return { fileId: null, dbData: null }; }
}

async function saveDatabase(htmlFolderId, existingFileId, dbData) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    const metadata = { name: 'records.json', mimeType: 'application/json' };
    if (!existingFileId) metadata.parents = [htmlFolderId];
    const multipartRequestBody = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) + delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(dbData, null, 2) + close_delim;
    const url = existingFileId ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    const res = await fetch(url, { method: existingFileId ? 'PATCH' : 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipartRequestBody });
    const data = await res.json();
    return data.id;
}

// ▼ どんなファイルでもアップロードできる関数に改修
async function uploadFileToDrive(base64Data, filename, mimeType, folderId) {
    const safeMimeType = mimeType || 'application/octet-stream';
    const metadata = { name: filename, mimeType: safeMimeType, parents: [folderId] };
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    const base64 = base64Data.split(',')[1];
    
    const multipartRequestBody =
        delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
        delimiter + 'Content-Type: ' + safeMimeType + '\r\nContent-Transfer-Encoding: base64\r\n\r\n' + base64 + close_delim;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
    });
    const data = await res.json();
    return data.id; 
}

// ▼ HTMLファイル作成時、画像・動画・書類それぞれの見せ方を変える処理
async function saveHtmlFile(htmlFolderId, existingFileId, title, displayDate, locationStr, text, uploadedFiles) {
    let locationHtml = '';
    if (locationStr) {
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationStr)}`;
        locationHtml = `<p style="color:#666;">場所: <a href="${mapUrl}" target="_blank" style="color:#4285f4; text-decoration:underline;">${locationStr}</a></p>`;
    }
    
    let htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head><body style="font-family:sans-serif; padding:16px; max-width:800px; margin:0 auto;"><h2>${title}</h2><p style="color:#666;">日時: ${displayDate}</p>${locationHtml}<div style="line-height:1.6; margin-top:16px;">${text}</div>`;
    
    if (uploadedFiles && uploadedFiles.length > 0) {
        htmlContent += `\n<hr style="margin:20px 0;">\n<p>添付ファイル:</p>\n<div style="display:flex; flex-wrap:wrap; gap:10px;">`;
        uploadedFiles.forEach(f => {
            const fileUrl = `https://drive.google.com/file/d/${f.id}/view`;
            // 画像の場合はサムネイルを表示
            if (f.type && f.type.startsWith('image/')) {
                htmlContent += `\n<a href="${fileUrl}" target="_blank">\n<img src="https://drive.google.com/thumbnail?id=${f.id}&sz=w800" alt="${f.name}" style="max-height:200px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">\n</a>`;
            } 
            // 動画の場合
            else if (f.type && f.type.startsWith('video/')) {
                htmlContent += `\n<a href="${fileUrl}" target="_blank" style="display:inline-block; padding:10px 16px; background:#eee; border-radius:8px; text-decoration:none; color:#333; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🎬 動画: ${f.name}</a>`;
            } 
            // その他のドキュメント(PDF, Excel, Word等)の場合
            else {
                htmlContent += `\n<a href="${fileUrl}" target="_blank" style="display:inline-block; padding:10px 16px; background:#eee; border-radius:8px; text-decoration:none; color:#333; box-shadow:0 2px 4px rgba(0,0,0,0.2);">📎 ${f.name}</a>`;
            }
        });
        htmlContent += `\n</div>`;
    }
    htmlContent += `\n</body>\n</html>`;

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    const metadata = { name: `${title}_${displayDate.slice(0,10)}.html`, mimeType: 'text/html' };
    if (!existingFileId) metadata.parents = [htmlFolderId];
    
    const multipartRequestBody = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) + delimiter + 'Content-Type: text/html\r\n\r\n' + htmlContent + close_delim;
    const url = existingFileId ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`;
    
    const res = await fetch(url, { method: existingFileId ? 'PATCH' : 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipartRequestBody });
    const data = await res.json();
    return data.id;
}

async function deleteDriveFile(fileId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } });
}
