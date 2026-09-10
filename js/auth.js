let tokenClient;
let accessToken = null;
let isAppInitialized = false;

function initAuth(onSuccess) {
    // 1. ブラウザに保存されている前回のログイン情報（トークンと有効期限）を取得
    const storedToken = localStorage.getItem('my_record_app_token');
    const expiresAt = localStorage.getItem('my_record_app_expires_at');

    // 2. トークンが有効期限内（約1時間以内）なら、完全にゼロクリックで自動ログイン
    if (storedToken && expiresAt && Date.now() < parseInt(expiresAt) - 60000) {
        accessToken = storedToken;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        isAppInitialized = true;
        if (onSuccess) onSuccess();
    }

    // 3. トークンクライアントの初期化
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                
                // 新しいトークンと有効期限(通常3600秒後)をブラウザに保存
                const expiryTime = Date.now() + (tokenResponse.expires_in * 1000);
                localStorage.setItem('my_record_app_token', accessToken);
                localStorage.setItem('my_record_app_expires_at', expiryTime.toString());

                // 次回のアカウント選択をスキップするために、メールアドレスを取得して保存
                try {
                    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    const userInfo = await userInfoRes.json();
                    if (userInfo.email) {
                        localStorage.setItem('my_record_app_email', userInfo.email);
                    }
                } catch (e) {
                    console.log("ユーザー情報の取得に失敗", e);
                }

                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('main-app').style.display = 'block';
                
                if (!isAppInitialized) {
                    isAppInitialized = true;
                    if (onSuccess) onSuccess();
                }
            }
        },
    });
}

function handleAuthClick() {
    const savedEmail = localStorage.getItem('my_record_app_email');
    if (savedEmail) {
        // 保存されたメールアドレスがあれば、アカウント選択画面をスキップして即ログイン
        tokenClient.requestAccessToken({ prompt: '', login_hint: savedEmail });
    } else {
        // 初回利用時のみ、通常通りアカウント選択画面を表示
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}
