const SUPABASE_URL =

    window.MY_CLOSETY_CONFIG.supabaseUrl;



const SUPABASE_PUBLISHABLE_KEY =

    window.MY_CLOSETY_CONFIG.supabasePublishableKey;



const supabaseClient =

    window.supabase.createClient(

        SUPABASE_URL,

        SUPABASE_PUBLISHABLE_KEY

    );

const authArea =

    document.getElementById("authArea");



const welcomeScreen =

    document.getElementById("welcomeScreen");



const loginScreen =

    document.getElementById("loginScreen");



const signupScreen =

    document.getElementById("signupScreen");



const appArea =

    document.getElementById("appArea");



const showLoginButton =

    document.getElementById("showLoginButton");



const showSignupButton =

    document.getElementById("showSignupButton");



const backFromLoginButton =

    document.getElementById("backFromLoginButton");



const backFromSignupButton =

    document.getElementById("backFromSignupButton");



const loginEmail =

    document.getElementById("loginEmail");



const loginPassword =

    document.getElementById("loginPassword");



const loginButton =

    document.getElementById("loginButton");



const loginMessage =

    document.getElementById("loginMessage");



const forgotPasswordButton =

    document.getElementById("forgotPasswordButton");



const signupEmail =

    document.getElementById("signupEmail");



const signupPassword =

    document.getElementById("signupPassword");



const signupPasswordConfirm =

    document.getElementById("signupPasswordConfirm");



const signupButton =

    document.getElementById("signupButton");



const signupMessage =

    document.getElementById("signupMessage");



const logoutButton =

    document.getElementById("logoutButton");



const userEmail =

    document.getElementById("userEmail");



const imageInput =

    document.getElementById("clothesImage");



const preview =

    document.getElementById("preview");





const saveClothesButton =

    document.getElementById("saveClothesButton");



    const analyzeButton =

    document.getElementById("analyzeButton");

const upgradeButton =

    document.getElementById("upgradeButton");

const result =

    document.getElementById("result");



const closetStatus =

    document.getElementById("closetStatus");



const closetList =

    document.getElementById("closetList");

async function getAuthHeaders() {

    const {

        data,

        error

    } =

        await supabaseClient.auth.getSession();



    if (error) {

        throw error;

    }



    const token =

        data.session?.access_token;



    if (!token) {

        throw new Error(

            "ログインが必要です。"

        );

    }



    return {

        Authorization:

            `Bearer ${token}`

    };

}



async function getJson(response) {

    const text =

        await response.text();



    if (!text) {

        throw new Error(

            `サーバーから空の返答がありました（HTTP ${response.status}）`

        );

    }



    try {

        return JSON.parse(

            text

        );



    } catch (error) {

        console.error(

            "Server response:",

            text

        );



        throw new Error(

            "サーバーから正しいデータを受け取れませんでした。"

        );

    }

}



function escapeHtml(text) {

    return String(text)

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;")

        .replace(/'/g, "&#039;");

}



async function loadStatus() {

    try {

        const authHeaders =

            await getAuthHeaders();



        const response =

            await fetch(

                "/status",

                {

                    cache:

                        "no-store",



                    headers:

                        authHeaders

                }

            );



        const data =

            await getJson(

                response

            );



        if (!response.ok) {

            throw new Error(

                data.error ||

                "利用状況を取得できませんでした。"

            );

        }



        closetStatus.textContent =

            `登録数: ${data.clothesCount} / ${data.clothesLimit}着　AIコーデ: ${data.dailyUsed} / ${data.dailyLimit}回`;



    } catch (error) {

        console.error(

            "Status error:",

            error

        );

    }

}



async function loadCloset() {

    try {

        const authHeaders =

            await getAuthHeaders();



        const response =

            await fetch(

                "/clothes",

                {

                    cache:

                        "no-store",



                    headers:

                        authHeaders

                }

            );



        const data =

            await getJson(

                response

            );



        if (!response.ok) {

            throw new Error(

                data.error ||

                "クローゼットを取得できませんでした。"

            );

        }



        const clothes =

            Array.isArray(

                data.clothes

            )

                ? data.clothes

                : [];



        renderCloset(

            clothes

        );



        await loadStatus();



    } catch (error) {

        console.error(

            "Closet error:",

            error

        );



        closetStatus.textContent =

            "クローゼットを取得できませんでした。";

    }

}

function renderCloset(items) {

    closetList.innerHTML = "";



    if (items.length === 0) {

        closetList.innerHTML = `

            <p class="empty">

                まだ服が登録されていません。

            </p>

        `;



        return;

    }



    const grid =

        document.createElement(

            "div"

        );



    grid.style.display =

        "grid";



    grid.style.gridTemplateColumns =

        "repeat(auto-fit, minmax(120px, 1fr))";



    grid.style.gap =

        "16px";



    for (const item of items) {

        const card =

            document.createElement(

                "div"

            );



        card.style.minWidth =

            "0";



        card.style.textAlign =

            "center";



        const image =

            document.createElement(

                "img"

            );



        image.src =

            item.imagePath;



        image.alt =

            item.type ||

            "登録した服";



        image.style.width =

            "100%";



        image.style.maxWidth =

            "160px";



        image.style.height =

            "180px";



        image.style.objectFit =

            "contain";



        image.style.borderRadius =

            "12px";



        image.style.display =

            "block";



        image.style.margin =

            "0 auto 8px";



        image.onerror =

            function () {

                image.style.display =

                    "none";

            };



        card.appendChild(

            image

        );



        const typeText =

            document.createElement(

                "p"

            );



        typeText.textContent =

            item.type ||

            "不明";



        typeText.style.margin =

            "4px 0";



        typeText.style.fontWeight =

            "bold";



        card.appendChild(

            typeText

        );



        if (item.color) {

            const colorText =

                document.createElement(

                    "p"

                );



            colorText.textContent =

                item.color;



            colorText.style.margin =

                "4px 0";



            card.appendChild(

                colorText

            );

        }



        const editButton =

            document.createElement(

                "button"

            );



        editButton.type =

            "button";



        editButton.textContent =

            "編集";



        editButton.style.marginTop =

            "8px";



        editButton.style.marginRight =

            "6px";



        editButton.style.padding =

            "6px 12px";



        editButton.addEventListener(

            "click",

            function () {

                const input =

                    document.createElement(

                        "input"

                    );



                input.type =

                    "text";



                input.value =

                    item.type === "不明"

                        ? ""

                        : item.type || "";



                input.placeholder =

                    "服の名前";



                input.maxLength =

                    50;



                input.style.width =

                    "100%";



                input.style.boxSizing =

                    "border-box";



                input.style.margin =

                    "4px 0 8px";



                input.style.padding =

                    "6px";



                const saveButton =

                    document.createElement(

                        "button"

                    );



                saveButton.type =

                    "button";



                saveButton.textContent =

                    "保存";



                saveButton.style.marginTop =

                    "8px";



                saveButton.style.marginRight =

                    "6px";



                saveButton.style.padding =

                    "6px 12px";



                typeText.replaceWith(

                    input

                );



                editButton.replaceWith(

                    saveButton

                );



                input.focus();



                saveButton.addEventListener(

                    "click",

                    async function () {

                        const newType =

                            input.value.trim();



                        if (!newType) {

                            window.alert(

                                "名前を入力してください。"

                            );



                            return;

                        }



                        try {

                            saveButton.disabled =

                                true;



                            saveButton.textContent =

                                "保存中...";



                            const authHeaders =

                                await getAuthHeaders();



                            const response =

                                await fetch(

                                    `/clothes/${encodeURIComponent(item.id)}`,

                                    {

                                        method:

                                            "PATCH",



                                        headers: {

                                            ...authHeaders,



                                            "Content-Type":

                                                "application/json"

                                        },



                                        body:

                                            JSON.stringify({

                                                type:

                                                    newType

                                            })

                                    }

                                );



                            const data =

                                await getJson(

                                    response

                                );



                            if (!response.ok) {

                                throw new Error(

                                    data.error ||

                                    "名前を変更できませんでした。"

                                );

                            }



                            await loadCloset();



                        } catch (error) {

                            console.error(

                                "Update error:",

                                error

                            );



                            window.alert(

                                error.message

                            );



                            saveButton.disabled =

                                false;



                            saveButton.textContent =

                                "保存";

                        }

                    }

                );

            }

        );



        card.appendChild(

            editButton

        );



        const deleteButton =

            document.createElement(

                "button"

            );



        deleteButton.type =

            "button";



        deleteButton.textContent =

            "削除";



        deleteButton.style.marginTop =

            "8px";



        deleteButton.style.padding =

            "6px 12px";



        deleteButton.addEventListener(

            "click",

            async function () {

                await deleteClothes(

                    item.id

                );

            }

        );



        card.appendChild(

            deleteButton

        );



        grid.appendChild(

            card

        );

    }



    closetList.appendChild(

        grid

    );

}



async function deleteClothes(id) {

    const confirmed =

        window.confirm(

            "この服を削除しますか？"

        );



    if (!confirmed) {

        return;

    }



    try {

        const authHeaders =

            await getAuthHeaders();



        const response =

            await fetch(

                `/clothes/${encodeURIComponent(id)}`,

                {

                    method:

                        "DELETE",



                    headers:

                        authHeaders

                }

            );



        const data =

            await getJson(

                response

            );



        if (!response.ok) {

            throw new Error(

                data.error ||

                "服を削除できませんでした。"

            );

        }



        await loadCloset();



    } catch (error) {

        console.error(

            "Delete error:",

            error

        );



        result.innerHTML = `

            <div class="analysis">

                <h3>

                    エラー

                </h3>



                <p>

                    ${escapeHtml(

                        error.message

                    )}

                </p>

            </div>

        `;

    }

}

imageInput.addEventListener(

    "change",

    function () {

        preview.innerHTML = "";



        const files =

            imageInput.files;



        if (

            files.length === 0

        ) {

            return;

        }



        for (const file of files) {

            const imageURL =

                URL.createObjectURL(

                    file

                );



            const item =

                document.createElement(

                    "div"

                );



            item.className =

                "preview-item";



            const img =

                document.createElement(

                    "img"

                );



            img.src =

                imageURL;



            img.alt =

                "登録する服";



            item.appendChild(

                img

            );



            preview.appendChild(

                item

            );

        }

    }

);

saveClothesButton.addEventListener(

    "click",

    async function () {

        const files =

            imageInput.files;



        if (files.length === 0) {

            window.alert(

                "保存する服を選択してください。"

            );

            return;

        }



        saveClothesButton.disabled =

            true;



        saveClothesButton.textContent =

            "保存中...";



        try {

            const formData =

                new FormData();



            for (const file of files) {

                formData.append(

                    "clothes",

                    file

                );

            }



            const authHeaders =

                await getAuthHeaders();



            const response =

                await fetch(

                    "/analyze",

                    {

                        method:

                            "POST",



                        headers:

                            authHeaders,



                        body:

                            formData

                    }

                );



            const data =

                await getJson(

                    response

                );



            if (!response.ok) {

                throw new Error(

                    data.error ||

                    "服を保存できませんでした。"

                );

            }



            imageInput.value = "";

            preview.innerHTML = "";



            await loadCloset();



            window.alert(

                "服を保存しました。"

            );



        } catch (error) {

            console.error(

                "Save error:",

                error

            );



            window.alert(

                error.message

            );



        } finally {

            saveClothesButton.disabled =

                false;



            saveClothesButton.textContent =

                "選択した服を保存";

        }

    }

);

analyzeButton.addEventListener(

    "click",

    async function () {

        const files =

            imageInput.files;



        const temperature =

            document.getElementById(

                "temperature"

            ).value;



        const purpose =

            document.getElementById(

                "purpose"

            ).value;



        const style =

            document.getElementById(

                "style"

            ).value;



        if (files.length > 10) {
            alert("一度に登録できる画像は10枚までです。");
            return;
        }
        for (const file of files) {
            if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                alert("JPEG・PNG・WebP形式で、1枚5MB以下の画像を選んでください。");
                return;
            }
        }

        analyzeButton.disabled =

            true;



        analyzeButton.textContent =

            "処理中...";



        result.innerHTML = `

            <p class="empty">

                AIがコーデを考えています...

            </p>

        `;



        try {



                const formData =

                    new FormData();



                for (

                    const file of files

                ) {

                    formData.append(

                        "clothes",

                        file

                    );

                }







            const outfitFormData =

                new FormData();



            outfitFormData.append(

                "temperature",

                temperature

            );



            outfitFormData.append(

                "purpose",

                purpose

            );



            outfitFormData.append(

                "style",

                style

            );



            const authHeaders =

                await getAuthHeaders();



            const outfitResponse =

                await fetch(

                    "/outfit",

                    {

                        method:

                            "POST",



                        headers:

                            authHeaders,



                        body:

                            outfitFormData

                    }

                );



            const data =

                await getJson(

                    outfitResponse

                );



            if (

                !outfitResponse.ok

            ) {

                throw new Error(

                    data.error ||

                    "コーデ提案に失敗しました。"

                );

            }



            const explanation =

                data.explanation || "";



            if (!explanation) {

                throw new Error(

                    "AIからコーデ提案が返ってきませんでした。"

                );

            }



            let imagesHTML = "";



            if (

                Array.isArray(

                    data.selectedItems

                ) &&

                data.selectedItems.length > 0

            ) {

                imagesHTML = `

                    <div

                        class="outfit-images"

                        style="

                            display:grid;

                            grid-template-columns:repeat(

                                auto-fit,

                                minmax(120px, 1fr)

                            );

                            gap:16px;

                            margin:20px 0;

                        "

                    >

                        ${

                            data.selectedItems

                                .map(

                                    item => `

                                    <div

                                        class="outfit-item"

                                        style="

                                            text-align:center;

                                            min-width:0;

                                        "

                                    >

                                        <img

                                            src="${escapeHtml(

                                                item.imagePath

                                            )}"

                                            alt="選択された服"

                                            style="

                                                width:100%;

                                                max-width:160px;

                                                height:190px;

                                                object-fit:contain;

                                                border-radius:12px;

                                                display:block;

                                                margin:0 auto;

                                            "

                                        >

                                    </div>

                                `

                                )

                                .join("")

                        }

                    </div>

                `;

            }



            const cleanExplanation =

                String(

                    explanation

                )

                    .replace(

                        /服ID\s*[:：]?\s*[\d-]+/gi,

                        ""

                    )

                    .replace(

                        /服\s*ID\s*[:：]?\s*[\d-]+/gi,

                        ""

                    )

                    .replace(

                        /\(\s*\)/g,

                        ""

                    )

                    .replace(

                        /（\s*）/g,

                        ""

                    )

                    .replace(

                        /\s{2,}/g,

                        " "

                    )

                    .trim();



            const safeExplanation =

                escapeHtml(

                    cleanExplanation

                )

                    .replace(

                        /\n/g,

                        "<br>"

                    );



            result.innerHTML = `

                <div class="analysis">

                    <h3>

                        AIコーデ提案

                    </h3>



                    ${imagesHTML}



                    <div

                        style="

                            margin-top:20px;

                        "

                    >

                        <h4

                            style="

                                margin-bottom:10px;

                            "

                        >

                            説明

                        </h4>



                        <p>

                            ${safeExplanation}

                        </p>

                    </div>

                </div>

            `;



            await loadStatus();



        } catch (error) {

            console.error(

                "Error:",

                error

            );



            result.innerHTML = `

                <div class="analysis">

                    <h3>

                        エラー

                    </h3>



                    <p>

                        ${escapeHtml(

                            error.message

                        )}

                    </p>

                </div>

            `;



        } finally {

            analyzeButton.disabled =

                false;



            analyzeButton.textContent =

                "AIコーデを提案してもらう";

        }

    }

);

function showWelcomeScreen() {

    welcomeScreen.hidden = false;

    loginScreen.hidden = true;

    signupScreen.hidden = true;



    loginMessage.textContent = "";

    signupMessage.textContent = "";

}



function showLoginScreen() {

    welcomeScreen.hidden = true;

    loginScreen.hidden = false;

    signupScreen.hidden = true;



    loginMessage.textContent = "";

}



function showSignupScreen() {

    welcomeScreen.hidden = true;

    loginScreen.hidden = true;

    signupScreen.hidden = false;



    signupMessage.textContent = "";

}



async function updateAuthScreen(session) {

    if (

        session &&

        session.user

    ) {

        authArea.hidden = true;

        appArea.hidden = false;



        userEmail.textContent =

            session.user.email || "";



        await loadCloset();



    } else {

        authArea.hidden = false;

        appArea.hidden = true;



        userEmail.textContent = "";

        closetList.innerHTML = "";



        showWelcomeScreen();

    }

}



showLoginButton.addEventListener(

    "click",

    function () {

        showLoginScreen();

    }

);



showSignupButton.addEventListener(

    "click",

    function () {

        showSignupScreen();

    }

);



backFromLoginButton.addEventListener(

    "click",

    function () {

        showWelcomeScreen();

    }

);



backFromSignupButton.addEventListener(

    "click",

    function () {

        showWelcomeScreen();

    }

);



signupButton.addEventListener(

    "click",

    async function () {

        const email =

            signupEmail.value.trim();



        const password =

            signupPassword.value;



        const passwordConfirm =

            signupPasswordConfirm.value;



        signupMessage.textContent = "";



        if (

            !email ||

            !password ||

            !passwordConfirm

        ) {

            signupMessage.textContent =

                "すべての項目を入力してください。";



            return;

        }



        if (

            password !==

            passwordConfirm

        ) {

            signupMessage.textContent =

                "パスワードが一致していません。";



            return;

        }



        if (

            password.length < 6

        ) {

            signupMessage.textContent =

                "パスワードは6文字以上で入力してください。";



            return;

        }



        signupButton.disabled =

            true;



        signupButton.textContent =

            "登録しています...";



        try {

            const {

                data,

                error

            } =

                await supabaseClient.auth.signUp({

                    email:

                        email,



                    password:

                        password,



                    options: {

                        emailRedirectTo:

                            window.location.origin

                    }

                });



            if (error) {

                throw error;

            }



            signupPassword.value = "";

            signupPasswordConfirm.value = "";



            if (data.session) {

                signupMessage.textContent =

                    "アカウントを作成しました。";

            } else {

                signupMessage.textContent =

                    "確認メールを送信しました。メール内のリンクを開いてください。";

            }



        } catch (error) {

            console.error(

                "Signup error:",

                error

            );



            signupMessage.textContent =

                error.message ||

                "新規登録に失敗しました。";



        } finally {

            signupButton.disabled =

                false;



            signupButton.textContent =

                "新規登録";

        }

    }

);



loginButton.addEventListener(

    "click",

    async function () {

        const email =

            loginEmail.value.trim();



        const password =

            loginPassword.value;



        loginMessage.textContent = "";



        if (

            !email ||

            !password

        ) {

            loginMessage.textContent =

                "メールアドレスとパスワードを入力してください。";



            return;

        }



        loginButton.disabled =

            true;



        loginButton.textContent =

            "ログインしています...";



        try {

            const {

                error

            } =

                await supabaseClient.auth.signInWithPassword({

                    email:

                        email,



                    password:

                        password

                });



            if (error) {

                throw error;

            }



            loginPassword.value = "";

            loginMessage.textContent = "";



        } catch (error) {

            console.error(

                "Login error:",

                error

            );



            loginMessage.textContent =

                error.message ||

                "ログインに失敗しました。";



        } finally {

            loginButton.disabled =

                false;



            loginButton.textContent =

                "ログイン";

        }

    }

);



forgotPasswordButton.addEventListener(

    "click",

    async function () {

        const email =

            loginEmail.value.trim();



        loginMessage.textContent = "";



        if (!email) {

            loginMessage.textContent =

                "メールアドレスを入力してから押してください。";



            return;

        }



        forgotPasswordButton.disabled =

            true;



        try {

            const {

                error

            } =

                await supabaseClient.auth.resetPasswordForEmail(

                    email,

                    {

                        redirectTo:

                            window.location.origin

                    }

                );



            if (error) {

                throw error;

            }



            loginMessage.textContent =

                "パスワード再設定用のメールを送信しました。";



        } catch (error) {

            console.error(

                "Password reset error:",

                error

            );



            loginMessage.textContent =

                error.message ||

                "メールを送信できませんでした。";



        } finally {

            forgotPasswordButton.disabled =

                false;

        }

    }

);



logoutButton.addEventListener(

    "click",

    async function () {

        try {

            const {

                error

            } =

                await supabaseClient.auth.signOut();



            if (error) {

                throw error;

            }



        } catch (error) {

            console.error(

                "Logout error:",

                error

            );



            window.alert(

                "ログアウトに失敗しました。"

            );

        }

    }

);



supabaseClient.auth.onAuthStateChange(

    function (

        event,

        session

    ) {

        setTimeout(

            function () {

                updateAuthScreen(

                    session

                );

            },

            0

        );

    }

);



async function initializeAuth() {

    try {

        const {

            data,

            error

        } =

            await supabaseClient.auth.getSession();



        if (error) {

            throw error;

        }



        await updateAuthScreen(

            data.session

        );



    } catch (error) {

        console.error(

            "Auth initialization error:",

            error

        );



        authArea.hidden = false;

        appArea.hidden = true;



        showWelcomeScreen();

    }

}



initializeAuth();

upgradeButton?.addEventListener("click", async function () {

    try {

        upgradeButton.disabled = true;



        const {

            data: { session }

        } = await supabaseClient.auth.getSession();



        if (!session) {

            alert("ログインしてください。");

            return;

        }



        const response = await fetch(

            "/create-checkout-session",

            {

                method: "POST",

                headers: {

                    Authorization: `Bearer ${session.access_token}`

                }

            }

        );



        const data = await response.json();



        if (!response.ok || !data.url) {

            throw new Error(

                data.error || "決済画面を開けませんでした。"

            );

        }



        window.location.href = data.url;



    } catch (error) {

        alert(error.message);

    } finally {

        upgradeButton.disabled = false;

    }

});

// アカウント設定・プレミアム画面の切り替え
const premiumButton = document.getElementById("premiumButton");
const premiumButtonWelcome = document.getElementById("premiumButtonWelcome");
const premiumBackButton = document.getElementById("premiumBackButton");
const premiumScreen = document.getElementById("premiumScreen");
const settingsScreen = document.getElementById("settingsScreen");
const settingsButton = document.getElementById("settingsButton");
const settingsBackButton = document.getElementById("settingsBackButton");
const currentPlan = document.getElementById("currentPlan");
const manageBillingButton = document.getElementById("manageBillingButton");
const billingHelp = document.getElementById("billingHelp");
const billingCustomerLabel = document.getElementById("billingCustomerLabel");
const billingCustomerSelect = document.getElementById("billingCustomerSelect");
const settingsMessage = document.getElementById("settingsMessage");
let premiumReturnTo = "app";

function showPremiumScreen(origin) {
    premiumReturnTo = origin;
    authArea.hidden = true;
    appArea.hidden = true;
    settingsScreen.hidden = true;
    premiumScreen.hidden = false;
}
premiumButton?.addEventListener("click", () => showPremiumScreen("app"));
premiumButtonWelcome?.addEventListener("click", () => showPremiumScreen("welcome"));
premiumBackButton?.addEventListener("click", () => {
    premiumScreen.hidden = true;
    if (premiumReturnTo === "welcome") {
        authArea.hidden = false;
    } else {
        appArea.hidden = false;
    }
});

settingsButton?.addEventListener("click", async () => {
    appArea.hidden = true;
    settingsScreen.hidden = false;
    settingsMessage.textContent = "";
    currentPlan.textContent = "確認中...";
    manageBillingButton.hidden = true;
    billingHelp.hidden = true;
    billingCustomerLabel.hidden = true;
    billingCustomerSelect.hidden = true;
    billingCustomerSelect.replaceChildren();
    try {
        const headers = await getAuthHeaders();
        const response = await fetch("/account-plan", {headers});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "プランを確認できませんでした。");
        const paid = data.plan === "paid";
        currentPlan.textContent = paid ? "プレミアム" : "無料";
        manageBillingButton.hidden = !paid;
        billingHelp.hidden = !paid;
        if (paid) {
            const optionsResponse = await fetch("/billing-customer-options", {headers});
            const optionsData = await optionsResponse.json();
            if (!optionsResponse.ok) throw new Error(optionsData.error || "契約情報を取得できませんでした。");
            if (optionsData.count > 1) {
                billingCustomerLabel.hidden = false;
                billingCustomerSelect.hidden = false;
                for (let i = 0; i < optionsData.count; i++) {
                    const option = document.createElement("option");
                    option.value = String(i);
                    option.textContent = `契約アカウント ${i + 1}`;
                    billingCustomerSelect.appendChild(option);
                }
                settingsMessage.textContent = "複数の契約アカウントがあります。管理する契約を選択してください。";
            }
        }
    } catch (error) {
        currentPlan.textContent = "取得できませんでした";
        settingsMessage.textContent = error.message;
    }
});
settingsBackButton?.addEventListener("click", () => {
    settingsScreen.hidden = true;
    appArea.hidden = false;
});
manageBillingButton?.addEventListener("click", async () => {
    manageBillingButton.disabled = true;
    settingsMessage.textContent = "";
    try {
        const headers = await getAuthHeaders();
        const response = await fetch("/create-billing-portal-session", {
            method: "POST",
            headers: {...headers, "Content-Type": "application/json"},
            body: JSON.stringify({customerIndex: Number(billingCustomerSelect.value || 0)})
        });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || "管理画面を開けませんでした。");
        window.location.assign(data.url);
    } catch (error) {
        settingsMessage.textContent = error.message;
    } finally {
        manageBillingButton.disabled = false;
    }
});