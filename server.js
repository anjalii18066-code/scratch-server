const http = require("http");
const os = require("os");

const userStages = {};
const userBroadcasts = {};

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
  const queryString = url.includes("?") ? url.split("?")[1] : "";
  const params = new URLSearchParams(queryString);
  const userId = params.get("userId");

  // GET broadcast — scoped to user
  if (url.startsWith("/get-broadcast")) {
    if (!userId) {
      res.writeHead(400);
      res.end("Missing userId");
      return;
    }

    const msg = userBroadcasts[userId] || "";

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: msg }));

    console.log("Sending to client:", msg);

    if (msg !== "") {
      setTimeout(() => {
        userBroadcasts[userId] = "";
      }, 120000);
    }
    return;
  }

  // SEND broadcast — scoped to user
  const broadcastMatch = url.match(/\/broadcast=([^?]+)/);
  if (broadcastMatch) {
    if (!userId) {
      res.writeHead(400);
      res.end("Missing userId");
      return;
    }

    const msg = broadcastMatch[1];
    userBroadcasts[userId] = msg;
    console.log(`Broadcast for ${userId}:`, msg);

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  // Server info
  if (url === "/server-info") {
    const data = {
      internalURL: "https://scratch-server-xniu.onrender.com/stage",
      externalURL: "https://scratch-server-xniu.onrender.com"
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
    return;
  }

  // POST stage image — scoped to user
  if (req.method === "POST" && url.startsWith("/stage")) {
    if (!userId) {
      res.writeHead(400);
      res.end("Missing userId");
      return;
    }

    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      const data = JSON.parse(body);
      userStages[userId] = data.image;
      console.log(`Stage updated for ${userId}`);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    return;
  }

  // GET latest image — scoped to user
  if (url.startsWith("/latest-image")) {
    if (!userId || !userStages[userId]) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, { "Content-Type": "image/jpeg" });
    const base64Data = userStages[userId].replace(/^data:image\/jpeg;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    res.end(buffer);
    return;
  }

  // GET stage page — scoped to user
  if (req.method === "GET" && url.startsWith("/stage")) {
    if (!userId) {
      res.writeHead(400);
      res.end("Missing userId");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <html>
        <head>
          <title>Scratch Live Stage</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              background: #1e1e1e;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              font-family: sans-serif;
              color: white;
            }
            #container {
              position: relative;
              width: 480px;
            }
            #stage {
              width: 480px;
              height: 360px;
              object-fit: contain;
              display: none;
              border-radius: 8px;
            }
            #loader {
              width: 480px;
              height: 360px;
              background: #2a2a2a;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-direction: column;
              gap: 12px;
              color: #aaa;
              font-size: 14px;
            }
            .spinner {
              width: 36px;
              height: 36px;
              border: 4px solid #444;
              border-top-color: #4C97FF;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            #label {
              margin-top: 12px;
              font-size: 13px;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div id="container">
            <div id="loader">
              <div class="spinner"></div>
              <span>Waiting for stage...</span>
            </div>
            <img id="stage" />
          </div>
          <div id="label">User: ${userId}</div>

          <script>
            const img = document.getElementById("stage");
            const loader = document.getElementById("loader");
            let firstLoaded = false;

            function loadNext() {
              const next = new Image();
              next.onload = function() {
                img.src = next.src;
                if (!firstLoaded) {
                  firstLoaded = true;
                  loader.style.display = "none";
                  img.style.display = "block";
                }
                setTimeout(loadNext, 500);
              };
              next.onerror = function() {
                setTimeout(loadNext, 500);
              };
              next.src = "/latest-image?userId=${userId}&t=" + Date.now();
            }

            loadNext();
          </script>
        </body>
      </html>
    `);
    return;
  }
});

const PORT = process.env.PORT || 42001;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});