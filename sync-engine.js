function syncCustomers(source, destination, customerIds, config) {
  const records = structuredClone(destination);
  const events = [];

  for (const customerId of customerIds) {
    const customer = source.find((item) => item.customerId === customerId);

    if (!customer) {
      events.push({ customerId, action: "NOT_FOUND" });
      continue;
    }

    if (customer.status === "INACTIVE" && !config.runtime.includeInactive) {
      events.push({
        customerId,
        action: "SKIPPED",
        reason: "Inactive customers excluded by runtime configuration",
      });
      continue;
    }

    const mapped = {};

    for (const [sourceField, destinationField] of Object.entries(
      config.mapping,
    )) {
      mapped[destinationField] = customer[sourceField];
    }

    const key = config.rules.uniqueDestinationKey;
    const matches = records.filter((item) => item[key] === mapped[key]);

    if (config.runtime.writeMode === "upsert") {
      // Replace records for this customer only.
      // Existing duplicates are consolidated during recovery.
      for (let index = records.length - 1; index >= 0; index--) {
        if (records[index][key] === mapped[key]) {
          records.splice(index, 1);
        }
      }
    }

    records.push(mapped);

    events.push({
      customerId,
      action:
        config.runtime.writeMode === "upsert" && matches.length
          ? "REPLACED"
          : "INSERTED",
      previousMatches: matches.length,
      writeMode: config.runtime.writeMode,
    });
  }

  return { records, events };
}

module.exports = { syncCustomers };
