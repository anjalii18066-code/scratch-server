const http = require("http");
const os = require("os");

let clients = [];
let stages = {};

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return "localhost";
}

const localIP = getLocalIP();

let broadcasts = {};
const server = http.createServer((req, res) => {

    console.log("Request received:", req.method, req.url);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = req.url;

// GET broadcast
if (req.url.startsWith("/get-broadcast")) {

    const params = new URL(req.url, "http://localhost");

    const room = params.searchParams.get("room");

    const msg = broadcasts[room] || "";

    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ message: msg }));

    return;
}

// SEND broadcast
if (req.url.startsWith("/broadcast")) {

    const params = new URL(req.url, "http://localhost");

    const room = params.searchParams.get("room");
    const msg = params.searchParams.get("msg");

    if (room && msg) {
        broadcasts[room] = msg;
        console.log("Broadcast from", room, ":", msg);
    }

    res.writeHead(200);
    res.end("OK");
    return;
}
// ✅ ADD THIS HERE 👇
if (url.startsWith("/server-info")) {

    const params = new URL(req.url, "http://localhost");
    const sessionId = params.searchParams.get("sessionId");

    const data = {
        internalURL: "https://scratch-server-xniu.onrender.com/stage?sessionId=" + sessionId,
        externalURL: "https://scratch-server-xniu.onrender.com"
    };

    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify(data));
    return;
}

    // ✅ POST stage image
    if (req.method === "POST" && url === "/stage") {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            const data = JSON.parse(body);
            const { image, sessionId } = data;

if (sessionId) {
    stages[sessionId] = image;
}

            console.log("Stage updated");

            res.writeHead(200, {"Content-Type":"text/plain"});
            res.end("ok");
        });

        return;
    }

    // ✅ GET latest image
    if (url.startsWith("/latest-image")) {

        const params = new URL(req.url, "http://localhost");
const sessionId = params.searchParams.get("sessionId");

const image = stages[sessionId];

if (!image) {
            res.writeHead(404);
            res.end();
            return;
        }

        res.writeHead(200, { "Content-Type": "image/png" });

        const base64Data = image.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");

        res.end(buffer);
        return;
    }

    // ✅ GET stage page
    if (req.method === "GET" && url === "/stage") {

        res.writeHead(200, {"Content-Type":"text/html"});

        res.end(`
<html>
<body>
<h2>Scratch Live Stage</h2>

<canvas id="stageCanvas" width="480" height="360"></canvas>

<script>
const params = new URLSearchParams(window.location.search);
const sessionId = params.get("sessionId");

const canvas = document.getElementById("stageCanvas");
const ctx = canvas.getContext("2d");

function updateFrame() {
    const img = new Image();

    img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    img.src = "/latest-image?sessionId=" + sessionId + "&t=" + Date.now();
}

setInterval(updateFrame, 50);
</script>

</body>
</html>
`);

        return;
    }

});

const PORT = process.env.PORT || 42001;

server.listen(PORT, () => {
    console.log("Server running");
});
