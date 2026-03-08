const requiredMajor = 22;
const version = process.env.NODE_VERSION_OVERRIDE ?? process.versions.node;
const major = Number.parseInt(String(version).split(".")[0], 10);

if (!Number.isFinite(major) || major < requiredMajor) {
  console.error(`Node 22+ required (current: ${version})`);
  process.exit(1);
}

console.log(`Node runtime verified: ${version}`);
