"use strict";

// ------------------------------------------------------------
// HUB SSE (SERVER-SENT EVENTS)
//
// Mengelola koneksi klien HTTP SSE yang terbuka untuk pengiriman
// notifikasi real-time secara instan tanpa polling.
// Klien otomatis dibersihkan saat koneksi terputus.
// ------------------------------------------------------------

const clients = new Map(); // userId (number) -> Set of Express response objects

function addClient(userId, res) {
  const id = Number(userId);
  if (!id) return;
  if (!clients.has(id)) {
    clients.set(id, new Set());
  }
  clients.get(id).add(res);

  res.on("close", () => {
    const userClients = clients.get(id);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        clients.delete(id);
      }
    }
  });
}

function sendSseMessage(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (_) {}
}

function broadcastToUser(userId, event, data) {
  const id = Number(userId);
  const userClients = clients.get(id);
  if (!userClients || userClients.size === 0) return 0;

  let sent = 0;
  for (const res of userClients) {
    sendSseMessage(res, event, data);
    sent++;
  }
  return sent;
}

function broadcastToUsers(userIds, event, data) {
  let total = 0;
  for (const id of userIds) {
    total += broadcastToUser(id, event, data);
  }
  return total;
}

function clientCount(userId) {
  if (userId) {
    const set = clients.get(Number(userId));
    return set ? set.size : 0;
  }
  let total = 0;
  for (const set of clients.values()) {
    total += set.size;
  }
  return total;
}

module.exports = {
  addClient,
  sendSseMessage,
  broadcastToUser,
  broadcastToUsers,
  clientCount
};
