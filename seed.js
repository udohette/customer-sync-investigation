const fs = require("node:fs");
const path = require("node:path");
const { syncCustomers } = require("./sync-engine");

function readJson(filename) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, filename), "utf8")
  );
}

function writeJson(filename, data) {
  fs.writeFileSync(
    path.join(__dirname, filename),
    JSON.stringify(data, null, 2) + "\n"
  );
}

const source = readJson("source-customers.json");
const config = readJson("sync-config.json");

const firstRun = syncCustomers(
  source,
  [],
  source.map((customer) => customer.customerId),
  config
);

// Simulate a retry after the original write was already committed.
const retry = syncCustomers(
  source,
  firstRun.records,
  ["C003"],
  config
);

const logs = [
  ...firstRun.events.map((event) => ({
    batchId: config.batchId,
    phase: "INITIAL_RUN",
    ...event
  })),
  ...retry.events.map((event) => ({
    batchId: config.batchId,
    phase: "RETRY",
    ...event
  }))
];

writeJson("destination-customers.json", retry.records);
writeJson("sync-log.json", logs);
writeJson("baseline-destination.json", retry.records);
writeJson("baseline-config.json", config);

console.log("Synthetic incident inputs created.");
console.log("Source records:", source.length);
console.log("Destination rows:", retry.records.length);
console.log("Log events:", logs.length);