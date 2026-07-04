/**
 * WebRTC 信令服务器
 * ------------------------------------------------------------
 * 职责边界（重要）：
 *   本服务器只做“房间管理 + SDP/ICE Candidate 转发”，
 *   不接触、不缓存任何文件二进制数据 —— 文件始终走浏览器间的
 *   RTCDataChannel（P2P），信令服务器仅用于内网环境下双方
 *   “握手配对”。因此它的负载与文件大小无关，可放心部署在
 *   内网任意一台机器上（哪怕是树莓派）。
 *
 * 房间模型：
 *   一个 roomId 最多两个 peer（发送端 / 接收端）。
 *   第一个进入房间的是 "host"，第二个是 "guest"。
 *   guest 加入后，服务器通知双方 "ready"，由前端约定
 *   host 发起 Offer。
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }, // 内网环境，放开 CORS；生产环境请按需收紧
  maxHttpBufferSize: 1e6 // 信令消息很小（SDP/ICE），1MB 足够，防止被滥用来传大数据
});

// roomId -> Set<socket.id>
const rooms = new Map();

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

io.on('connection', (socket) => {
  let joinedRoom = null;

  socket.on('join-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('room-error', '房间号不合法');
      return;
    }
    const peers = rooms.get(roomId) || new Set();
    if (peers.size >= 2) {
      socket.emit('room-error', '房间已满（仅支持点对点两人房间）');
      return;
    }
    const role = peers.size === 0 ? 'host' : 'guest';
    peers.add(socket.id);
    rooms.set(roomId, peers);
    joinedRoom = roomId;
    socket.join(roomId);
    socket.emit('joined', { role, roomId });

    if (peers.size === 2) {
      // 双方都在，可以开始 WebRTC 协商
      io.to(roomId).emit('peer-ready');
    }
  });

  // 转发 SDP Offer / Answer / ICE Candidate，格式统一为 { type, payload }
  socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', data);
  });

  socket.on('leave-room', () => cleanup(socket, joinedRoom));

  socket.on('disconnect', () => cleanup(socket, joinedRoom));

  function cleanup(sock, roomId) {
    if (!roomId) return;
    const peers = rooms.get(roomId);
    if (peers) {
      peers.delete(sock.id);
      if (peers.size === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('peer-left');
      }
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[signaling-server] listening on http://0.0.0.0:${PORT}`);
});
