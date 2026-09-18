const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");


/* =========================
   Express
========================= */

const app = express();


/* =========================
   画像アップロード設定
========================= */

const upload = multer({
    storage: multer.memoryStorage()
});


/* =========================
   OpenAI
========================= */

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


/* =========================
   HTML・CSS・JSを表示
========================= */

app.use(express.static("."));


/* =========================
   AI分析
========================= */

app.post(
    "/analyze",
    upload.array("clothes"),
    async (req, res) => {

        try {

            const files = req.files;


            /* 写真がない場合 */

            if (!files || files.length === 0) {

                return res.status(400).json({
                    error: "画像がありません"
                });

            }


            /* AIに送る内容 */

            const content = [

                {
                    type: "input_text",

                    text: `
あなたはファッション分析AIです。

送られた服の画像を分析してください。

それぞれの服について、

・服の種類
・色
・柄
・シルエット
・季節
・ファッション系統

を判断してください。

画像から判断できない情報は、
無理に推測せず「不明」としてください。

日本語で分かりやすく回答してください。
                    `
                }

            ];


            /* =========================
               写真をAIに追加
            ========================= */

            for (const file of files) {

                const base64 =
                    file.buffer.toString("base64");


                content.push({

                    type: "input_image",

                    image_url:
                        `data:${file.mimetype};base64,${base64}`

                });

            }


            /* =========================
               OpenAIに送信
            ========================= */

            const response =
                await client.responses.create({

                    model: "gpt-4.1-mini",

                    input: [

                        {
                            role: "user",

                            content: content

                        }

                    ]

                });


            /* =========================
               結果を返す
            ========================= */

            res.json({

                result: response.output_text

            });


        } catch (error) {

            /* コンソールに本当のエラーを表示 */

            console.error(error);


            /* ブラウザにも本当のエラーを返す */

            res.status(500).json({

                error:
                    error.message ||
                    "AI分析中にエラーが発生しました"

            });

        }

    }
);


/* =========================
   サーバー起動
========================= */

app.listen(3000, () => {

    console.log("MY CLOSET AI");

    console.log(
        "http://localhost:3000"
    );

});