const imageInput = document.getElementById("clothesImage");
const preview = document.getElementById("preview");
const analyzeButton = document.getElementById("analyzeButton");
const result = document.getElementById("result");


/* =========================
   写真を選択
========================= */

imageInput.addEventListener("change", function () {

    preview.innerHTML = "";

    const files = imageInput.files;

    if (files.length === 0) {
        return;
    }

    for (const file of files) {

        const imageURL = URL.createObjectURL(file);

        const item = document.createElement("div");
        item.className = "preview-item";

        const img = document.createElement("img");
        img.src = imageURL;

        item.appendChild(img);
        preview.appendChild(item);
    }

});


/* =========================
   AI分析
========================= */

analyzeButton.addEventListener("click", async function () {

    const files = imageInput.files;

    /* 写真がない場合 */

    if (files.length === 0) {

        result.innerHTML = `
            <p class="empty">
                まず服の写真を登録してください。
            </p>
        `;

        return;
    }


    /* 分析中 */

    result.innerHTML = `
        <p class="empty">
            🤖 AIが${files.length}着の服を分析しています...
        </p>
    `;


    /* FormData */

    const formData = new FormData();

    for (const file of files) {
        formData.append("clothes", file);
    }


    try {

        /* サーバーへ送信 */

        const response = await fetch("/analyze", {
            method: "POST",
            body: formData
        });


        /*
         * いきなり response.json() を使わず、
         * まず文字として受け取る
         */

        const text = await response.text();

        console.log("サーバーからの返答:", text);
        console.log("ステータス:", response.status);


        /* 返答が空の場合 */

        if (!text) {

            throw new Error(
                `サーバーから空の返答がありました（HTTP ${response.status}）`
            );

        }


        /* JSONに変換 */

        let data;

        try {

            data = JSON.parse(text);

        } catch (jsonError) {

            console.error(
                "JSON変換エラー:",
                jsonError
            );

            console.error(
                "サーバーから返ってきた内容:",
                text
            );

            throw new Error(
                "サーバーから正しいJSONが返ってきませんでした。"
            );

        }


        /* サーバー側エラー */

        if (!response.ok) {

            throw new Error(
                data.error ||
                `AI分析に失敗しました（HTTP ${response.status}）`
            );

        }


        /* AI結果がない場合 */

        if (!data.result) {

            throw new Error(
                "AIから分析結果が返ってきませんでした。"
            );

        }


        /* AI結果を表示 */

        result.innerHTML = `
            <div class="analysis">

                <h3>🤖 AI分析結果</h3>

                <p>
                    ${data.result.replace(/\n/g, "<br>")}
                </p>

            </div>
        `;


    } catch (error) {

        console.error("エラー:", error);

        result.innerHTML = `
            <div class="analysis">

                <h3>❌ エラー</h3>

                <p>
                    ${error.message}
                </p>

            </div>
        `;

    }

});