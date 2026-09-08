let tokenClient;
let accessToken = null;

function initAuth(onSuccess) {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('main-app').style.display = 'block';
                if (onSuccess) onSuccess();
            }
        },
    });
}

function handleAuthClick() {
    // ユーザーのクリック操作で実行されるため、ブロックされずにログイン画面が開きます
    tokenClient.requestAccessToken({ prompt: 'consent' });
}
