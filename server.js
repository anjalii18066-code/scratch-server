const http = require("http"); 
const os = require("os"); 
const { WebSocketServer } = require("ws"); 
const userStages = {}; 
const userBroadcasts = {}; 
const userViewers = {}; // userId -> Set of WebSocket viewers 
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
 
  // POST stage image — scoped to user, push to all viewers via WebSocket 
  if (req.method === "POST" && url.startsWith("/stage")) { 
    if (!userId) { 
      res.writeHead(400); 
      res.end("Missing userId"); 
      return; 
    } 
 
    let body = ""; 
    req.on("data", chunk => { body += chunk; }); 
    req.on("end", () => { 
      try { 
        const data = JSON.parse(body); 
        userStages[userId] = data.image; 
 
        //    Push to all WebSocket viewers watching this user 
        if (userViewers[userId]) { 
          for (const ws of userViewers[userId]) { 
            if (ws.readyState === 1) { // 1 = OPEN 
              ws.send(data.image); 
            } 
          } 
        } 
 
        res.writeHead(200, { "Content-Type": "text/plain" }); 
        res.end("ok"); 
      } catch (e) { 
        res.writeHead(500); 
        res.end("Error"); 
      } 
    }); 
    return; 
  } 
 
  // GET latest image — scoped to user (fallback for non-WS) 
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
 
  // GET stage page — uses WebSocket for instant updates 
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0"> 
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
              max-width: 100vw; 
            } 
            #stage { 
              width: 100%; 
              height: auto; 
              aspect-ratio: 4/3; 
              object-fit: contain; 
              display: none; 
              border-radius: 8px; 
            } 
            #loader { 
              width: 100%; 
              aspect-ratio: 4/3; 
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
            @keyframes spin { to { transform: rotate(360deg); } } 
            #label { 
              margin-top: 12px; 
              font-size: 13px; 
              color: #888; 
            } 
            #status { 
              margin-top: 8px; 
              font-size: 11px; 
              color: #555; 
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
          <div id="status">Connecting...</div> 
 
          <script> 
            const img = document.getElementById("stage"); 
            const loader = document.getElementById("loader"); 
            const status = document.getElementById("status"); 
            let firstLoaded = false; 
 
            function connect() { 
              //    Connect via WebSocket — server pushes frames instantly 
              const protocol = location.protocol === "https:" ? "wss" : "ws"; 
              const ws = new WebSocket(protocol + "://" + location.host + "/ws?userId=${userId}"); 
 
              ws.onopen = function() { 
                status.textContent = "Connected — live"; 
                status.style.color = "#4C97FF"; 
              }; 
 
              ws.onmessage = function(event) { 
                //    New frame arrived — swap image instantly, no polling delay 
                const next = new Image(); 
                next.onload = function() { 
                  img.src = next.src; 
                  if (!firstLoaded) { 
                    firstLoaded = true; 
                    loader.style.display = "none"; 
                    img.style.display = "block"; 
                  } 
                }; 
                next.src = event.data; // base64 image directly from WebSocket 
              }; 
 
              ws.onclose = function() { 
                status.textContent = "Disconnected — reconnecting..."; 
                status.style.color = "#ff6b6b"; 
                //    Auto reconnect after 1 second 
                setTimeout(connect, 1000); 
              }; 
 
              ws.onerror = function() { 
                ws.close(); 
              }; 
            } 
 
            connect(); 
          </script> 
        </body> 
      </html> 
    `); 
    return; 
  } 
}); 
 
//    WebSocket server — handles viewer connections 
const wss = new WebSocketServer({ server }); 
 
wss.on("connection", (ws, req) => { 
  const queryString = req.url.includes("?") ? req.url.split("?")[1] : ""; 
  const params = new URLSearchParams(queryString); 
  const userId = params.get("userId"); 
 
  if (!userId) { 
    ws.close(); 
    return; 
  } 
 
  // Register this viewer under the userId 
  if (!userViewers[userId]) { 
    userViewers[userId] = new Set(); 
  } 
  userViewers[userId].add(ws); 
  console.log(`Viewer connected for ${userId}. Total: ${userViewers[userId].size}`); 
 
  //    Send the last known frame immediately so viewer doesn't wait 
  if (userStages[userId]) { 
    ws.send(userStages[userId]); 
  } 
 
  ws.on("close", () => { 
    userViewers[userId].delete(ws); 
    console.log(`Viewer disconnected for ${userId}. Total: ${userViewers[userId].size}`); 
  }); 
}); 
 
const PORT = process.env.PORT || 42001; 
server.listen(PORT, () => { 
  console.log("Server running on port", PORT); 
});
