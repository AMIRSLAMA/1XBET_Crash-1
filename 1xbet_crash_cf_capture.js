const puppeteer = require("puppeteer-extra");
const launch = require("./launch");
const fs = require("fs");
const { format, subHours } = require("date-fns");

const GAME_URL = "https://eg1xbet.com/ar/games/crash";
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const seenCrashRounds = new Set();

function parseWebSocketPayload(raw) {
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);

    // SignalR separates multiple protocol messages in one WebSocket frame with 0x1e.
    return text
        .split("\x1e")
        .map((part) => part.trim())
        .filter(Boolean)
        .flatMap((part) => {
            try {
                const parsed = JSON.parse(part);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                return [];
            }
        });
}

function describeShape(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return `array[${value.length}]`;
    if (typeof value === "object") {
        return `object{${Object.keys(value).sort().join(",")}}`;
    }
    return typeof value;
}

function logEventShape(payload) {
    // Record event names and field names only; do not persist account/session values.
    const record = {
        receivedAt: new Date().toISOString(),
        type: payload.type ?? null,
        target: payload.target ?? null,
        argumentShapes: Array.isArray(payload.arguments)
            ? payload.arguments.map(describeShape)
            : [],
    };

    fs.appendFile("websocket-events.jsonl", JSON.stringify(record) + "\n", (err) => {
        if (err) console.error("Could not write websocket-events.jsonl:", err.message);
    });
}

// Read the public game totals from the game iframe.
async function scrapeDivData(page) {
    await page.waitForSelector("iframe.games-project-frame__item", { timeout: 60000 });

    const frame = page.frames().find((item) =>
        item.url().includes("/games-frame/games/371")
    );

    if (!frame) {
        return { totalPlayers: "N/A", totalBets: "N/A", totalPrize: "N/A" };
    }

    await frame.waitForSelector(".crash-total__value--players", { timeout: 10000 });

    return frame.evaluate(() => {
        function safeGetText(selector) {
            const element = document.querySelector(selector);
            return element ? element.innerText.trim() : "N/A";
        }

        return {
            totalPlayers: safeGetText(".crash-total__value--players"),
            totalBets: safeGetText(".crash-total__value--bets"),
            totalPrize: safeGetText(".crash-total__value--prize"),
        };
    });
}

async function getWsEndpoint() {
    console.log("Launching browser...");
    const wsEndpoint = await launch();
    console.log("WebSocket endpoint obtained:", wsEndpoint);
    return wsEndpoint;
}

(async () => {
    console.log("Starting script...");

    const browserWSEndpoint = await getWsEndpoint();
    console.log("Connecting to browser with WebSocket endpoint...");

    const browser = await puppeteer.connect({
        browserWSEndpoint,
        defaultViewport: null,
    });

    console.log("Opening new page...");
    const page = await browser.newPage();

    console.log("Navigating to the game...");
    await page.goto(GAME_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
    });

    await page.waitForSelector("iframe.games-project-frame__item", {
        timeout: 60000,
    });

    const client = await page.target().createCDPSession();
    await client.send("Network.enable");
    console.log("Network monitoring enabled.");

    client.on("Network.webSocketFrameReceived", async ({ response }) => {
        const payloads = parseWebSocketPayload(response.payloadData);

        for (const payload of payloads) {
            if (!payload || typeof payload !== "object") continue;

            // Keep a schema-only trace of every parsed SignalR message.
            logEventShape(payload);

            if (payload.type !== 1 || payload.target !== "OnCrash") continue;

            const crash = payload.arguments?.[0];
            if (!crash || crash.l === undefined || crash.f === undefined || crash.ts === undefined) {
                console.warn("OnCrash message did not contain the expected l/f/ts fields.");
                continue;
            }

            const roundId = String(crash.l);
            if (seenCrashRounds.has(roundId)) continue;
            seenCrashRounds.add(roundId);

            const multiplier = crash.f;
            const date = new Date(crash.ts);
            if (Number.isNaN(date.getTime())) {
                console.warn("Skipping OnCrash message with an invalid timestamp.");
                continue;
            }

            // Preserve the original one-hour adjustment used by the source project.
            const formattedTime = format(subHours(date, 1), "HH:mm");

            let scrapedData;
            try {
                scrapedData = await scrapeDivData(page);
            } catch (error) {
                console.error("Error scraping public game totals:", error.message);
                scrapedData = {
                    totalPlayers: "N/A",
                    totalBets: "N/A",
                    totalPrize: "N/A",
                };
            }

            const csvData = `${formattedTime},${scrapedData.totalPlayers},${scrapedData.totalBets},${multiplier},${scrapedData.totalPrize},${roundId}\n`;

            fs.appendFile("data.csv", csvData, (err) => {
                if (err) console.error("Could not append data.csv:", err.message);
                else console.log(`Saved crash result for round ${roundId}: ${multiplier}x`);
            });

            fs.appendFile("data.txt", `${multiplier}\n`, (err) => {
                if (err) console.error("Could not append data.txt:", err.message);
            });
        }
    });

    console.log("Capture is running. Press Ctrl+C to stop.");
    while (true) {
        await wait(1000);
    }
})().catch((error) => {
    console.error("Capture stopped because of an error:", error);
    process.exitCode = 1;
});
