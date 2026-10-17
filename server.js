const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { syncCustomers } = require("./sync-engine");

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, filename), "utf8"));
}

function writeJson(filename, data) {
  fs.writeFileSync(
    path.join(__dirname, filename),
    JSON.stringify(data, null, 2) + "\n",
  );
}

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3000");

  try {
    const routes = {
      "/source": "source-customers.json",
      "/destination": "destination-customers.json",
      "/logs": "sync-log.json",
      "/config": "sync-config.json",
    };

    if (req.method === "GET" && routes[url.pathname]) {
      return send(res, 200, readJson(routes[url.pathname]));
    }

    if (req.method === "POST" && url.pathname === "/replay") {
      let body = "";

      for await (const chunk of req) {
        body += chunk;
        if (body.length > 10000) {
          return send(res, 413, { error: "Request too large" });
        }
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return send(res, 400, { error: "Invalid JSON body" });
      }

      const customerIds = payload?.customerIds;
      const source = readJson("source-customers.json");

      if (
        !Array.isArray(customerIds) ||
        customerIds.length === 0 ||
        customerIds.some(
          (id) =>
            typeof id !== "string" ||
            !source.some((customer) => customer.customerId === id),
        ) ||
        new Set(customerIds).size !== customerIds.length
      ) {
        return send(res, 400, {
          error: "Provide a nonempty array of unique, known customerIds",
        });
      }

      const config = readJson("sync-config.json");
      const destination = readJson("destination-customers.json");

      const result = syncCustomers(source, destination, customerIds, config);

      const logs = readJson("sync-log.json");
      const replayId = require("node:crypto").randomUUID();

      logs.push(
        ...result.events.map((event) => ({
          batchId: config.batchId,
          replayId,
          timestamp: new Date().toISOString(),
          phase: "MANUAL_REPLAY",
          ...event,
        })),
      );

      writeJson("destination-customers.json", result.records);
      writeJson("sync-log.json", logs);

      return send(res, 200, {
        replayId,
        requestedCustomerIds: customerIds,
        events: result.events,
        destinationRows: result.records.length,
        uniqueCustomers: new Set(
          result.records.map((record) => record.externalId),
        ).size,
      });
    }

    send(res, 404, { error: "Route not found" });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: "Local service error; check terminal" });
  }
});

server.listen(3000, "127.0.0.1", () => {
  console.log("Customer sync service: http://127.0.0.1:3000");
});
