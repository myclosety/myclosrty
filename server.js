require("dotenv").config();
const dns = require("dns");

dns.setDefaultResultOrder(
    "ipv4first"
);

const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");

const {
    createClient
} = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY
);

const app = express();
app.get("/config.js", function (req, res) {
    res.type("application/javascript");

    res.send(`
        window.MY_CLOSETY_CONFIG = {
            supabaseUrl: ${JSON.stringify(process.env.SUPABASE_URL)},
            supabasePublishableKey: ${JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY)}
        };
    `);
});
async function requireAuth(
    req,
    res,
    next
) {
    try {
        const authHeader =
            req.headers.authorization || "";

        const token =
            authHeader.startsWith("Bearer ")
                ? authHeader.slice(7)
                : "";

        if (!token) {
            return res.status(401).json({
                error: "ログインが必要です。"
            });
        }

        const {
            data,
            error
        } =
            await supabase.auth.getUser(
                token
            );

        if (
            error ||
            !data.user
        ) {
            return res.status(401).json({
                error: "ログイン情報が無効です。"
            });
        }

        req.user =
            data.user;

        req.accessToken =
            token;

        next();

    } catch (error) {
        console.error(
            "Auth error:",
            error
        );

        res.status(401).json({
            error: "ログイン情報を確認できませんでした。"
        });
    }
}

const PORT = 3000;
const MAX_CLOTHES = 30;
const DAILY_OUTFIT_LIMIT = 1;

const IMAGE_DIR =
    path.join(
        __dirname,
        "clothes_images"
    );

const CLOTHES_FILE =
    path.join(
        __dirname,
        "clothes.json"
    );

const USAGE_FILE =
    path.join(
        __dirname,
        "usage.json"
    );

fs.mkdirSync(
    IMAGE_DIR,
    {
        recursive: true
    }
);

if (
    !fs.existsSync(
        CLOTHES_FILE
    )
) {
    fs.writeFileSync(
        CLOTHES_FILE,
        "[]",
        "utf8"
    );
}

const upload =
    multer({
        storage:
            multer.diskStorage({
                destination:
                    function (
                        req,
                        file,
                        cb
                    ) {
                        cb(
                            null,
                            IMAGE_DIR
                        );
                    },

                filename:
                    function (
                        req,
                        file,
                        cb
                    ) {
                        const ext =
                            path.extname(
                                file.originalname
                            ).toLowerCase() ||
                            ".jpg";

                        const filename =
                            Date.now() +
                            "-" +
                            Math.round(
                                Math.random() *
                                1000000000
                            ) +
                            ext;

                        cb(
                            null,
                            filename
                        );
                    }
            }),

        limits: {
            files: 20
        }
    });

const client =
    new OpenAI({
        apiKey:
            process.env.OPENAI_API_KEY
    });

app.use(
    express.static(
        __dirname
    )
);

app.use(
    "/clothes_images",
    express.static(
        IMAGE_DIR
    )
);

function parseAIJson(
    text
) {
    let cleaned =
        String(
            text
        ).trim();

    cleaned =
        cleaned
            .replace(
                /^```json\s*/i,
                ""
            )
            .replace(
                /^```\s*/i,
                ""
            )
            .replace(
                /\s*```$/i,
                ""
            )
            .trim();

    try {
        return JSON.parse(
            cleaned
        );

    } catch (error) {
        const objectStart =
            cleaned.indexOf(
                "{"
            );

        const objectEnd =
            cleaned.lastIndexOf(
                "}"
            );

        if (
            objectStart !== -1 &&
            objectEnd !== -1 &&
            objectEnd >
                objectStart
        ) {
            return JSON.parse(
                cleaned.slice(
                    objectStart,
                    objectEnd + 1
                )
            );
        }

        const arrayStart =
            cleaned.indexOf(
                "["
            );

        const arrayEnd =
            cleaned.lastIndexOf(
                "]"
            );

        if (
            arrayStart !== -1 &&
            arrayEnd !== -1 &&
            arrayEnd >
                arrayStart
        ) {
            return JSON.parse(
                cleaned.slice(
                    arrayStart,
                    arrayEnd + 1
                )
            );
        }

        throw error;
    }
}

function getTodayJST() {
    return new Intl.DateTimeFormat(
        "sv-SE",
        {
            timeZone:
                "Asia/Tokyo"
        }
    ).format(
        new Date()
    );
}

function getImagePath(
    item
) {
    if (
        item &&
        typeof item.image ===
            "string" &&
        item.image.length > 0
    ) {
        return item.image;
    }

    if (
        item &&
        Array.isArray(
            item.images
        ) &&
        item.images.length > 0
    ) {
        return item.images[0];
    }

    return null;
}

function formatAnalysis(
    analysis
) {
    if (
        typeof analysis ===
            "string"
    ) {
        return analysis;
    }

    if (
        analysis &&
        typeof analysis ===
            "object"
    ) {
        return `

種類: ${
            analysis.type ||
            "不明"
        }

色: ${
            analysis.color ||
            "不明"
        }

柄: ${
            analysis.pattern ||
            "不明"
        }

シルエット: ${
            analysis.silhouette ||
            "不明"
        }

季節: ${
            analysis.season ||
            "不明"
        }

系統: ${
            analysis.style ||
            "不明"
        }

`;
    }

    return "不明";
}

function buildAvailableClothes(
    clothes
) {
    const result = [];

    for (
        const item of clothes
    ) {
        if (
            item.image
        ) {
            result.push({
                id:
                    String(
                        item.id
                    ),

                imagePath:
                    item.image,

                analysis:
                    formatAnalysis(
                        item.analysis
                    )
            });

            continue;
        }

        if (
            Array.isArray(
                item.images
            )
        ) {
            for (
                let i = 0;
                i < item.images.length;
                i++
            ) {
                result.push({
                    id:
                        `${item.id}-${i + 1}`,

                    imagePath:
                        item.images[i],

                    analysis:
                        formatAnalysis(
                            item.analysis
                        )
                });
            }
        }
    }

    return result;
}

function getDisplayInfo(
    analysis
) {
    if (
        analysis &&
        typeof analysis ===
            "object"
    ) {
        return {
            type:
                analysis.type ||
                "不明",

            color:
                analysis.color ||
                ""
        };
    }

    if (
        typeof analysis ===
            "string"
    ) {
        const typeMatch =
            analysis.match(
                /種類\s*[:：]\s*(.+)/
            );

        const colorMatch =
            analysis.match(
                /色\s*[:：]\s*(.+)/
            );

        return {
            type:
                typeMatch
                    ? typeMatch[1].trim()
                    : "不明",

            color:
                colorMatch
                    ? colorMatch[1].trim()
                    : ""
        };
    }

    return {
        type: "不明",
        color: ""
    };
}

function deleteUploadedFiles(
    files
) {
    for (
        const file of files || []
    ) {
        try {
            if (
                fs.existsSync(
                    file.path
                )
            ) {
                fs.unlinkSync(
                    file.path
                );
            }

        } catch (error) {
            console.error(
                "Delete uploaded file error:",
                error
            );
        }
    }
}

function imageUrlToFilePath(
    imageUrl
) {
    if (
        typeof imageUrl !==
            "string" ||
        !imageUrl
    ) {
        return null;
    }

    const relativePath =
        imageUrl.replace(
            /^\/+/,
            ""
        );

    const fullPath =
        path.join(
            __dirname,
            relativePath
        );

    const basePath =
        path.resolve(
            __dirname
        );

    const resolvedPath =
        path.resolve(
            fullPath
        );

    if (
        !resolvedPath.startsWith(
            basePath
        )
    ) {
        return null;
    }

    return resolvedPath;
}

app.get(
    "/",
    function (
        req,
        res
    ) {
        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);

app.get(
    "/status",
    requireAuth,
    async function (
        req,
        res
    ) {
        try {
            const userSupabase =
                createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_PUBLISHABLE_KEY,
                    {
                        global: {
                            headers: {
                                Authorization:
                                    `Bearer ${req.accessToken}`
                            }
                        }
                    }
                );

            const {
                count: clothesCount,
                error: clothesError
            } =
                await userSupabase
                    .from("clothes")
                    .select(
                        "*",
                        {
                            count: "exact",
                            head: true
                        }
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    );

            if (
                clothesError
            ) {
                throw clothesError;
            }

            const today =
                getTodayJST();

            const {
                data: usageData,
                error: usageError
            } =
                await userSupabase
                    .from("outfit_usage")
                    .select("count")
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .eq(
                        "usage_date",
                        today
                    )
                    .maybeSingle();

            if (
                usageError
            ) {
                throw usageError;
            }

            const dailyUsed =
                usageData?.count || 0;

            res.json({
                clothesCount:
                    clothesCount || 0,

                clothesLimit:
                    MAX_CLOTHES,

                dailyUsed:
                    dailyUsed,

                dailyLimit:
                    DAILY_OUTFIT_LIMIT,

                dailyRemaining:
                    Math.max(
                        0,
                        DAILY_OUTFIT_LIMIT -
                        dailyUsed
                    )
            });

        } catch (error) {
            console.error(
                "Status error:",
                error
            );

            res.status(500).json({
                error:
                    "利用状況を取得できませんでした。"
            });
        }
    }
);
app.patch(
    "/clothes/:id",
    requireAuth,
    express.json(),
    async function (
        req,
        res
    ) {
        try {
            const targetId =
                decodeURIComponent(
                    req.params.id
                );

            const newType =
                String(
                    req.body.type || ""
                ).trim();

            if (!newType) {
                return res.status(400).json({
                    error:
                        "名前を入力してください。"
                });
            }

            if (newType.length > 50) {
                return res.status(400).json({
                    error:
                        "名前は50文字以内で入力してください。"
                });
            }

            const userSupabase =
                createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_PUBLISHABLE_KEY,
                    {
                        global: {
                            headers: {
                                Authorization:
                                    `Bearer ${req.accessToken}`
                            }
                        }
                    }
                );

            const {
                data,
                error
            } =
                await userSupabase
                    .from("clothes")
                    .update({
                        type: newType
                    })
                    .eq(
                        "id",
                        targetId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .select(
                        "id, type"
                    )
                    .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data) {
                return res.status(404).json({
                    error:
                        "変更する服が見つかりません。"
                });
            }

            res.json({
                success: true,
                id: String(data.id),
                type: data.type
            });

        } catch (error) {
            console.error(
                "Update clothes error:",
                error
            );

            res.status(500).json({
                error:
                    "服の名前を変更できませんでした。"
            });
        }
    }
);

app.delete(
    "/clothes/:id",
    requireAuth,
    async function (
        req,
        res
    ) {
        try {
            const targetId =
                decodeURIComponent(
                    req.params.id
                );

            const userSupabase =
                createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_PUBLISHABLE_KEY,
                    {
                        global: {
                            headers: {
                                Authorization:
                                    `Bearer ${req.accessToken}`
                            }
                        }
                    }
                );

            const {
                data: item,
                error: findError
            } =
                await userSupabase
                    .from("clothes")
                    .select(
                        "id, image_path"
                    )
                    .eq(
                        "id",
                        targetId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .maybeSingle();

            if (findError) {
                throw findError;
            }

            if (!item) {
                return res.status(404).json({
                    error:
                        "削除する服が見つかりません。"
                });
            }

            const {
                error: deleteError
            } =
                await userSupabase
                    .from("clothes")
                    .delete()
                    .eq(
                        "id",
                        targetId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    );

            if (deleteError) {
                throw deleteError;
            }

            if (item.image_path) {
                const {
                    error: storageError
                } =
                    await userSupabase
                        .storage
                        .from("clothes-images")
                        .remove([
                            item.image_path
                        ]);

                if (storageError) {
                    console.error(
                        "Storage delete error:",
                        storageError
                    );
                }
            }

            res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "Delete clothes error:",
                error
            );

            res.status(500).json({
                error:
                    "服を削除できませんでした。"
            });
        }
    }
);

console.log(
    "CLOTHES ROUTE REGISTERED"
);

app.get(
    "/clothes",
    requireAuth,
    async function (
        req,
        res
    ) {
        try {
            const userSupabase =
                createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_PUBLISHABLE_KEY,
                    {
                        global: {
                            headers: {
                                Authorization:
                                    `Bearer ${req.accessToken}`
                            }
                        }
                    }
                );

            const {
                data,
                error
            } =
                await userSupabase
                    .from("clothes")
                    .select("*")
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    );

            if (error) {
                throw error;
            }

            const clothes = [];

            for (
                const item of data || []
            ) {
                let imageUrl = "";

                if (item.image_path) {
                    const {
                        data: signedData,
                        error: signedError
                    } =
                        await userSupabase
                            .storage
                            .from(
                                "clothes-images"
                            )
                            .createSignedUrl(
                                item.image_path,
                                60 * 60
                            );

                    if (!signedError) {
                        imageUrl =
                            signedData
                                ?.signedUrl || "";
                    }
                }

                clothes.push({
                    id:
                        String(
                            item.id
                        ),

                    imagePath:
                        imageUrl,

                    type:
                        item.type ||
                        "不明",

                    color:
                        item.color ||
                        "",

                    pattern:
                        item.pattern ||
                        "",

                    silhouette:
                        item.silhouette ||
                        "",

                    season:
                        item.season ||
                        "",

                    style:
                        item.style ||
                        ""
                });
            }

            res.json({
                clothes:
                    clothes,

                count:
                    clothes.length,

                limit:
                    MAX_CLOTHES
            });

        } catch (error) {
            console.error(
                "Get clothes error:",
                error
            );

            res.status(500).json({
                error:
                    "クローゼットを取得できませんでした。"
            });
        }
    }
);
app.post(
    "/analyze",
    requireAuth,
    upload.array(
        "clothes"
    ),
    async function (
        req,
        res
    ) {
        const files =
            req.files || [];

        const uploadedStoragePaths =
            [];

        try {
            if (
                files.length === 0
            ) {
                return res.status(400).json({
                    error:
                        "画像がありません"
                });
            }

            const userSupabase =
                createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_PUBLISHABLE_KEY,
                    {
                        global: {
                            headers: {
                                Authorization:
                                    `Bearer ${req.accessToken}`
                            }
                        }
                    }
                );

            const {
                count: currentCount,
                error: countError
            } =
                await userSupabase
                    .from("clothes")
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    );

            if (countError) {
                throw countError;
            }

            const registeredCount =
                currentCount || 0;

            const newCount =
                files.length;

            if (
                registeredCount +
                newCount >
                MAX_CLOTHES
            ) {
                deleteUploadedFiles(
                    files
                );

                const remaining =
                    Math.max(
                        0,
                        MAX_CLOTHES -
                        registeredCount
                    );

                return res.status(400).json({
                    error:
                        `無料版では服を30着まで登録できます。現在${registeredCount}着登録されています。あと${remaining}着登録できます。`
                });
            }

            if (
                !process.env.OPENAI_API_KEY
            ) {
                deleteUploadedFiles(
                    files
                );

                return res.status(500).json({
                    error:
                        "AI設定を確認できませんでした。"
                });
            }

            const content =
                [
                    {
                        type:
                            "input_text",

                        text: `
あなたはファッション分析AIです。

送られた服の画像を1枚ずつ分析してください。

それぞれについて、

・服の種類
・色
・柄
・シルエット
・季節
・ファッション系統

を判断してください。

判断できない情報は「不明」としてください。

必ずJSON配列だけを返してください。

形式:

[
  {
    "index": 1,
    "type": "服の種類",
    "color": "色",
    "pattern": "柄",
    "silhouette": "シルエット",
    "season": "季節",
    "style": "系統"
  }
]

画像の枚数分を返してください。
`
                    }
                ];

            for (
                let i = 0;
                i < files.length;
                i++
            ) {
                const file =
                    files[i];

                const base64 =
                    fs.readFileSync(
                        file.path
                    ).toString(
                        "base64"
                    );

                content.push({
                    type:
                        "input_text",

                    text:
                        `画像番号: ${i + 1}`
                });

                content.push({
                    type:
                        "input_image",

                    image_url:
                        `data:${file.mimetype};base64,${base64}`
                });
            }

            const analysisResponse =
                await client.responses.create({
                    model:
                        "gpt-4.1-mini",

                    input:
                        [
                            {
                                role:
                                    "user",

                                content:
                                    content
                            }
                        ]
                });

            const analyses =
                parseAIJson(
                    analysisResponse.output_text
                );

            if (
                !Array.isArray(
                    analyses
                )
            ) {
                throw new Error(
                    "服の分析結果を正しく取得できませんでした。"
                );
            }

            const rows = [];

            for (
                let i = 0;
                i < files.length;
                i++
            ) {
                const file =
                    files[i];

                const aiData =
                    analyses.find(
                        item =>
                            Number(
                                item.index
                            ) ===
                            i + 1
                    ) || {};

                const extension =
                    path.extname(
                        file.originalname
                    ) ||
                    ".jpg";

                const storagePath =
                    `${req.user.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2)}${extension}`;

                const fileBuffer =
                    fs.readFileSync(
                        file.path
                    );

                const {
                    error: uploadError
                } =
                    await userSupabase
                        .storage
                        .from(
                            "clothes-images"
                        )
                        .upload(
                            storagePath,
                            fileBuffer,
                            {
                                contentType:
                                    file.mimetype,

                                upsert:
                                    false
                            }
                        );

                if (uploadError) {
                    throw uploadError;
                }

                uploadedStoragePaths.push(
                    storagePath
                );

                rows.push({
                    user_id:
                        req.user.id,

                    image_path:
                        storagePath,

                    type:
                        aiData.type ||
                        "不明",

                    color:
                        aiData.color ||
                        "不明",

                    pattern:
                        aiData.pattern ||
                        "不明",

                    silhouette:
                        aiData.silhouette ||
                        "不明",

                    season:
                        aiData.season ||
                        "不明",

                    style:
                        aiData.style ||
                        "不明"
                });
            }

            const {
                error: insertError
            } =
                await userSupabase
                    .from(
                        "clothes"
                    )
                    .insert(
                        rows
                    );

            if (insertError) {
                throw insertError;
            }

            deleteUploadedFiles(
                files
            );

            res.json({
                savedCount:
                    rows.length,

                message:
                    "服の登録が完了しました。"
            });

        } catch (error) {
            console.error(
                "Analyze error:",
                error
            );

            if (
                uploadedStoragePaths.length >
                0
            ) {
                try {
                    const cleanupSupabase =
                        createClient(
                            process.env.SUPABASE_URL,
                            process.env.SUPABASE_PUBLISHABLE_KEY,
                            {
                                global: {
                                    headers: {
                                        Authorization:
                                            `Bearer ${req.accessToken}`
                                    }
                                }
                            }
                        );

                    await cleanupSupabase
                        .storage
                        .from(
                            "clothes-images"
                        )
                        .remove(
                            uploadedStoragePaths
                        );

                } catch (
                    cleanupError
                ) {
                    console.error(
                        "Storage cleanup error:",
                        cleanupError
                    );
                }
            }

            deleteUploadedFiles(
                files
            );

            res.status(500).json({
                error:
                    error.message ||
                    "AI分析中にエラーが発生しました"
            });
        }
    }
);

app.post(
    "/outfit",
    requireAuth,
    upload.none(),
    async function (
        req,
        res
    ) {        try {
            const userSupabase =
                createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_PUBLISHABLE_KEY,
                    {
                        global: {
                            headers: {
                                Authorization:
                                    `Bearer ${req.accessToken}`
                            }
                        }
                    }
                );

            const today =
                getTodayJST();

            const {
                data: usageData,
                error: usageError
            } =
                await userSupabase
                    .from("outfit_usage")
                    .select("count")
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .eq(
                        "usage_date",
                        today
                    )
                    .maybeSingle();

            if (usageError) {
                throw usageError;
            }

            const currentCount =
                usageData?.count || 0;

            if (
                currentCount >=
                DAILY_OUTFIT_LIMIT
            ) {
                return res.status(429).json({
                    error:
                        "本日の無料版のAIコーデ提案は終了しました。明日また利用できます。"
                });
            }

            const {
                data: clothes,
                error: clothesError
            } =
                await userSupabase
                    .from("clothes")
                    .select(
                        "id, image_path, type, color, pattern, silhouette, season, style"
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    );

            if (clothesError) {
                throw clothesError;
            }

            if (
                !clothes ||
                clothes.length === 0
            ) {
                return res.status(400).json({
                    error:
                        "登録されている服がありません。"
                });
            }

            const availableClothes = [];

            for (
                const item of clothes
            ) {
                const {
                    data: signedData,
                    error: signedError
                } =
                    await userSupabase
                        .storage
                        .from(
                            "clothes-images"
                        )
                        .createSignedUrl(
                            item.image_path,
                            3600
                        );

                if (signedError) {
                    throw signedError;
                }

                availableClothes.push({
                    id:
                        String(
                            item.id
                        ),

                    imagePath:
                        signedData.signedUrl,

                    analysis:
                        formatAnalysis({
                            type:
                                item.type,

                            color:
                                item.color,

                            pattern:
                                item.pattern,

                            silhouette:
                                item.silhouette,

                            season:
                                item.season,

                            style:
                                item.style
                        })
                });
            }

            const clothingData =
                availableClothes
                    .map(
                        item => `
服ID: ${item.id}

${item.analysis}
`
                    )
                    .join("\n");

            const temperature =
                req.body.temperature || "";

            const purpose =
                req.body.purpose || "";

            const style =
                req.body.style || "";

            const outfitResponse =
                await client.responses.create({
                    model:
                        "gpt-4.1-mini",

                    input: `
あなたはプロのスタイリストです。

登録済みの服だけを使って、
コーディネートを1つ提案してください。

条件:

気温:
${temperature}℃

目的:
${purpose}

系統:
${style}

登録済みの服:

${clothingData}

ルール:

・登録済みの服だけを使う
・存在しない服を作らない
・トップスを1つ選ぶ
・ボトムスを1つ選ぶ
・靴を1つ選ぶ
・アクセサリーは登録されている場合だけ選ぶ
・同じ服を複数の役割に使わない
・服IDは登録済みの服IDをそのまま使用する

必ずJSONだけを返してください。

形式:

{
    "top": "服ID",
    "bottom": "服ID",
    "shoes": "服ID",
    "accessory": null,
    "explanation": "日本語でコーディネートの説明"
}

説明文には、

・選んだ服
・色合わせ
・季節感
・シルエット
・コーディネートのポイント

を含めてください。

説明文には服ID、数字のID、内部管理番号を絶対に書かないでください。
`
                });

            const outfit =
                parseAIJson(
                    outfitResponse.output_text
                );

            const selectedItems = [];

            function addItem(
                role,
                id
            ) {
                if (
                    id === null ||
                    id === undefined
                ) {
                    return;
                }

                const item =
                    availableClothes.find(
                        clothing =>
                            String(
                                clothing.id
                            ) ===
                            String(
                                id
                            )
                    );

                if (!item) {
                    return;
                }

                selectedItems.push({
                    role:
                        role,

                    imagePath:
                        item.imagePath
                });
            }

            addItem(
                "トップス",
                outfit.top
            );

            addItem(
                "ボトムス",
                outfit.bottom
            );

            addItem(
                "靴",
                outfit.shoes
            );

            addItem(
                "アクセサリー",
                outfit.accessory
            );

            const hasTop =
                selectedItems.some(
                    item =>
                        item.role ===
                        "トップス"
                );

            const hasBottom =
                selectedItems.some(
                    item =>
                        item.role ===
                        "ボトムス"
                );

            const hasShoes =
                selectedItems.some(
                    item =>
                        item.role ===
                        "靴"
                );

            if (
                !hasTop ||
                !hasBottom ||
                !hasShoes
            ) {
                throw new Error(
                    "AIがコーデに使用する服を正しく選択できませんでした。"
                );
            }

            const {
                error: saveUsageError
            } =
                await userSupabase
                    .from(
                        "outfit_usage"
                    )
                    .upsert(
                        {
                            user_id:
                                req.user.id,

                            usage_date:
                                today,

                            count:
                                currentCount + 1
                        },
                        {
                            onConflict:
                                "user_id,usage_date"
                        }
                    );

            if (saveUsageError) {
                throw saveUsageError;
            }

            res.json({
                selectedItems:
                    selectedItems,

                explanation:
                    outfit.explanation ||
                    "コーディネートを提案しました。"
            });

        } catch (error) {
            console.error(
                "Outfit error:",
                error
            );

            res.status(500).json({
                error:
                    error.message ||
                    "コーデ提案中にエラーが発生しました"
            });
        }
    }
);

app.listen(
    PORT,
    function () {
        console.log(
            "MY CLOSETY"
        );

        console.log(
            `http://localhost:${PORT}`
        );
    }
);
