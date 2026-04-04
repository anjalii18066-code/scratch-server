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
 
  //    GET broadcast — scoped to user 
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
      }, 2000); 
    } 
    return; 
  } 
 
  //    SEND broadcast — scoped to user 
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
 
  //    Server info 
  if (url === "/server-info") { 
    const data = { 
      internalURL: "https://scratch-server-xniu.onrender.com/stage", 
      externalURL: "https://scratch-server-xniu.onrender.com" 
    }; 
    res.writeHead(200, { "Content-Type": "application/json" }); 
    res.end(JSON.stringify(data)); 
    return; 
  } 
 
  //    POST stage image — scoped to user 
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
 
  //    GET latest image — scoped to user 
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
 
  //    GET stage page — scoped to user 
  if (req.method === "GET" && url.startsWith("/stage")) { 
    if (!userId) { 
      res.writeHead(400); 
      res.end("Missing userId"); 
      return; 
    } 
 
    res.writeHead(200, { "Content-Type": "text/html" }); 
    res.end(` 
      <html> 
        <body> 
          <h2>Scratch Live Stage (User: ${userId})</h2> 
          <img id="stage" width="480"/> 
          <script> 
            setInterval(() => { 
              document.getElementById("stage").src = "/latest-image?userId=${userId}&t=" + 
Date.now(); 
            }, 500); 
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
