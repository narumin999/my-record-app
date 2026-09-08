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

    // 自動サイレントログイン試行
    try {
        tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
        console.log("自動ログインスキップ", e);
    }
}

function handleAuthClick() {
    tokenClient.requestAccessToken({ prompt: 'consent' });
}
