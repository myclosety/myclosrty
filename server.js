require("dotenv").config();

const dns = require("dns");



dns.setDefaultResultOrder(

    "ipv4first"

);



const fs = require("fs");

const path = require("path");

const express = require("express");

const multer = require("multer");

const sharp = require("sharp");

const OpenAI = require("openai");

const Stripe = require("stripe");

const stripe = new Stripe(

    process.env.STRIPE_SECRET_KEY

);



const {

    createClient

} = require("@supabase/supabase-js");



const supabase = createClient(

    process.env.SUPABASE_URL,

    process.env.SUPABASE_PUBLISHABLE_KEY

);



// Stripe Webhook専用のSupabase管理者接続

const supabaseAdmin = createClient(

    process.env.SUPABASE_URL,

    process.env.SUPABASE_SECRET_KEY,

    {

        auth: {

            autoRefreshToken: false,

            persistSession: false

        }

    }

);



const app = express();

// Stripe Webhook

app.post(

    "/stripe-webhook",

    express.raw({ type: "application/json" }),

    async function (req, res) {

        let event;



        try {

            event = stripe.webhooks.constructEvent(

                req.body,

                req.headers["stripe-signature"],

                process.env.STRIPE_WEBHOOK_SECRET

            );

        } catch (error) {

            console.error("Stripe署名検証エラー:", error.message);

            return res.status(400).send("Webhook署名検証に失敗しました");

        }



        try {

            console.log("Stripeイベント受信:", event.type);



            let subscriptionId = null;

            let userId = null;



            if (event.type === "checkout.session.completed") {

                const session = event.data.object;



                if (

                    session.mode === "subscription" &&

                    session.client_reference_id &&

                    session.subscription

                ) {

                    subscriptionId = session.subscription;

                    userId = session.client_reference_id;

                }

            } else if (

                event.type === "customer.subscription.updated" ||

                event.type === "customer.subscription.deleted"

            ) {

                const subscription = event.data.object;

                subscriptionId = subscription.id;

                userId = subscription.metadata?.supabase_user_id;

            }



            if (subscriptionId && userId) {

                // 通知された契約が対象ユーザーのものか確認

                let subscription = null;



                try {

                    subscription = await stripe.subscriptions.retrieve(

                        subscriptionId

                    );

                } catch (error) {

                    // 削除済み契約など取得できない場合は、

                    // 通知内の情報を使って確認

                    if (event.type === "customer.subscription.deleted") {

                        subscription = event.data.object;

                    } else {

                        throw error;

                    }

                }



                if (subscription.metadata?.supabase_user_id !== userId) {

                    throw new Error("Stripe契約のユーザーIDが一致しません");

                }



                const correctPrice = subscription.items.data.some(

                    item => item.price.id === process.env.STRIPE_PRICE_ID

                );



                if (correctPrice) {

                    // 複数のStripe顧客に分かれた契約も含めて確認
                    const allSubscriptions = await findMyClosetySubscriptions(userId);
                    const hasActiveSubscription = allSubscriptions.some(item =>
                        item.status === "active" || item.status === "trialing"
                    );

                    const newPlan = hasActiveSubscription ? "paid" : "free";



                    const { data, error } = await supabaseAdmin

                        .from("profiles")

                        .update({ plan: newPlan })

                        .eq("id", userId)

                        .select("id, plan");



                    if (error) throw error;



                    if (!data || data.length !== 1) {

                        throw new Error(

                            "Supabaseの更新対象ユーザーが見つかりません"

                        );

                    }



                    console.log("契約状態に応じたプラン更新:", {

                        plan: newPlan,

                        activeSubscriptionExists: hasActiveSubscription

                    });

                }

            }



            return res.status(200).json({ received: true });

        } catch (error) {

            console.error("Webhook処理エラー:", error);

            return res.status(500).json({

                error: "Webhook処理に失敗しました"

            });

        }

    }

);

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

const FREE_MAX_CLOTHES = 30;

const PAID_MAX_CLOTHES = 120;



const FREE_DAILY_OUTFIT_LIMIT = 1;

const PAID_DAILY_OUTFIT_LIMIT = 5;



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











const upload =
    multer({
        storage: multer.memoryStorage(),

        limits: {
            files: 10,
            fileSize: 5 * 1024 * 1024,
            fields: 20,
            fieldSize: 16 * 1024
        },

        fileFilter: (req, file, cb) => {
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
                return cb(new Error("JPEG・PNG・WebP形式のみ登録できます。"));
            }
            cb(null, true);
        }
    });



const client =

    new OpenAI({

        apiKey:

            process.env.OPENAI_API_KEY

    });



// 公開する静的ファイルを明示的に限定。server.js / .env / バックアップ等は公開しない。
const publicFiles = new Set(["/index.html", "/style.css", "/script.js", "/closet-bg.jpg"]);
app.use((req, res, next) => {
    const requested = req.path;
    if (!publicFiles.has(requested)) return next();
    res.sendFile(path.join(__dirname, requested.slice(1)));
});



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



function deleteUploadedFiles(files) {
    // メモリ保存方式では一時ファイルの削除は不要
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

            /^\/*/,

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

                data: profileData,

                error: profileError

            } =

                await userSupabase

                    .from("profiles")

                    .select("plan")

                    .eq(

                        "id",

                        req.user.id

                    )

                    .single();



            if (profileError) {

                throw profileError;

            }



            const plan =

                profileData?.plan || "free";



            const clothesLimit =

                plan === "paid"

                    ? PAID_MAX_CLOTHES

                    : FREE_MAX_CLOTHES;



            const dailyLimit =

                plan === "paid"

                    ? PAID_DAILY_OUTFIT_LIMIT

                    : FREE_DAILY_OUTFIT_LIMIT;

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

    clothesLimit,



                dailyUsed:

                    dailyUsed,



                dailyLimit:

    dailyLimit,



                dailyRemaining:

                    Math.max(

                        0,

                        dailyLimit -

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

    FREE_MAX_CLOTHES

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


// コスト保護（単一Node.jsプロセス向け）。複数インスタンスでは共有DB/Redisで管理すること。
const activeOutfitRequests = new Set();
const requestWindows = new Map();
function limitCostlyRequests(maxPerHour) {
    return (req, res, next) => {
        const now = Date.now();
        const key = `${req.user.id}:${req.path}`;
        const previous = requestWindows.get(key) || [];
        const recent = previous.filter(t => now - t < 60 * 60 * 1000);
        if (recent.length >= maxPerHour) {
            requestWindows.set(key, recent);
            return res.status(429).json({error: '短時間の利用回数が上限に達しました。時間をおいてお試しください。'});
        }
        recent.push(now);
        requestWindows.set(key, recent);
        if (requestWindows.size > 10000) {
            for (const [k, timestamps] of requestWindows) {
                if (!timestamps.some(t => now - t < 60 * 60 * 1000)) requestWindows.delete(k);
            }
        }
        next();
    };
}
function singleOutfitRequest(req, res, next) {
    const id = req.user.id;
    if (activeOutfitRequests.has(id)) {
        return res.status(429).json({error: 'AIコーデ提案を処理中です。完了後に再度お試しください。'});
    }
    activeOutfitRequests.add(id);
    let released = false;
    const release = () => {
        if (!released) { released = true; activeOutfitRequests.delete(id); }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
}

app.post(
    "/analyze",
    requireAuth,
    limitCostlyRequests(30),
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

                data: profileData,

                error: profileError

            } =

                await userSupabase

                    .from("profiles")

                    .select("plan")

                    .eq(

                        "id",

                        req.user.id

                    )

                    .single();



            if (profileError) {

                throw profileError;

            }



            const plan =

                profileData?.plan || "free";



            const clothesLimit =

                plan === "paid"

                    ? PAID_MAX_CLOTHES

                    : FREE_MAX_CLOTHES;

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

                clothesLimit -

registeredCount

            ) {

                deleteUploadedFiles(

                    files

                );



                const remaining =

                    Math.max(

                        0,

                        clothesLimit -

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



                const base64 = file.buffer.toString("base64");



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



            console.log("服分析 API usage:", analysisResponse.usage);

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

                    ".jpg";



                const storagePath =

                    `${req.user.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2)}${extension}`;



                const fileBuffer =

    await sharp(file.buffer)

        .rotate()

        .resize({

            width: 1024,

            height: 1024,

            fit: "inside",

            withoutEnlargement: true

        })

        .jpeg({

            quality: 80,

            mozjpeg: true

        })

        .toBuffer();



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
                                    "image/jpeg",



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
    limitCostlyRequests(12),
    singleOutfitRequest,
    upload.none(),

    async function (

        req,

        res

    ) {
        let usageReserved = false;
        let userSupabase;
        try {

            userSupabase =

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

                data: profileData,

                error: profileError

            } =

                await userSupabase

                    .from("profiles")

                    .select("plan")

                    .eq(

                        "id",

                        req.user.id

                    )

                    .single();



            if (profileError) {

                throw profileError;

            }



            const plan =

                profileData?.plan || "free";



            const dailyLimit =

                plan === "paid"

                    ? PAID_DAILY_OUTFIT_LIMIT

                    : FREE_DAILY_OUTFIT_LIMIT;

                const today =

                getTodayJST();



            // 利用枠はAI実行直前にDBで原子的に確保する。
            // 以前の「読み取り→後からupsert」は並列リクエストで上限を超える。

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



            const {data: reservation, error: reserveError} = await userSupabase.rpc(
                "reserve_outfit_usage"
            );
            if (reserveError) throw reserveError;
            if (!reservation?.allowed) {
                return res.status(429).json({
                    error: "本日のAIコーデ提案回数の上限に達しました。明日また利用できます。"
                });
            }
            usageReserved = true;

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



            console.log("AIコーデ API usage:", outfitResponse.usage);

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



            res.json({

                selectedItems:

                    selectedItems,



                explanation:

                    outfit.explanation ||

                    "コーディネートを提案しました。"

            });



        } catch (error) {
            if (usageReserved && userSupabase) {
                const {error: refundError} = await userSupabase.rpc("refund_outfit_usage");
                if (refundError) console.error("AI利用枠の返却に失敗:", refundError);
            }

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



// Stripe契約とログイン中のSupabaseユーザーの対応を確認する。
// 既存のテスト契約にも対応するため、サブスクリプションのmetadataを利用。
async function findMyClosetySubscriptions(userId) {
    const result = [];
    for await (const sub of stripe.subscriptions.list({status: "all", limit: 100})) {
        if (sub.metadata?.supabase_user_id !== userId) continue;
        if (!sub.items.data.some(item => item.price.id === process.env.STRIPE_PRICE_ID)) continue;
        result.push(sub);
    }
    return result;
}

app.get("/account-plan", requireAuth, async (req, res) => {
    try {
        const subscriptions = await findMyClosetySubscriptions(req.user.id);

        const hasActiveSubscription = subscriptions.some(
            sub => ["active", "trialing"].includes(sub.status)
        );

        const plan = hasActiveSubscription ? "paid" : "free";

        const {data, error} = await supabaseAdmin
            .from("profiles")
            .update({plan})
            .eq("id", req.user.id)
            .select("id, plan");

        if (error) throw error;

        if (!data || data.length !== 1) {
            throw new Error("Supabaseの更新対象が見つかりません");
        }

        console.log("プラン同期診断:", {
            activeSubscriptions: subscriptions.filter(
                sub => ["active", "trialing"].includes(sub.status)
            ).length,
            stripePlan: plan,
            savedPlan: data[0].plan
        });

        res.json({plan: data[0].plan});

    } catch (error) {
        console.error("Plan sync error:", error);
        res.status(503).json({
            error: "契約状況を確認できませんでした。時間をおいて再度お試しください。"
        });
    }
});

app.get("/billing-customer-options", requireAuth, async (req, res) => {
    try {
        const subscriptions = await findMyClosetySubscriptions(req.user.id);
        const customers = [...new Set(subscriptions
            .filter(s => ["active", "trialing", "past_due", "unpaid"].includes(s.status))
            .map(s => s.customer))];
        res.json({count: customers.length});
    } catch (error) {
        console.error("Billing options error:", error);
        res.status(500).json({error: "契約情報を取得できませんでした。"});
    }
});

app.post("/create-billing-portal-session", express.json(), requireAuth, async (req, res) => {
    try {
        const subscriptions = await findMyClosetySubscriptions(req.user.id);
        const relevant = subscriptions.filter(s => ["active", "trialing", "past_due"].includes(s.status));
        if (!relevant.length) return res.status(404).json({error: "管理対象の契約が見つかりません。"});
        const customers = [...new Set(relevant.map(s => s.customer))];
        const index = req.body?.customerIndex ?? 0;
        if (!Number.isInteger(index) || index < 0 || index >= customers.length) {
            return res.status(400).json({error: "管理対象の契約を選択してください。"});
        }
        const customer = customers[index];
        const stripeCustomer = await stripe.customers.retrieve(customer);
        if (stripeCustomer.deleted) throw new Error("Stripe customer deleted");
        const returnUrl = process.env.APP_URL || "http://localhost:3000";
        const portal = await stripe.billingPortal.sessions.create({
            customer,
            return_url: returnUrl
        });
        res.json({url: portal.url});
    } catch (error) {
        console.error("Billing portal error:", error);
        res.status(500).json({error: "お支払い管理画面を開けませんでした。Stripeでカスタマーポータルが有効か確認してください。"});
    }
});

app.post(

    "/create-checkout-session",

    requireAuth,

    async function (req, res) {

        try {
            const existing = await findMyClosetySubscriptions(req.user.id);
            if (existing.some(s => ["active", "trialing", "past_due", "unpaid"].includes(s.status))) {
                return res.status(409).json({
                    error: "すでに契約があります。アカウント設定からお支払いを管理してください。"
                });
            }

            const session =

                await stripe.checkout.sessions.create({

                    mode: "subscription",



                    line_items: [

                        {

                            price: process.env.STRIPE_PRICE_ID,

                            quantity: 1

                        }

                    ],



                    client_reference_id: req.user.id,

                    subscription_data: {

    metadata: {

        supabase_user_id: req.user.id

    }

},



                    success_url:

                        `${process.env.APP_URL || "http://localhost:3000"}/?payment=success`,



                    cancel_url:

                        `${process.env.APP_URL || "http://localhost:3000"}/?payment=cancel`

                });



            res.json({

                url: session.url

            });



        } catch (error) {

            console.error("Stripe checkout error:", error);



            res.status(500).json({

                error: "決済画面を開けませんでした。"

            });

        }

    }

);



if (require.main === module) {
    app.listen(PORT, () => {
        console.log("CLOSETi");
        console.log(`http://localhost:${PORT}`);
    });
}

module.exports = app;